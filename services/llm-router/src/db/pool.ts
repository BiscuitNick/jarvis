import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const maxConnections = parseInt(process.env.PGPOOL_MAX_LLM || '4', 10);
    const idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT_MS || '10000', 10);
    const connectionTimeoutMillis = parseInt(process.env.PG_CONN_TIMEOUT_MS || '2000', 10);

    pool = new Pool({
      connectionString: databaseUrl,
      max: maxConnections,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      allowExitOnIdle: true,
      application_name: 'jarvis-llm-router',
    });

    pool.on('error', (err) => {
      console.error('[llm-router] Unexpected database error:', err);
    });

    console.log(`[llm-router] Database pool initialized (max: ${maxConnections})`);
  }

  return pool;
}

export async function connectWithRetry(maxRetries = 3, baseDelayMs = 200): Promise<void> {
  const retries = parseInt(process.env.PG_CONNECT_RETRIES || String(maxRetries), 10);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const currentPool = getPool();
      const client = await currentPool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('[llm-router] Database connection successful');
      return;
    } catch (error) {
      console.error(`[llm-router] Database connection attempt ${attempt}/${retries} failed:`, error);

      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[llm-router] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed to connect to database after ${retries} attempts`);
      }
    }
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    console.log('[llm-router] Closing database pool...');
    await pool.end();
    pool = null;
    console.log('[llm-router] Database pool closed');
  }
}
