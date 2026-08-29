import * as bcrypt from 'bcrypt';
import { db } from './database';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface UserProfile {
  id: string;
  memberId: string;
  qrCodeId: string;
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  age?: number;
  barangay?: string;
  profilePhotoUrl?: string;
  walletBalance: number;
  ecoPoints: number;
  co2ReducedKg: number;
  totalEarnings: number;
  lastLoginAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRegistrationInput {
  memberId: string;
  fullName: string;
  phoneNumber?: string;
  emailAddress?: string;
  pinCode?: string;
  age?: number;
  barangay?: string;
  profilePhotoUrl?: string;
}

export interface UserLoginInput {
  credential: string;
  pinCode: string;
}

export interface WalletUpdateResult {
  previousBalance: number;
  newBalance: number;
  amountChanged: number;
}

// ============================================
// USER SERVICE CLASS
// ============================================

export class UserService {
  /**
   * Find user by memberId, phoneNumber, or email
   */
  async findUserByCredential(credential: string): Promise<any | null> {
    try {
      const query = `
        SELECT * FROM users
        WHERE memberId = $1 OR phoneNumber = $1 OR emailAddress = $1
        LIMIT 1
      `;
      const result = await db.queryOne(query, [credential]);
      return result;
    } catch (error) {
      console.error('Error finding user:', error);
      throw new Error(`Failed to find user: ${error}`);
    }
  }

  /**
   * Register a new user (alias for createUser used by server.ts)
   */
  async createUser(input: any): Promise<UserProfile> {
    return this.registerUser(input);
  }

  /**
   * Register a new user
   */
  async registerUser(input: UserRegistrationInput): Promise<UserProfile> {
    try {
      this.validateUserInput(input);

      // Check if user already exists
      const existingUser = await this.findUserByCredential(input.memberId);
      if (existingUser) {
        throw new Error('User already exists with this member ID');
      }

      // Generate qrCodeId
      const qrCodeId = `QR-${input.memberId}`;

      // Hash PIN if provided
      let pinCodeHash: string | null = null;
      if (input.pinCode) {
        pinCodeHash = await this.hashPin(input.pinCode);
      }

      // Create user
      const query = `
        INSERT INTO users (
          memberId, qrCodeId, fullName, phoneNumber, emailAddress, pinCodeHash,
          walletBalance, totalLifetimeEarnings, ecoPoints, co2ReducedKg,
          age, barangay, profilePhotoUrl
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const newUser = await db.queryOne(query, [
        input.memberId,
        qrCodeId,
        input.fullName,
        input.phoneNumber || null,
        input.emailAddress || null,
        pinCodeHash,
        0.0, // wallet_balance
        0.0, // total_lifetime_earnings
        0,   // eco_points
        0.0, // co2_reduction_kg
        input.age || null,
        input.barangay || null,
        input.profilePhotoUrl || null
      ]);

      return this.formatUserProfile(newUser);
    } catch (error) {
      console.error('Error registering user:', error);
      throw new Error(`User registration failed: ${error}`);
    }
  }

  /**
   * Login user with credential and PIN
   */
  async loginUser(credential: string, pinCode: string): Promise<UserProfile | null> {
    try {
      const user = await this.findUserByCredential(credential);
      if (!user) {
        return null;
      }

      if (!user.pinCodeHash) {
        throw new Error('User does not have a PIN set');
      }

      const isValid = await bcrypt.compare(pinCode, user.pinCodeHash);
      if (!isValid) {
        return null;
      }

      await db.query(`UPDATE users SET lastLoginAt = NOW() WHERE id = $1`, [user.id]);

      return this.formatUserProfile(user);
    } catch (error) {
      console.error('Error logging in:', error);
      throw new Error(`Login failed: ${error}`);
    }
  }

  /**
   * Get user by ID (alias used by server.ts)
   */
  async getUserById(userId: string): Promise<UserProfile | null> {
    try {
      const user = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [userId]);
      if (!user) return null;
      return this.formatUserProfile(user);
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      return null;
    }
  }

  /**
   * Verify user PIN code
   */
  async verifyPin(userId: string, pinCode: string): Promise<boolean> {
    try {
      const query = `SELECT * FROM users WHERE id = $1`;
      const user = await db.queryOne(query, [userId]);

      if (!user || !user.pinCodeHash) {
        throw new Error('User not found or PIN not set');
      }

      const isValid = await bcrypt.compare(pinCode, user.pinCodeHash);

      if (isValid) {
        const updateQuery = `UPDATE users SET lastLoginAt = NOW() WHERE id = $1`;
        await db.query(updateQuery, [userId]);
      }

      return isValid;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      throw new Error(`PIN verification failed: ${error}`);
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      const query = `SELECT * FROM users WHERE id = $1`;
      const user = await db.queryOne(query, [userId]);

      if (!user) {
        throw new Error('User not found');
      }

      return this.formatUserProfile(user);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw new Error(`Failed to fetch user profile: ${error}`);
    }
  }

  /**
   * Update wallet balance atomically
   */
  async updateWalletBalance(
    userId: string,
    amount: number,
    type: 'DEPOSIT' | 'REDEMPTION' | 'REFUND'
  ): Promise<WalletUpdateResult> {
    try {
      return await db.transaction(async (client) => {
        // Get current balance
        const userQuery = `SELECT walletBalance, totalLifetimeEarnings FROM users WHERE id = $1`;
        const result = await client.query(userQuery, [userId]);

        if (result.rows.length === 0) {
          throw new Error('User not found');
        }

        const previousBalance = parseFloat(result.rows[0].walletBalance);
        const newBalance = previousBalance + amount;

        // Validate balance
        if (newBalance < 0) {
          throw new Error('Insufficient wallet balance');
        }

        // Update wallet
        const updateQuery = `
          UPDATE users
          SET walletBalance = $2,
              totalLifetimeEarnings = $3
          WHERE id = $1
        `;

        const newEarnings = type === 'DEPOSIT'
          ? parseFloat(result.rows[0].totalLifetimeEarnings) + amount
          : parseFloat(result.rows[0].totalLifetimeEarnings);

        await client.query(updateQuery, [userId, newBalance, newEarnings]);

        return {
          previousBalance,
          newBalance,
          amountChanged: amount
        };
      });
    } catch (error) {
      console.error('Error updating wallet balance:', error);
      throw new Error(`Failed to update wallet balance: ${error}`);
    }
  }

  /**
   * Update eco metrics
   */
  async updateEcoMetrics(
    userId: string,
    ecoPoints: number,
    co2ReductionKg: number
  ): Promise<any> {
    try {
      const query = `
        UPDATE users
        SET ecoPoints = ecoPoints + $2,
            co2ReducedKg = co2ReducedKg + $3
        WHERE id = $1
        RETURNING *
      `;

      const result = await db.queryOne(query, [userId, ecoPoints, co2ReductionKg]);
      return result;
    } catch (error) {
      console.error('Error updating eco metrics:', error);
      throw new Error(`Failed to update eco metrics: ${error}`);
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    userId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<any> {
    try {
      const skip = (page - 1) * pageSize;

      const query = `
        SELECT * FROM transaction_history
        WHERE userId = $1
        ORDER BY createdAt DESC
        LIMIT $2 OFFSET $3
      `;

      const transactions = await db.query(query, [userId, pageSize, skip]);
      return { transactions, totalCount: transactions.length };
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      throw new Error(`Failed to fetch transaction history: ${error}`);
    }
  }

  /**
   * Update PIN code
   */
  async updatePinCode(userId: string, newPinCode: string): Promise<void> {
    try {
      this.validatePinCode(newPinCode);

      const pinCodeHash = await this.hashPin(newPinCode);

      const query = `UPDATE users SET pinCodeHash = $2 WHERE id = $1`;
      await db.query(query, [userId, pinCodeHash]);
    } catch (error) {
      console.error('Error updating PIN code:', error);
      throw new Error(`Failed to update PIN code: ${error}`);
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      const query = `UPDATE users SET isActive = false WHERE id = $1`;
      await db.query(query, [userId]);
    } catch (error) {
      console.error('Error deactivating user:', error);
      throw new Error(`Failed to deactivate user: ${error}`);
    }
  }

  /**
   * Reactivate user account
   */
  async reactivateUser(userId: string): Promise<void> {
    try {
      const query = `UPDATE users SET isActive = true WHERE id = $1`;
      await db.query(query, [userId]);
    } catch (error) {
      console.error('Error reactivating user:', error);
      throw new Error(`Failed to reactivate user: ${error}`);
    }
  }

  /**
   * Get user with stats (used by userRoutes.ts)
   */
  async getUserWithStats(userId: string): Promise<any> {
    try {
      const user = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [userId]);
      if (!user) {
        throw new Error('User not found');
      }
      return this.formatUserProfile(user);
    } catch (error) {
      console.error('Error fetching user with stats:', error);
      throw new Error(`Failed to fetch user with stats: ${error}`);
    }
  }

  /**
   * Get user stats (used by userRoutes.ts)
   */
  async getUserStats(userId: string): Promise<any> {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT ds.id) as total_sessions,
          COUNT(di.id) as total_items,
          SUM(CASE WHEN di.status = 'ACCEPTED' THEN 1 ELSE 0 END) as accepted_items,
          SUM(CASE WHEN di.status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_items,
          SUM(CASE WHEN di.status = 'ACCEPTED' THEN di.weightGrams ELSE 0 END) as total_weight_grams,
          SUM(CASE WHEN di.status = 'ACCEPTED' THEN di.payoutAmount ELSE 0 END) as total_payout,
          SUM(CASE WHEN di.status = 'ACCEPTED' THEN di.ecoPoints ELSE 0 END) as total_eco_points
        FROM users u
        LEFT JOIN deposit_sessions ds ON ds.userId = u.id
        LEFT JOIN deposited_items di ON di.sessionId = ds.id
        WHERE u.id = $1
        GROUP BY u.id
      `;
      const result = await db.queryOne(query, [userId]);
      return result || {};
    } catch (error) {
      console.error('Error fetching user stats:', error);
      throw new Error(`Failed to fetch user stats: ${error}`);
    }
  }

  /**
   * Get deposit history (used by userRoutes.ts)
   */
  async getDepositHistory(userId: string, limit: number = 20): Promise<any[]> {
    try {
      const query = `
        SELECT * FROM deposit_sessions
        WHERE userId = $1
        ORDER BY createdAt DESC
        LIMIT $2
      `;
      return await db.query(query, [userId, limit]);
    } catch (error) {
      console.error('Error fetching deposit history:', error);
      throw new Error(`Failed to fetch deposit history: ${error}`);
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.fullName !== undefined) {
        fields.push(`fullName = $${paramIndex++}`);
        values.push(updates.fullName);
      }
      if (updates.phoneNumber !== undefined) {
        fields.push(`phoneNumber = $${paramIndex++}`);
        values.push(updates.phoneNumber);
      }
      if (updates.email !== undefined) {
        fields.push(`emailAddress = $${paramIndex++}`);
        values.push(updates.email);
      }
      if (updates.age !== undefined) {
        fields.push(`age = $${paramIndex++}`);
        values.push(updates.age);
      }
      if (updates.barangay !== undefined) {
        fields.push(`barangay = $${paramIndex++}`);
        values.push(updates.barangay);
      }
      if (updates.profilePhotoUrl !== undefined) {
        fields.push(`profilePhotoUrl = $${paramIndex++}`);
        values.push(updates.profilePhotoUrl);
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(userId);
      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      const updatedUser = await db.queryOne(query, values);

      if (!updatedUser) {
        throw new Error('User not found');
      }

      return this.formatUserProfile(updatedUser);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw new Error(`Failed to update user profile: ${error}`);
    }
  }

  /**
   * List all users (admin)
   */
  async listAllUsers(limit: number = 100, offset: number = 0): Promise<any[]> {
    try {
      const query = `
        SELECT id, memberId, qrCodeId, fullName, phoneNumber, emailAddress,
               walletBalance, totalLifetimeEarnings, ecoPoints, co2ReducedKg,
               isActive, createdAt, updatedAt
        FROM users
        ORDER BY createdAt DESC
        LIMIT $1 OFFSET $2
      `;
      return await db.query(query, [limit, offset]);
    } catch (error) {
      console.error('Error listing users:', error);
      throw new Error(`Failed to list users: ${error}`);
    }
  }

  /**
   * Get total user count (admin)
   */
  async getUserCount(): Promise<number> {
    try {
      const result = await db.queryOne(`SELECT COUNT(*) as count FROM users`);
      return parseInt(result.count);
    } catch (error) {
      console.error('Error getting user count:', error);
      throw new Error(`Failed to get user count: ${error}`);
    }
  }

  /**
   * Get total stats across all users (admin)
   */
  async getGlobalStats(): Promise<any> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_users,
          SUM(walletBalance) as total_wallet_balance,
          SUM(totalLifetimeEarnings) as total_lifetime_earnings,
          SUM(ecoPoints) as total_eco_points,
          SUM(co2ReducedKg) as total_co2_reduction_kg
        FROM users
        WHERE isActive = true
      `;
      return await db.queryOne(query);
    } catch (error) {
      console.error('Error getting global stats:', error);
      throw new Error(`Failed to get global stats: ${error}`);
    }
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private async hashPin(pinCode: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(pinCode, saltRounds);
  }

  private validateUserInput(input: UserRegistrationInput): void {
    if (!input.memberId || input.memberId.trim().length === 0) {
      throw new Error('Member ID is required');
    }

    if (!input.fullName || input.fullName.trim().length === 0) {
      throw new Error('Full name is required');
    }

    if (input.fullName.length > 255) {
      throw new Error('Name is too long (max 255 characters)');
    }

    if (input.phoneNumber) {
      this.validatePhoneNumber(input.phoneNumber);
    }

    if (input.emailAddress) {
      this.validateEmail(input.emailAddress);
    }

    if (input.pinCode) {
      this.validatePinCode(input.pinCode);
    }
  }

  private validatePhoneNumber(phoneNumber: string): void {
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    if (cleanPhone.length < 10 || cleanPhone.length > 12) {
      throw new Error('Invalid phone number format');
    }
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  private validatePinCode(pinCode: string): void {
    if (!pinCode || pinCode.length < 4) {
      throw new Error('PIN code must be at least 4 characters');
    }

    if (pinCode.length > 6) {
      throw new Error('PIN code must be at most 6 characters');
    }

    if (!/^\d+$/.test(pinCode)) {
      throw new Error('PIN code must contain only digits');
    }
  }

  private formatUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      memberId: user.memberId,
      qrCodeId: user.qrCodeId,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      email: user.emailAddress,
      age: user.age,
      barangay: user.barangay,
      profilePhotoUrl: user.profilePhotoUrl,
      walletBalance: parseFloat(user.walletBalance),
      ecoPoints: user.ecoPoints,
      co2ReducedKg: parseFloat(user.co2ReducedKg),
      totalEarnings: parseFloat(user.totalLifetimeEarnings),
      lastLoginAt: user.lastLoginAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}

export const userService = new UserService();
