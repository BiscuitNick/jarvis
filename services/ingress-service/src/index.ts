import express from 'express';
import { getPool, connectWithRetry, closePool } from './db/pool';
import { httpLogger, logger } from './utils/logger';
import { register as metricsRegister, httpRequestDuration } from './utils/metrics';
import MediaServer from './webrtc/MediaServer';
import { createGrpcServer } from './grpc/sessionService';
import { rateLimit } from './auth/middleware';

// Import routes
import authRoutes from './routes/auth';
import sessionRoutes from './routes/session';
import webrtcRoutes from './routes/webrtc';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const GRPC_PORT = parseInt(process.env.GRPC_PORT || '50051', 10);

let isDraining = false;
let grpcServer: any;

// Middleware
app.use(express.json());
app.use(httpLogger);

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString(),
        service: 'jarvis-ingress',
      },
      duration
    );
  });
  next();
});

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
    logger.error({ error }, 'Health check DB error');
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

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegister.contentType);
    const metrics = await metricsRegister.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error({ error }, 'Failed to generate metrics');
    res.status(500).end();
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis Ingress Service',
    version: '1.0.0',
    description: 'Handles WebRTC audio streaming and session control',
  });
});

// API routes
app.use('/api/auth', rateLimit(100, 60000), authRoutes);
app.use('/api/session', rateLimit(200, 60000), sessionRoutes);
app.use('/api/webrtc', rateLimit(500, 60000), webrtcRoutes);

let server: any;

async function start() {
  try {
    // Connect to database with retry
    await connectWithRetry();
    logger.info('Database connection established');

    // Initialize MediaServer
    const mediaServer = MediaServer.getInstance();
    await mediaServer.initialize();
    logger.info('MediaServer initialized');

    // Set up audio chunk handler (forward to ASR gateway)
    mediaServer.onAudioChunk(async (chunk) => {
      logger.debug({ sessionId: chunk.sessionId, size: chunk.data.length }, 'Audio chunk received');
      // TODO: Forward to ASR gateway service
      // This will be implemented when integrating with asr-gateway
    });

    // Start gRPC server
    grpcServer = createGrpcServer(GRPC_PORT);
    logger.info({ port: GRPC_PORT }, 'gRPC server initialized');

    // Start HTTP server
    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'HTTP server started');
      logger.info({ healthCheck: `http://localhost:${PORT}/healthz` }, 'Service endpoints ready');
      logger.info({ metrics: `http://localhost:${PORT}/metrics` }, 'Metrics available');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start service');
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');
  isDraining = true;

  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Stop accepting new connections
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }

    // Shutdown gRPC server
    if (grpcServer) {
      await new Promise<void>((resolve) => {
        grpcServer.tryShutdown(() => {
          logger.info('gRPC server closed');
          resolve();
        });
      });
    }

    // Shutdown MediaServer
    const mediaServer = MediaServer.getInstance();
    await mediaServer.shutdown();

    // Close database pool
    await closePool();

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
