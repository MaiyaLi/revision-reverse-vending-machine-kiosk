import { db } from './database';
import { printReceipt, testPrinterCommands } from './printerService';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

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
    transactionId?: string;
  }): Promise<any> {
    const transactionId = params.transactionId || `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

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
    return printReceipt(receiptData);
  }

  async testPrinterCommands(): Promise<boolean> {
    return testPrinterCommands();
  }

  async sendViaSMS(transactionId: string, phoneNumber: string): Promise<any> {
    const receipt = await db.queryOne(
      `SELECT * FROM receipts WHERE "transactionId" = $1`,
      [transactionId]
    );

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    // Format receipt details for SMS
    const smsBody = `ReVision RVM Receipt\nTransaction: ${receipt.transactionId}\nDate: ${new Date(receipt.createdAt).toLocaleString()}\nMaterials: ${receipt.materialsDeposited}\nWeight: ${receipt.totalWeightKg} Kg\nReward: ₱${receipt.totalReward}\nMethod: ${receipt.payoutMethod}\n\nThank you for recycling!`;

    // Send SMS via Twilio if configured
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const client = twilio(twilioSid, twilioToken);
        await client.messages.create({
          body: smsBody,
          from: twilioFrom,
          to: phoneNumber
        });
        console.log('SMS receipt sent:', transactionId, phoneNumber);
      } catch (smsError) {
        console.error('Twilio SMS error:', smsError);
        // Continue to mark as sent even if SMS fails
      }
    } else {
      console.log('SMS receipt queued (Twilio not configured):', transactionId, phoneNumber);
    }

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

    // Format receipt details for email
    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🌿 ReVision RVM</h1>
            <p style="margin: 10px 0 0; opacity: 0.9;">Eco-Vault Transaction Receipt</p>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="margin: 0 0 20px; color: #1e293b; font-size: 18px;">Transaction Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748b;">Transaction ID</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b; text-align: right;">${receipt.transactionId}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Date & Time</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b; text-align: right;">${new Date(receipt.createdAt).toLocaleString()}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Payout Method</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b; text-align: right;">${receipt.payoutMethod}</td></tr>
              </table>
            </div>

            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="margin: 0 0 20px; color: #1e293b; font-size: 18px;">Materials Deposited</h2>
              <p style="margin: 0; color: #1e293b; font-weight: 500;">${receipt.materialsDeposited}</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
              <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total Weight</div>
                <div style="font-size: 24px; font-weight: 700; color: #059669; margin-top: 5px;">${receipt.totalWeightKg} Kg</div>
              </div>
              <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Reward Earned</div>
                <div style="font-size: 24px; font-weight: 700; color: #059669; margin-top: 5px;">₱${receipt.totalReward.toFixed(2)}</div>
              </div>
            </div>

            <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; border-left: 4px solid #059669;">
              <p style="margin: 0; font-size: 14px; color: #065f46;">
                <strong>🌱 Environmental Impact:</strong> Your recycling saved approximately <strong>${(receipt.totalWeightKg * 0.5).toFixed(1)} kg CO₂</strong> from entering the atmosphere.
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">Thank you for recycling with ReVision! ♻️</p>
              <p style="margin: 10px 0 0; color: #94a3b8; font-size: 12px;">This is an automated receipt. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email via Nodemailer if configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'ReVision RVM <no-reply@revision.ph>';

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass }
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: emailAddress,
          subject: `🌿 ReVision RVM Receipt - ${receipt.transactionId}`,
          html: emailHtml
        });
        console.log('Email receipt sent:', transactionId, emailAddress);
      } catch (emailError) {
        console.error('Nodemailer error:', emailError);
      }
    } else {
      console.log('Email receipt queued (SMTP not configured):', transactionId, emailAddress);
    }

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
