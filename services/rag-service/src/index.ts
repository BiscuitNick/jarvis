import express from 'express';
import { getPool, connectWithRetry, closePool } from './db/pool';

const app = express();
const PORT = process.env.PORT || 8080;

let isDraining = false;

app.use(express.json());

// Health check endpoint
app.get('/healthz', async (req, res) => {
  if (isDraining) {
    return res.status(503).json({
      status: 'draining',
      service: 'rag-service',
      timestamp: new Date().toISOString(),
    });
  }

  let dbStatus = 'down';
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbStatus = 'up';
  } catch (error) {
    console.error('[rag-service] Health check DB error:', error);
  }

  const statusCode = dbStatus === 'up' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    service: 'rag-service',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis RAG Service',
    version: '1.0.0',
    description: 'Postgres + pgvector retrieval with citations',
  });
});

// Vector search endpoint (placeholder)
app.post('/search', (req, res) => {
  res.json({
    message: 'Vector search endpoint',
    status: 'implementation pending',
    note: 'Requires Postgres with pgvector extension',
  });
});

// Index document endpoint (placeholder)
app.post('/index', (req, res) => {
  res.json({ message: 'Document indexing endpoint - implementation pending' });
});

let server: any;

async function start() {
  try {
    // Connect to database with retry
    await connectWithRetry();

    server = app.listen(PORT, () => {
      console.log(`[rag-service] Running on port ${PORT}`);
      console.log(`[rag-service] Health check: http://localhost:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('[rag-service] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[rag-service] Received ${signal}, starting graceful shutdown...`);
  isDraining = true;

  const shutdownTimeout = setTimeout(() => {
    console.error('[rag-service] Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    if (server) {
      server.close(() => {
        console.log('[rag-service] HTTP server closed');
      });
    }

    await closePool();
    clearTimeout(shutdownTimeout);
    console.log('[rag-service] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[rag-service] Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
