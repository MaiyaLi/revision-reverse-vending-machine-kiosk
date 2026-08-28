import { db } from './database';

export class ReceiptService {
  async createReceipt(params: {
    sessionId: string;
    userId: string | null;
    materialsDeposited: string;
    totalWeightKg: number;
    totalReward: number;
    payoutMethod: string;
    payoutStatus: string;
  }): Promise<any> {
    const transactionId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

    const receipt = await db.queryOne(
      `INSERT INTO receipts (
        transaction_id, session_id, user_id, materials_deposited,
        total_weight_kg, total_reward, payout_method, payout_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        transactionId,
        params.sessionId,
        params.userId,
        params.materialsDeposited,
        params.totalWeightKg,
        params.totalReward,
        params.payoutMethod,
        params.payoutStatus
      ]
    );

    return receipt;
  }

  async getReceipt(transactionId: string): Promise<any> {
    return await db.queryOne(
      `SELECT * FROM receipts WHERE transaction_id = $1`,
      [transactionId]
    );
  }

  async printReceipt(transactionId: string): Promise<any> {
    const receipt = await db.queryOne(
      `UPDATE receipts
       SET printed_at = NOW(), printed_count = printed_count + 1
       WHERE transaction_id = $1
       RETURNING *`,
      [transactionId]
    );

    console.log('Receipt queued for printing:', transactionId);
    return receipt;
  }

  async sendViaSMS(transactionId: string, phoneNumber: string): Promise<any> {
    const receipt = await db.queryOne(
      `SELECT * FROM receipts WHERE transaction_id = $1`,
      [transactionId]
    );

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    console.log('SMS receipt queued:', transactionId, phoneNumber);

    await db.query(
      `UPDATE receipts SET sms_sent_at = NOW() WHERE transaction_id = $1`,
      [transactionId]
    );

    return receipt;
  }

  async sendViaEmail(transactionId: string, emailAddress: string): Promise<any> {
    const receipt = await db.queryOne(
      `SELECT * FROM receipts WHERE transaction_id = $1`,
      [transactionId]
    );

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    console.log('Email receipt queued:', transactionId, emailAddress);

    await db.query(
      `UPDATE receipts SET email_sent_at = NOW() WHERE transaction_id = $1`,
      [transactionId]
    );

    return receipt;
  }

  async getUserReceipts(userId: string, limit: number = 10): Promise<any[]> {
    return await db.query(
      `SELECT * FROM receipts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
  }
}

export const receiptService = new ReceiptService();
