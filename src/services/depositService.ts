import { db } from './database';
import { PoolClient } from 'pg';

export interface DepositItem {
  item_number: number;
  detected_material: string;
  item_name: string;
  weight_grams: number;
  payout_amount: number;
  eco_points: number;
  co2_reduction_kg: number;
  status: string;
  image_capture_url?: string;
  inductive_sensor_reading?: boolean;
  load_cell_reading_grams?: number;
  tof_distance_mm?: number;
  classification_confidence?: number;
}

export class DepositService {
  async createSession(userId: string | null): Promise<string> {
    const sessionRefId = `SES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await db.query(
      `INSERT INTO deposit_sessions (user_id, session_ref_id, status)
       VALUES ($1, $2, 'IN_PROGRESS')`,
      [userId, sessionRefId]
    );

    return sessionRefId;
  }

  async getSession(sessionRefId: string): Promise<any> {
    return await db.queryOne(
      `SELECT * FROM deposit_sessions WHERE session_ref_id = $1`,
      [sessionRefId]
    );
  }

  async addItem(
    sessionRefId: string,
    item: DepositItem,
    client?: PoolClient
  ): Promise<void> {
    const executeQuery = client
      ? (query: string, params: any[]) => client.query(query, params)
      : (query: string, params: any[]) => db.query(query, params);

    await executeQuery(
      `INSERT INTO deposited_items (
        session_id, item_number, detected_material, item_name, weight_grams,
        payout_amount, eco_points, co2_reduction_kg, status,
        image_capture_url, inductive_sensor_reading, load_cell_reading_grams,
        tof_distance_mm, classification_confidence
      )
      SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      FROM deposit_sessions WHERE session_ref_id = $1`,
      [
        sessionRefId,
        item.item_number,
        item.detected_material,
        item.item_name,
        item.weight_grams,
        item.payout_amount,
        item.eco_points,
        item.co2_reduction_kg,
        item.status,
        item.image_capture_url || null,
        item.inductive_sensor_reading || null,
        item.load_cell_reading_grams || null,
        item.tof_distance_mm || null,
        item.classification_confidence || null
      ]
    );
  }

  async completeSession(
    sessionRefId: string,
    userId: string | null
  ): Promise<any> {
    return await db.transaction(async (client) => {
      // Get session
      const sessionResult = await client.query(
        `SELECT * FROM deposit_sessions WHERE session_ref_id = $1`,
        [sessionRefId]
      );

      if (!sessionResult.rows[0]) {
        throw new Error('Session not found');
      }

      const sessionId = sessionResult.rows[0].id;

      // Calculate totals from items
      const totalsResult = await client.query(
        `SELECT
          COUNT(*) as total_items,
          SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) as accepted_items,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_items,
          SUM(CASE WHEN status = 'ACCEPTED' THEN weight_grams ELSE 0 END) as total_weight,
          SUM(CASE WHEN status = 'ACCEPTED' THEN payout_amount ELSE 0 END) as total_payout,
          SUM(CASE WHEN status = 'ACCEPTED' THEN eco_points ELSE 0 END) as total_eco_points,
          SUM(CASE WHEN status = 'ACCEPTED' THEN co2_reduction_kg ELSE 0 END) as total_co2
        FROM deposited_items WHERE session_id = $1`,
        [sessionId]
      );

      const totalsRow = totalsResult.rows[0];

      // Update session
      const updatedResult = await client.query(
        `UPDATE deposit_sessions
         SET status = 'COMPLETED',
             completed_at = NOW(),
             total_items_count = $2,
             accepted_items_count = $3,
             rejected_items_count = $4,
             total_weight_grams = $5,
             total_payout = $6,
             total_eco_points = $7,
             total_co2_reduction_kg = $8
         WHERE id = $1
         RETURNING *`,
        [
          sessionId,
          parseInt(totalsRow.total_items) || 0,
          parseInt(totalsRow.accepted_items) || 0,
          parseInt(totalsRow.rejected_items) || 0,
          parseInt(totalsRow.total_weight) || 0,
          parseFloat(totalsRow.total_payout) || 0,
          parseInt(totalsRow.total_eco_points) || 0,
          parseFloat(totalsRow.total_co2) || 0
        ]
      );

      // Update user wallet if user is logged in
      if (userId) {
        const payout = parseFloat(totalsRow.total_payout) || 0;
        const ecoPoints = parseInt(totalsRow.total_eco_points) || 0;

        if (payout > 0) {
          await client.query(
            `UPDATE users
             SET wallet_balance = wallet_balance + $2,
                 total_lifetime_earnings = total_lifetime_earnings + $2,
                 eco_points = eco_points + $3
             WHERE id = $1`,
            [userId, payout, ecoPoints]
          );

          // Log transaction
          await client.query(
            `INSERT INTO transaction_history (
              user_id, type, amount, details, eco_points_gained
            ) VALUES ($1, 'DEPOSIT', $2, $3, $4)`,
            [userId, payout, `Deposit from session ${sessionRefId}`, ecoPoints]
          );
        }
      }

      return updatedResult.rows[0];
    });
  }

  async getSessionItems(sessionRefId: string): Promise<DepositItem[]> {
    return await db.query(
      `SELECT di.* FROM deposited_items di
       JOIN deposit_sessions ds ON di.session_id = ds.id
       WHERE ds.session_ref_id = $1
       ORDER BY di.item_number ASC`,
      [sessionRefId]
    );
  }

  async abandonSession(sessionRefId: string): Promise<void> {
    await db.query(
      `UPDATE deposit_sessions
       SET status = 'ABANDONED', completed_at = NOW()
       WHERE session_ref_id = $1`,
      [sessionRefId]
    );
  }
}

export const depositService = new DepositService();
