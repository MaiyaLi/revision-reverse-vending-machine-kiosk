import { db } from './database';

const XENDIT_BASE_URL = 'https://api.xendit.co';
const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;

export class PayoutService {
  async createDisbursement(params: {
    sessionId: string;
    userId: string | null;
    amount: number;
    channel: 'GCASH' | 'MAYA';
    accountNumber: string;
    accountName: string;
  }): Promise<any> {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit API key not configured');
    }

    const externalId = `RVM-PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Validate inputs
    this.validatePhoneNumber(params.accountNumber, params.channel);
    this.validateAccountName(params.accountName);
    this.validateAmount(params.amount, params.channel);

    try {
      // Create transaction record FIRST (before calling Xendit)
      const payoutTx = await db.queryOne(
        `INSERT INTO payout_transactions (
          external_id, session_id, user_id, amount, channel,
          account_number, account_name, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
        RETURNING *`,
        [
          externalId,
          params.sessionId,
          params.userId,
          params.amount,
          params.channel,
          params.accountNumber,
          params.accountName
        ]
      );

      // Call Xendit API
      const xenditResponse = await this.callXenditAPI(
        '/disbursements',
        'POST',
        {
          external_id: externalId,
          amount: Math.round(params.amount * 100) / 100, // Ensure 2 decimals
          bank_code: params.channel,
          account_holder_name: params.accountName,
          account_number: params.accountNumber,
          description: `ReVision RVM Recycling Payout - ${externalId}`
        }
      );

      // Update with Xendit response
      const updated = await db.queryOne(
        `UPDATE payout_transactions
         SET xendit_id = $2, status = $3
         WHERE external_id = $1
         RETURNING *`,
        [
          externalId,
          xenditResponse.id,
          xenditResponse.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'
        ]
      );

      return updated;
    } catch (error: any) {
      // Mark as failed
      await db.queryOne(
        `UPDATE payout_transactions
         SET status = 'FAILED', failure_reason = $2
         WHERE external_id = $1
         RETURNING *`,
        [externalId, error.message]
      );
      throw error;
    }
  }

  async createPayoutLink(params: {
    sessionId: string;
    userId: string | null;
    amount: number;
  }): Promise<any> {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit API key not configured');
    }

    const externalId = `RVM-LINK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const payoutTx = await db.queryOne(
        `INSERT INTO payout_transactions (
          external_id, session_id, user_id, amount, channel, status
        ) VALUES ($1, $2, $3, $4, 'PAYOUT_LINK', 'PENDING')
        RETURNING *`,
        [externalId, params.sessionId, params.userId, params.amount]
      );

      const xenditResponse = await this.callXenditAPI(
        '/v2/payouts',
        'POST',
        {
          external_id: externalId,
          amount: Math.round(params.amount * 100) / 100,
          description: `ReVision RVM Recycling Payout - ${externalId}`,
          email: 'kiosk@revision-rvm.ph'
        },
        { 'Idempotency-key': externalId }
      );

      const updated = await db.queryOne(
        `UPDATE payout_transactions
         SET xendit_id = $2, payout_url = $3
         WHERE external_id = $1
         RETURNING *`,
        [externalId, xenditResponse.id, xenditResponse.payout_url]
      );

      return updated;
    } catch (error: any) {
      await db.queryOne(
        `UPDATE payout_transactions
         SET status = 'FAILED', failure_reason = $2
         WHERE external_id = $1
         RETURNING *`,
        [externalId, error.message]
      );
      throw error;
    }
  }

  async checkPayoutStatus(externalId: string): Promise<any> {
    const payout = await db.queryOne(
      `SELECT * FROM payout_transactions WHERE external_id = $1`,
      [externalId]
    );

    if (!payout) {
      throw new Error('Payout not found');
    }

    // If already completed/failed, return cached status
    if (payout.status !== 'PENDING') {
      return payout;
    }

    // Check with Xendit
    try {
      const xenditStatus = await this.callXenditAPI(
        `/disbursements?external_id=${externalId}`,
        'GET'
      );

      const disbursement = Array.isArray(xenditStatus) ? xenditStatus[0] : xenditStatus;

      if (disbursement.status === 'COMPLETED') {
        await db.query(
          `UPDATE payout_transactions
           SET status = 'COMPLETED', completed_at = NOW()
           WHERE external_id = $1`,
          [externalId]
        );
      } else if (disbursement.status === 'FAILED') {
        await db.query(
          `UPDATE payout_transactions
           SET status = 'FAILED', failure_code = $2, failure_reason = $3
           WHERE external_id = $1`,
          [externalId, disbursement.failure_code, disbursement.failure_reason]
        );
      }

      return await db.queryOne(
        `SELECT * FROM payout_transactions WHERE external_id = $1`,
        [externalId]
      );
    } catch (error) {
      console.error('Failed to check Xendit status:', error);
      return payout; // Return cached status on error
    }
  }

  async handleWebhook(event: any): Promise<void> {
    const externalId = event.external_id;
    const status = event.status;

    if (!externalId || !status) {
      throw new Error('Invalid webhook payload');
    }

    const payout = await db.queryOne(
      `SELECT * FROM payout_transactions WHERE external_id = $1`,
      [externalId]
    );

    if (!payout) {
      console.warn('Webhook for unknown payout:', externalId);
      return;
    }

    // Update status
    const newStatus = status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    await db.query(
      `UPDATE payout_transactions
       SET status = $2, completed_at = NOW(), failure_code = $3
       WHERE external_id = $1`,
      [externalId, newStatus, event.failure_code || null]
    );

    console.log(`Payout ${externalId} updated to ${newStatus}`);
  }

  async createCashDispense(params: {
    sessionId: string;
    userId: string | null;
    amount: number;
  }): Promise<any> {
    const externalId = `RVM-CASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const payout = await db.queryOne(
      `INSERT INTO payout_transactions (
        external_id, session_id, user_id, amount, channel, status
      ) VALUES ($1, $2, $3, $4, 'CASH', 'COMPLETED')
      RETURNING *`,
      [externalId, params.sessionId, params.userId, params.amount]
    );

    // Log transaction for cash dispensing
    if (params.userId) {
      await db.query(
        `INSERT INTO transaction_history (
          user_id, payout_id, type, amount, details
        ) VALUES ($1, $2, 'REDEMPTION', $3, $4)`,
        [params.userId, payout.id, -params.amount, `Cash dispensed - ${externalId}`]
      );
    }

    return payout;
  }

  private validatePhoneNumber(phone: string, channel: 'GCASH' | 'MAYA'): void {
    const cleanPhone = phone.replace(/\D/g, '');

    if (cleanPhone.length !== 12 || !cleanPhone.startsWith('63')) {
      throw new Error('Invalid Philippine phone number format. Use +63 or 09');
    }

    if (channel === 'GCASH' && cleanPhone[2] !== '9') {
      throw new Error('GCash requires mobile numbers (09xx...)');
    }
  }

  private validateAccountName(name: string): void {
    if (!name || name.trim().length < 3 || name.trim().length > 100) {
      throw new Error('Account holder name must be 3-100 characters');
    }

    if (!/^[a-zA-Z\s'-]+$/.test(name)) {
      throw new Error('Account name contains invalid characters');
    }
  }

  private validateAmount(amount: number, channel: 'GCASH' | 'MAYA'): void {
    const minAmount = 100;
    const maxGCash = 50000;
    const maxMaya = 100000;

    if (amount < minAmount) {
      throw new Error(`Minimum amount is ₱${minAmount}`);
    }

    if (channel === 'GCASH' && amount > maxGCash) {
      throw new Error(`GCash maximum is ₱${maxGCash}`);
    }

    if (channel === 'MAYA' && amount > maxMaya) {
      throw new Error(`Maya maximum is ₱${maxMaya}`);
    }
  }

  private async callXenditAPI(
    endpoint: string,
    method: string = 'GET',
    body?: any,
    additionalHeaders?: Record<string, string>
  ): Promise<any> {
    const authHeader = `Basic ${Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64')}`;

    const response = await fetch(`${XENDIT_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        ...additionalHeaders
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Xendit error: ${error.message || 'Unknown error'}`);
    }

    return await response.json();
  }
}

export const payoutService = new PayoutService();
