import { db } from './database';
import { PoolClient } from 'pg';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface DepositItem {
  itemNumber: number;
  detectedMaterial: string;
  itemName: string;
  weightGrams: number;
  payoutAmount: number;
  ecoPoints: number;
  co2ReductionKg: number;
  status: string;
  imageCaptureUrl?: string;
  inductiveSensorReading?: boolean;
  loadCellReadingGrams?: number;
  tofDistanceMm?: number;
  classificationConfidence?: number;
}

export class DepositService {
  async createSession(userId: string | null): Promise<string> {
    const sessionRefId = `SES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await db.query(
      `INSERT INTO deposit_sessions (id, "userId", "sessionRefId", status) VALUES ($1, $2, $3, 'IN_PROGRESS')`,
      [uuidv4(), userId, sessionRefId]
    );

    return sessionRefId;
  }

  async getSession(sessionRefId: string): Promise<any> {
    return await db.queryOne(
      `SELECT * FROM deposit_sessions WHERE "sessionRefId" = $1`,
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
        id, "sessionId", "itemNumber", "detectedMaterial", "itemName", "weightGrams",
        "payoutAmount", "ecoPoints", "co2ReductionKg", status,
        "imageCaptureUrl", "inductiveSensorReading", "loadCellReadingGrams",
        "tofDistanceMm", "classificationConfidence"
      )
      SELECT $1, id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      FROM deposit_sessions WHERE "sessionRefId" = $2`,
      [
        uuidv4(),
        sessionRefId,
        item.itemNumber,
        item.detectedMaterial,
        item.itemName,
        item.weightGrams,
        item.payoutAmount,
        item.ecoPoints,
        item.co2ReductionKg,
        item.status,
        item.imageCaptureUrl || null,
        item.inductiveSensorReading || null,
        item.loadCellReadingGrams || null,
        item.tofDistanceMm || null,
        item.classificationConfidence || null
      ]
    );
  }

  async completeSession(
    sessionRefId: string,
    userId: string | null
  ): Promise<any> {
    return await db.transaction(async (client) => {
      const sessionResult = await client.query(
        `SELECT * FROM deposit_sessions WHERE "sessionRefId" = $1`,
        [sessionRefId]
      );

      if (!sessionResult.rows[0]) {
        throw new Error('Session not found');
      }

      const sessionId = sessionResult.rows[0].id;

      const totalsResult = await client.query(
        `SELECT
          COUNT(*) as total_items,
          SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) as accepted_items,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_items,
          SUM(CASE WHEN status = 'ACCEPTED' THEN "weightGrams" ELSE 0 END) as total_weight,
          SUM(CASE WHEN status = 'ACCEPTED' THEN "payoutAmount" ELSE 0 END) as total_payout,
          SUM(CASE WHEN status = 'ACCEPTED' THEN "ecoPoints" ELSE 0 END) as total_eco_points,
          SUM(CASE WHEN status = 'ACCEPTED' THEN "co2ReductionKg" ELSE 0 END) as total_co2
        FROM deposited_items WHERE "sessionId" = $1`,
        [sessionId]
      );

      const totalsRow = totalsResult.rows[0];

      const updatedResult = await client.query(
        `UPDATE deposit_sessions
         SET status = 'COMPLETED',
             "completedAt" = NOW(),
             "totalItemsCount" = $2,
             "acceptedItemsCount" = $3,
             "rejectedItemsCount" = $4,
             "totalWeightGrams" = $5,
             "totalPayout" = $6,
             "totalEcoPoints" = $7,
             "totalCo2ReductionKg" = $8
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

      if (userId) {
        const payout = parseFloat(totalsRow.total_payout) || 0;
        const ecoPoints = parseInt(totalsRow.total_eco_points) || 0;

        if (payout > 0) {
          await client.query(
            `UPDATE users
             SET "walletBalance" = "walletBalance" + $2,
                 "totalLifetimeEarnings" = "totalLifetimeEarnings" + $2,
                 "ecoPoints" = "ecoPoints" + $3
             WHERE id = $1`,
            [userId, payout, ecoPoints]
          );

          await client.query(
            `INSERT INTO transaction_history (
              id, "userId", type, amount, details, "ecoPointsGained"
            ) VALUES ($1, $2, 'DEPOSIT', $3, $4, $5)`,
            [uuidv4(), userId, payout, `Deposit from session ${sessionRefId}`, ecoPoints]
          );
        }
      }

      return updatedResult.rows[0];
    });
  }

  async getSessionItems(sessionRefId: string): Promise<DepositItem[]> {
    return await db.query(
      `SELECT di.* FROM deposited_items di
       JOIN deposit_sessions ds ON di."sessionId" = ds.id
       WHERE ds."sessionRefId" = $1
       ORDER BY di."itemNumber" ASC`,
      [sessionRefId]
    );
  }

  async abandonSession(sessionRefId: string): Promise<void> {
    await db.query(
      `UPDATE deposit_sessions
       SET status = 'ABANDONED', "completedAt" = NOW()
       WHERE "sessionRefId" = $1`,
      [sessionRefId]
    );
  }
}

export const depositService = new DepositService();
