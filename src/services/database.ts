import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export class DatabaseService {
  private pool: Pool | null = null;
  private connected: boolean = false;

  private getPool(): Pool {
    if (!this.pool) {
      const connectionString = process.env.DATABASE_URL;

      let poolConfig: PoolConfig;
      if (connectionString) {
        poolConfig = { connectionString };
      } else {
        const password = process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '';
        poolConfig = {
          user: process.env.PGUSER || process.env.DB_USER || 'postgres',
          password: String(password),
          host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
          port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
          database: process.env.PGDATABASE || process.env.DB_NAME || 'revision_rvm',
        };
      }

      this.pool = new Pool({
        ...poolConfig,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (err) => {
        console.error('Unexpected error on idle database client:', err);
      });
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    try {
      const client = await this.getPool().connect();
      await client.query('SELECT NOW()');
      client.release();
      this.connected = true;
      console.log('✅ Database connected successfully');
    } catch (error) {
      this.connected = false;
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async query(text: string, params?: any[]): Promise<any[]> {
    try {
      const result = await this.getPool().query(text, params);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async queryOne(text: string, params?: any[]): Promise<any> {
    const results = await this.query(text, params);
    return results[0] || null;
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getClient(): Pool {
    return this.getPool();
  }
}

export const db = new DatabaseService();
