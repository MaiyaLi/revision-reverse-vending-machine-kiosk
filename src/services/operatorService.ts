import { db } from './database';
import nodemailer from 'nodemailer';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface OperatorPayoutRequest {
  id: string;
  referenceId: string;
  userId: string | null;
  sessionId: string | null;
  amount: number;
  channel: 'GCASH' | 'MAYA';
  recipientPhone: string;
  recipientName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  operatorNote: string | null;
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
}

const EXPIRY_MS = 5 * 60 * 1000;

function createTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('Email not sent (SMTP not configured):', subject);
    return false;
  }
  const from = process.env.SMTP_FROM || 'ReVision RVM <no-reply@revision.ph>';
  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log('Email sent to:', to, '-', subject);
    return true;
  } catch (e) {
    console.error('Email failed:', (e as Error).message);
    return false;
  }
}

function normalizeChannel(channel: string): 'GCASH' | 'MAYA' {
  const normalized = channel.toUpperCase();
  if (normalized !== 'GCASH' && normalized !== 'MAYA') {
    throw new Error('Unsupported payout channel');
  }
  return normalized;
}

function validatePhone(phone: string): void {
  if (!/^(?:09\d{9}|\+639\d{9})$/.test(phone)) {
    throw new Error('Invalid Philippine phone number format. Use 09XXXXXXXXX or +639XXXXXXXXXX');
  }
}

function validateAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    throw new Error('Payout amount must be greater than 0 and no more than ₱100,000');
  }
}

function validateRecipientName(name: string): void {
  if (!name || name.trim().length < 3 || name.trim().length > 255 || /[\r\n]/.test(name)) {
    throw new Error('Recipient name must be 3-255 characters');
  }
}

export class OperatorService {
  async requestPayout(params: {
    userId: string | null;
    sessionId?: string | null;
    amount: number;
    channel: string;
    recipientPhone: string;
    recipientName: string;
  }): Promise<OperatorPayoutRequest> {
    validateAmount(params.amount);
    validatePhone(params.recipientPhone);
    validateRecipientName(params.recipientName);
    const channel = normalizeChannel(params.channel);

    let referenceId = '';
    let record: any = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      referenceId = `OP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      try {
        record = await db.queryOne(
          `INSERT INTO operator_payout_requests (
            id, "referenceId", "userId", "sessionId", amount, channel,
            "recipientPhone", "recipientName", status, "expiresAt", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', NOW() + interval '5 minutes', NOW(), NOW())
          RETURNING *`,
          [
            uuidv4(),
            referenceId,
            params.userId || null,
            params.sessionId || null,
            params.amount,
            channel,
            params.recipientPhone,
            params.recipientName.trim()
          ]
        );
        break;
      } catch (error: any) {
        if (!error?.message?.includes('duplicate key') || attempt === 4) {
          throw error;
        }
      }
    }

    const approveUrl = `${process.env.APP_URL || 'http://localhost:3000'}/operator`;
    const message =
      `ReVision RVM Payout Request\n` +
      `Ref: ${referenceId}\n` +
      `Amount: ₱${params.amount.toFixed(2)}\n` +
      `To: ${params.recipientPhone} (${params.recipientName.trim()})\n` +
      `Channel: ${channel}\n` +
      `Approve: ${approveUrl}`;

    console.log('Operator payout notification:', message);

    const operatorEmail = process.env.OPERATOR_EMAIL;
    if (operatorEmail) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 22px;">ReVision RVM - Payout Approval Needed</h1>
            <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">A customer is waiting for an operator-assisted payout.</p>
          </div>
          <div style="background: #1e293b; color: #f1f5f9; padding: 28px; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px 0; color: #94a3b8;">Reference ID</td><td style="padding: 8px 0; font-weight: bold; font-family: monospace;">${referenceId}</td></tr>
              <tr><td style="padding: 8px 0; color: #94a3b8;">Amount</td><td style="padding: 8px 0; font-weight: bold; color: #34d399;">₱${params.amount.toFixed(2)}</td></tr>
              <tr><td style="padding: 8px 0; color: #94a3b8;">Send to</td><td style="padding: 8px 0; font-weight: bold;">${params.recipientPhone}</td></tr>
              <tr><td style="padding: 8px 0; color: #94a3b8;">Recipient</td><td style="padding: 8px 0; font-weight: bold;">${params.recipientName.trim()}</td></tr>
              <tr><td style="padding: 8px 0; color: #94a3b8;">Channel</td><td style="padding: 8px 0; font-weight: bold;">${channel}</td></tr>
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${approveUrl}" style="background: #f59e0b; color: #1e293b; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Open Operator Dashboard</a>
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b; text-align: center;">This request expires in 5 minutes. Do not reply to this email.</p>
          </div>
        </div>
      `;
      await sendEmail(operatorEmail, `ReVision RVM Payout Request - ${referenceId}`, html);
    }

    return this.formatRecord(record);
  }

  async listPending(): Promise<OperatorPayoutRequest[]> {
    await db.query(
      `UPDATE operator_payout_requests
       SET status = 'EXPIRED', "updatedAt" = NOW()
       WHERE status = 'PENDING' AND "expiresAt" <= NOW()`
    );

    const rows = await db.query(
      `SELECT * FROM operator_payout_requests
       WHERE status = 'PENDING' AND "expiresAt" > NOW()
       ORDER BY "createdAt" DESC`
    );
    return rows.map((r: any) => this.formatRecord(r));
  }

  async approve(referenceId: string, note?: string): Promise<OperatorPayoutRequest> {
    const record = await db.queryOne(
      `SELECT * FROM operator_payout_requests WHERE "referenceId" = $1`,
      [referenceId]
    );
    if (!record) {
      throw new Error('Payout request not found');
    }
    if (record.status !== 'PENDING') {
      throw new Error(`Payout already ${record.status.toLowerCase()}`);
    }
    if (new Date(record.expiresAt) < new Date()) {
      await db.query(
        `UPDATE operator_payout_requests SET status = 'EXPIRED', "updatedAt" = NOW() WHERE id = $1`,
        [record.id]
      );
      throw new Error('Payout request has expired');
    }

    return await db.transaction(async (client) => {
      const updatedResult = await client.query(
        `UPDATE operator_payout_requests
         SET status = 'APPROVED', "operatorNote" = $2, "resolvedAt" = NOW(), "updatedAt" = NOW()
         WHERE "referenceId" = $1
         RETURNING *`,
        [referenceId, note?.trim() || null]
      );
      const updated = updatedResult.rows[0];

      await client.query(
        `INSERT INTO payout_transactions (
          id, "externalId", "sessionId", "userId", amount, channel,
          "accountNumber", "accountName", status, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', NOW(), NOW())`,
        [
          uuidv4(),
          referenceId,
          record.sessionId || null,
          record.userId || null,
          record.amount,
          record.channel,
          record.recipientPhone,
          record.recipientName
        ]
      );

      return this.formatRecord(updated);
    });
  }

  async reject(referenceId: string, note?: string): Promise<OperatorPayoutRequest> {
    const record = await db.queryOne(
      `SELECT * FROM operator_payout_requests WHERE "referenceId" = $1`,
      [referenceId]
    );
    if (!record) {
      throw new Error('Payout request not found');
    }
    if (record.status !== 'PENDING') {
      throw new Error(`Payout already ${record.status.toLowerCase()}`);
    }
    if (new Date(record.expiresAt) < new Date()) {
      await db.query(
        `UPDATE operator_payout_requests SET status = 'EXPIRED', "updatedAt" = NOW() WHERE id = $1`,
        [record.id]
      );
      throw new Error('Payout request has expired');
    }

    const updated = await db.queryOne(
      `UPDATE operator_payout_requests
       SET status = 'REJECTED', "operatorNote" = $2, "resolvedAt" = NOW(), "updatedAt" = NOW()
       WHERE "referenceId" = $1
       RETURNING *`,
      [referenceId, note?.trim() || null]
    );
    return this.formatRecord(updated);
  }

  async getStatus(referenceId: string): Promise<OperatorPayoutRequest | null> {
    const record = await db.queryOne(
      `SELECT * FROM operator_payout_requests WHERE "referenceId" = $1`,
      [referenceId]
    );
    if (!record) return null;

    if (record.status === 'PENDING' && new Date(record.expiresAt) < new Date()) {
      const updated = await db.queryOne(
        `UPDATE operator_payout_requests
         SET status = 'EXPIRED', "updatedAt" = NOW()
         WHERE id = $1 AND status = 'PENDING'
         RETURNING *`,
        [record.id]
      );
      return updated ? this.formatRecord(updated) : this.formatRecord(record);
    }

    return this.formatRecord(record);
  }

  private formatRecord(r: any): OperatorPayoutRequest {
    return {
      id: r.id,
      referenceId: r.referenceId,
      userId: r.userId || null,
      sessionId: r.sessionId || null,
      amount: parseFloat(r.amount),
      channel: r.channel,
      recipientPhone: r.recipientPhone,
      recipientName: r.recipientName,
      status: r.status,
      operatorNote: r.operatorNote || null,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt || null
    };
  }
}

export const operatorService = new OperatorService();
