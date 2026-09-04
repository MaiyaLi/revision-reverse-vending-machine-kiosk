import { db } from './database';
import { printReceipt, testPrinterCommands } from './printerService';

export interface ReceiptData {
  items: Array<{
    name: string;
    material: string;
    weightGrams: number;
    points: number;
  }>;
  totalPoints: number;
  user?: {
    name: string;
    email?: string;
    phone?: string;
  };
  timestamp: string;
  transactionId: string;
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
        id, "transactionId", "sessionId", "userId", "materialsDeposited",
        "totalWeightKg", "totalReward", "payoutMethod", "payoutStatus"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        uuidv4(),
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
      `SELECT * FROM receipts WHERE "transactionId" = $1`,
      [transactionId]
    );
  }

  async printReceipt(transactionId: string): Promise<any> {
    const receipt = await db.queryOne(
      `SELECT * FROM receipts WHERE "transactionId" = $1`,
      [transactionId]
    );

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    const receiptData: ReceiptData = {
      items: [],
      totalPoints: 0,
      user: receipt.userId ? { name: 'Valued Customer' } : undefined,
      timestamp: receipt.createdAt,
      transactionId: receipt.transactionId,
    };

    await printReceipt(receiptData);

    await db.query(
      `UPDATE receipts SET "printedAt" = NOW(), "printedCount" = "printedCount" + 1 WHERE "transactionId" = $1`,
      [transactionId]
    );

    console.log('Receipt printed:', transactionId);
    return receipt;
  }

  async printReceiptData(receiptData: ReceiptData): Promise<boolean> {
    return await printReceipt(receiptData);
  }

  async testPrinterCommands(): Promise<boolean> {
    return await testPrinterCommands();
  }
}

  async sendViaSMS(transactionId: string, phoneNumber: string): Promise<any> {
    const receipt = await db.queryOne(
      `SELECT * FROM receipts WHERE "transactionId" = $1`,
      [transactionId]
    );

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    console.log('SMS receipt queued:', transactionId, phoneNumber);

    await db.query(
      `UPDATE receipts SET "smsSentAt" = NOW() WHERE "transactionId" = $1`,
      [transactionId]
    );

    return receipt;
  }

  async sendViaEmail(transactionId: string, emailAddress: string): Promise<any> {
    const receipt = await db.queryOne(
      `SELECT * FROM receipts WHERE "transactionId" = $1`,
      [transactionId]
    );

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    console.log('Email receipt queued:', transactionId, emailAddress);

    await db.query(
      `UPDATE receipts SET "emailSentAt" = NOW() WHERE "transactionId" = $1`,
      [transactionId]
    );

    return receipt;
  }

  async getUserReceipts(userId: string, limit: number = 10): Promise<any[]> {
    return await db.query(
      `SELECT * FROM receipts WHERE "userId" = $1 ORDER BY createdAt DESC LIMIT $2`,
      [userId, limit]
    );
  }
}

export const receiptService = new ReceiptService();
