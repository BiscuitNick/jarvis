"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.connectWithRetry = connectWithRetry;
exports.closePool = closePool;
const pg_1 = require("pg");
let pool = null;
function getPool() {
    if (!pool) {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        const maxConnections = parseInt(process.env.PGPOOL_MAX_RAG || '10', 10);
        const idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT_MS || '10000', 10);
        const connectionTimeoutMillis = parseInt(process.env.PG_CONN_TIMEOUT_MS || '2000', 10);
        pool = new pg_1.Pool({
            connectionString: databaseUrl,
            max: maxConnections,
            idleTimeoutMillis,
            connectionTimeoutMillis,
            allowExitOnIdle: true,
            application_name: 'jarvis-rag',
        });
        pool.on('error', (err) => {
            console.error('[rag-service] Unexpected database error:', err);
        });
        console.log(`[rag-service] Database pool initialized (max: ${maxConnections})`);
    }
    return pool;
}
async function connectWithRetry(maxRetries = 3, baseDelayMs = 200) {
    const retries = parseInt(process.env.PG_CONNECT_RETRIES || String(maxRetries), 10);
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const currentPool = getPool();
            const client = await currentPool.connect();
            await client.query('SELECT 1');
            client.release();
            console.log('[rag-service] Database connection successful');
            return;
        }
        catch (error) {
            console.error(`[rag-service] Database connection attempt ${attempt}/${retries} failed:`, error);
            if (attempt < retries) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1);
                console.log(`[rag-service] Retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            else {
                throw new Error(`Failed to connect to database after ${retries} attempts`);
            }
        }
    }
}
async function closePool() {
    if (pool) {
        console.log('[rag-service] Closing database pool...');
        await pool.end();
        pool = null;
        console.log('[rag-service] Database pool closed');
    }
}
//# sourceMappingURL=pool.js.map