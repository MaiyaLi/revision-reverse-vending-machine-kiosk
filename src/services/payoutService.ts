import { db } from './database';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class PayoutService {
  async createCashDispense(params: {
    sessionId?: string | null;
    userId: string | null;
    amount: number;
  }): Promise<any> {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Invalid payout amount');
    }

    const externalId = `RVM-CASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payout = await db.queryOne(
      `INSERT INTO payout_transactions (
        id, "externalId", "sessionId", "userId", amount, channel, status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'CASH', 'COMPLETED', NOW(), NOW())
      RETURNING *`,
      [uuidv4(), externalId, params.sessionId || null, params.userId, params.amount]
    );

    if (params.userId) {
      await db.query(
        `INSERT INTO transaction_history (
          id, "userId", "payoutId", type, amount, details, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, 'REDEMPTION', $4, $5, NOW(), NOW())`,
        [uuidv4(), params.userId, payout.id, -params.amount, `Cash dispensed - ${externalId}`]
      );
    }

    return payout;
  }
}

export const payoutService = new PayoutService();
