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
      service: 'ingress-service',
      timestamp: new Date().toISOString(),
    });
  }

  let dbStatus = 'down';
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbStatus = 'up';
  } catch (error) {
    console.error('[ingress-service] Health check DB error:', error);
  }

  const statusCode = dbStatus === 'up' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    service: 'ingress-service',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis Ingress Service',
    version: '1.0.0',
    description: 'Handles audio chunks and session control',
  });
});

// WebSocket audio ingestion endpoint (placeholder)
app.post('/audio/ingest', (req, res) => {
  res.json({ message: 'Audio ingestion endpoint - WebSocket implementation pending' });
});

// Session management
app.post('/session/create', (req, res) => {
  const sessionId = `session_${Date.now()}`;
  res.json({ sessionId, status: 'created' });
});

let server: any;

async function start() {
  try {
    // Connect to database with retry
    await connectWithRetry();

    server = app.listen(PORT, () => {
      console.log(`[ingress-service] Running on port ${PORT}`);
      console.log(`[ingress-service] Health check: http://localhost:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('[ingress-service] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[ingress-service] Received ${signal}, starting graceful shutdown...`);
  isDraining = true;

  const shutdownTimeout = setTimeout(() => {
    console.error('[ingress-service] Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    if (server) {
      server.close(() => {
        console.log('[ingress-service] HTTP server closed');
      });
    }

    await closePool();
    clearTimeout(shutdownTimeout);
    console.log('[ingress-service] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[ingress-service] Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
