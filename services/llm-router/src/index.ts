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
      service: 'llm-router',
      timestamp: new Date().toISOString(),
    });
  }

  let dbStatus = 'down';
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbStatus = 'up';
  } catch (error) {
    console.error('[llm-router] Health check DB error:', error);
  }

  const statusCode = dbStatus === 'up' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    service: 'llm-router',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis LLM Router',
    version: '1.0.0',
    description: 'Routes to frontier models (OpenAI, Anthropic)',
  });
});

// LLM completion endpoint (placeholder)
app.post('/complete', (req, res) => {
  res.json({
    message: 'LLM completion endpoint',
    providers: ['openai', 'anthropic', 'gemini'],
    status: 'implementation pending',
  });
});

// Streaming completion endpoint (placeholder)
app.post('/complete/stream', (req, res) => {
  res.json({ message: 'Streaming LLM endpoint - implementation pending' });
});

let server: any;

async function start() {
  try {
    // Connect to database with retry
    await connectWithRetry();

    server = app.listen(PORT, () => {
      console.log(`[llm-router] Running on port ${PORT}`);
      console.log(`[llm-router] Health check: http://localhost:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('[llm-router] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[llm-router] Received ${signal}, starting graceful shutdown...`);
  isDraining = true;

  const shutdownTimeout = setTimeout(() => {
    console.error('[llm-router] Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    if (server) {
      server.close(() => {
        console.log('[llm-router] HTTP server closed');
      });
    }

    await closePool();
    clearTimeout(shutdownTimeout);
    console.log('[llm-router] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[llm-router] Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
