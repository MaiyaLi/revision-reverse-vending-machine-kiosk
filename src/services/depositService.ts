import { db } from './database';
import { userService } from './userService';
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

interface InMemorySession {
  id: string;
  userId: string | null;
  sessionRefId: string;
  status: string;
  totalItemsCount: number;
  acceptedItemsCount: number;
  rejectedItemsCount: number;
  totalWeightGrams: number;
  totalPayout: number;
  totalEcoPoints: number;
  totalCo2ReductionKg: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: DepositItem[];
}

export class DepositService {
  private inMemorySessions: Map<string, InMemorySession> = new Map();

  private isDbAvailable(): boolean {
    return db.isConnected();
  }

  async createSession(userId: string | null): Promise<string> {
    const sessionRefId = `SES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (this.isDbAvailable()) {
      try {
        await db.query(
          `INSERT INTO deposit_sessions (id, "userId", "sessionRefId", status, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'IN_PROGRESS', NOW(), NOW())`,
          [uuidv4(), userId, sessionRefId]
        );
        return sessionRefId;
      } catch (error) {
        console.warn('Database error for session creation, falling back to in-memory:', (error as Error).message);
      }
    }

    const session: InMemorySession = {
      id: uuidv4(),
      userId,
      sessionRefId,
      status: 'IN_PROGRESS',
      totalItemsCount: 0,
      acceptedItemsCount: 0,
      rejectedItemsCount: 0,
      totalWeightGrams: 0,
      totalPayout: 0,
      totalEcoPoints: 0,
      totalCo2ReductionKg: 0,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: []
    };
    this.inMemorySessions.set(sessionRefId, session);
    return sessionRefId;
  }

  async getSession(sessionRefId: string): Promise<any> {
    if (this.isDbAvailable()) {
      try {
        const result = await db.queryOne(
          `SELECT * FROM deposit_sessions WHERE "sessionRefId" = $1`,
          [sessionRefId]
        );
        if (result) return result;
      } catch (error) {
        console.warn('Database error for getSession, falling back to in-memory:', (error as Error).message);
      }
    }

    return this.inMemorySessions.get(sessionRefId) || null;
  }

  async addItem(
    sessionRefId: string,
    item: DepositItem,
    client?: PoolClient
  ): Promise<void> {
    const executeQuery = client
      ? (query: string, params: any[]) => client.query(query, params)
      : (query: string, params: any[]) => db.query(query, params);

    if (this.isDbAvailable() && !client) {
      try {
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
        return;
      } catch (error) {
        console.warn('Database error for item add, falling back to in-memory:', (error as Error).message);
      }
    } else if (client) {
      try {
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
        return;
      } catch (error) {
        console.warn('Database error for item add (transactional), falling back to in-memory:', (error as Error).message);
      }
    }

    const session = this.inMemorySessions.get(sessionRefId);
    if (session) {
      session.items.push(item);
    }
  }

  async completeSession(
    sessionRefId: string,
    userId: string | null,
    payoutMethod: string = 'wallet'
  ): Promise<any> {
    if (this.isDbAvailable()) {
      try {
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

          const totalsRow = totalsResult.rows[0] || {};

          const totalItems = parseInt(totalsRow.total_items) || 0;
          const acceptedItems = parseInt(totalsRow.accepted_items) || 0;
          const rejectedItems = parseInt(totalsRow.rejected_items) || 0;
          const totalWeight = parseInt(totalsRow.total_weight) || 0;
          const totalPayout = parseFloat(totalsRow.total_payout) || 0;
          const totalEcoPoints = parseInt(totalsRow.total_eco_points) || 0;
          const totalCo2 = parseFloat(totalsRow.total_co2) || 0;

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
              totalItems,
              acceptedItems,
              rejectedItems,
              totalWeight,
              totalPayout,
              totalEcoPoints,
              totalCo2
            ]
          );

          if (userId && payoutMethod === 'wallet') {
            const ecoPoints = totalEcoPoints;

            if (totalPayout > 0) {
              await client.query(
                `UPDATE users
                 SET "walletBalance" = "walletBalance" + $2,
                     "totalLifetimeEarnings" = "totalLifetimeEarnings" + $2,
                     "ecoPoints" = "ecoPoints" + $3
                 WHERE id = $1`,
                [userId, totalPayout, ecoPoints]
              );

              await client.query(
                `INSERT INTO transaction_history (
                  id, "userId", type, amount, details, "ecoPointsGained", "createdAt", "updatedAt"
                ) VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, NOW(), NOW())`,
                [uuidv4(), userId, totalPayout, `Deposit from session ${sessionRefId}`, ecoPoints]
              );
            }
          }

          return updatedResult.rows[0];
        });
      } catch (error) {
        console.warn('Database error for completeSession, falling back to in-memory:', (error as Error).message);
      }
    }

    const session = this.inMemorySessions.get(sessionRefId);
    if (!session) {
      throw new Error('Session not found');
    }

    const acceptedItems = session.items.filter(i => i.status === 'ACCEPTED');
    const rejectedItems = session.items.filter(i => i.status !== 'ACCEPTED');

    session.totalItemsCount = session.items.length;
    session.acceptedItemsCount = acceptedItems.length;
    session.rejectedItemsCount = rejectedItems.length;
    session.totalWeightGrams = acceptedItems.reduce((sum, i) => sum + (i.weightGrams || 0), 0);
    session.totalPayout = acceptedItems.reduce((sum, i) => sum + (i.payoutAmount || 0), 0);
    session.totalEcoPoints = acceptedItems.reduce((sum, i) => sum + (i.ecoPoints || 0), 0);
    session.totalCo2ReductionKg = acceptedItems.reduce((sum, i) => sum + (i.co2ReductionKg || 0), 0);
    session.status = 'COMPLETED';
    session.completedAt = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    if (userId && payoutMethod === 'wallet' && session.totalPayout > 0) {
      await userService.updateWalletBalance(
        userId,
        session.totalPayout,
        'DEPOSIT',
        { details: `Deposit from session ${sessionRefId}` }
      );
    }

    this.inMemorySessions.delete(sessionRefId);

    return {
      id: session.id,
      userId: session.userId,
      sessionRefId: session.sessionRefId,
      status: session.status,
      totalItemsCount: session.totalItemsCount,
      acceptedItemsCount: session.acceptedItemsCount,
      rejectedItemsCount: session.rejectedItemsCount,
      totalWeightGrams: session.totalWeightGrams,
      totalPayout: session.totalPayout,
      totalEcoPoints: session.totalEcoPoints,
      totalCo2ReductionKg: session.totalCo2ReductionKg,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  async getSessionItems(sessionRefId: string): Promise<DepositItem[]> {
    if (this.isDbAvailable()) {
      try {
        const rows = await db.query(
          `SELECT di.* FROM deposited_items di
           JOIN deposit_sessions ds ON di."sessionId" = ds.id
           WHERE ds."sessionRefId" = $1
           ORDER BY di."itemNumber" ASC`,
          [sessionRefId]
        );
        if (rows.length > 0) return rows;
      } catch (error) {
        console.warn('Database error for getSessionItems, falling back to in-memory:', (error as Error).message);
      }
    }

    const session = this.inMemorySessions.get(sessionRefId);
    return session?.items || [];
  }

  async abandonSession(sessionRefId: string): Promise<void> {
    if (this.isDbAvailable()) {
      try {
        await db.query(
          `UPDATE deposit_sessions
           SET status = 'ABANDONED', "completedAt" = NOW()
           WHERE "sessionRefId" = $1`,
          [sessionRefId]
        );
        return;
      } catch (error) {
        console.warn('Database error for abandonSession, falling back to in-memory:', (error as Error).message);
      }
    }

    const session = this.inMemorySessions.get(sessionRefId);
    if (session) {
      session.status = 'ABANDONED';
      session.completedAt = new Date().toISOString();
    }
  }
}

export const depositService = new DepositService();
