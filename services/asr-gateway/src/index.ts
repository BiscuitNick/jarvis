import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { ASRProvider } from './providers/ASRProvider';
import { WebSocketConnectionManager } from './connection/WebSocketConnectionManager';
import { ASRProviderPool } from './connection/ASRProviderPool';
import { TranscriptionProcessor } from './processing/TranscriptionProcessor';
import { ProviderManager, ProviderConfig } from './providers/ProviderManager';
import { AudioProcessor } from './vad/AudioProcessor';
import { LatencyTracker } from './metrics/LatencyTracker';
import { WERCalculator } from './metrics/WERCalculator';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/transcribe/stream' });

const PORT = process.env.PORT || 8080;
const PRIMARY_ASR_PROVIDER = process.env.PRIMARY_ASR_PROVIDER || 'aws';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const ENABLE_MULTI_PROVIDER = process.env.ENABLE_MULTI_PROVIDER === 'true';
const ENABLE_VAD = process.env.ENABLE_VAD !== 'false'; // Enabled by default

// Configuration for connection management
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '100', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10);
const BUFFER_SIZE = parseInt(process.env.BUFFER_SIZE || '32768', 10); // 32KB for low latency
const MAX_PROVIDER_POOL_SIZE = parseInt(process.env.MAX_PROVIDER_POOL_SIZE || '10', 10);
const MIN_PROVIDER_POOL_SIZE = parseInt(process.env.MIN_PROVIDER_POOL_SIZE || '2', 10);

// Initialize connection manager
const connectionManager = new WebSocketConnectionManager({
  maxConnections: MAX_CONNECTIONS,
  heartbeatInterval: HEARTBEAT_INTERVAL,
  reconnectMaxAttempts: 5,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  connectionTimeout: 10000,
  bufferSize: BUFFER_SIZE,
});

// Initialize Provider Manager if multi-provider mode is enabled
let providerManager: ProviderManager | undefined;

if (ENABLE_MULTI_PROVIDER) {
  const providerConfigs: ProviderConfig[] = [
    {
      type: 'deepgram',
      priority: 1, // Highest priority
      enabled: !!process.env.DEEPGRAM_API_KEY,
      config: { apiKey: process.env.DEEPGRAM_API_KEY },
    },
    {
      type: 'aws',
      priority: 2,
      enabled: true,
      config: { region: AWS_REGION },
    },
    {
      type: 'google',
      priority: 3,
      enabled: !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_CLOUD_PROJECT,
    },
    {
      type: 'azure',
      priority: 4,
      enabled: !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
      config: {
        subscriptionKey: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION,
      },
    },
  ];

  providerManager = new ProviderManager({
    providers: providerConfigs,
    healthCheckInterval: 30000,
    errorThreshold: 5,
    confidenceThreshold: 0.7,
    werThreshold: 0.15,
    failoverDelay: 5000,
  });

  // Log provider manager events
  providerManager.on('provider:switched', ({ from, to, reason }) => {
    console.log(`[asr-gateway] Provider switched: ${from} -> ${to} (reason: ${reason})`);
  });

  providerManager.on('provider:unhealthy', ({ providerName }) => {
    console.warn(`[asr-gateway] Provider unhealthy: ${providerName}`);
  });

  providerManager.on('provider:recovered', ({ providerName }) => {
    console.log(`[asr-gateway] Provider recovered: ${providerName}`);
  });

  providerManager.on('provider:none-available', () => {
    console.error('[asr-gateway] No providers available!');
  });
}

// Initialize ASR provider pool
const providerPool = new ASRProviderPool({
  maxPoolSize: MAX_PROVIDER_POOL_SIZE,
  minPoolSize: MIN_PROVIDER_POOL_SIZE,
  acquireTimeout: 5000,
  idleTimeout: 60000,
  providerManager,
  providerType: PRIMARY_ASR_PROVIDER as any,
  providerRegion: AWS_REGION,
});

// Initialize transcription processor
const transcriptionProcessor = new TranscriptionProcessor({
  minConfidenceThreshold: parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.5'),
  aggregationWindowMs: parseInt(process.env.AGGREGATION_WINDOW_MS || '500', 10),
  maxPartialHistory: parseInt(process.env.MAX_PARTIAL_HISTORY || '10', 10),
  enableWordTimestamps: process.env.ENABLE_WORD_TIMESTAMPS !== 'false',
});

// Initialize metrics trackers
const latencyTracker = new LatencyTracker();
const werCalculator = new WERCalculator();

// Transcription processor event listeners
transcriptionProcessor.on('transcript:final', (processed) => {
  console.log(`[asr-gateway] Final transcript for ${processed.sessionId}: ${processed.transcript.substring(0, 50)}...`);
});

transcriptionProcessor.on('transcript:partial', (processed) => {
  console.log(`[asr-gateway] Partial transcript for ${processed.sessionId}: ${processed.transcript.substring(0, 30)}...`);
});

transcriptionProcessor.on('result:filtered', ({ sessionId, reason, confidence }) => {
  console.warn(`[asr-gateway] Result filtered for ${sessionId}: ${reason}, confidence: ${confidence}`);
});

// Connection manager event listeners
connectionManager.on('connection:registered', ({ connectionId, metadata }) => {
  console.log(`[asr-gateway] Connection registered: ${connectionId}`, metadata);
});

connectionManager.on('connection:heartbeat-timeout', ({ connectionId }) => {
  console.warn(`[asr-gateway] Heartbeat timeout for connection: ${connectionId}`);
});

connectionManager.on('connection:reconnecting', ({ connectionId, attempt, delay }) => {
  console.log(`[asr-gateway] Reconnecting ${connectionId}, attempt ${attempt}, delay ${delay}ms`);
});

connectionManager.on('connection:failed', ({ connectionId }) => {
  console.error(`[asr-gateway] Connection failed after max retries: ${connectionId}`);
});

// Provider pool event listeners
providerPool.on('provider:acquired', ({ id }) => {
  console.log(`[asr-gateway] Provider acquired: ${id}`);
});

providerPool.on('provider:released', ({ id }) => {
  console.log(`[asr-gateway] Provider released: ${id}`);
});

providerPool.on('pool:initialized', ({ size }) => {
  console.log(`[asr-gateway] Provider pool initialized with ${size} providers`);
});

app.use(express.json());

// WebSocket connection handler for streaming transcription
wss.on('connection', (ws: WebSocket) => {
  console.log('[asr-gateway] New WebSocket connection established');

  let provider: ASRProvider | null = null;
  let providerId: string | null = null;
  let connectionId: string | null = null;
  let sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  let audioProcessor: AudioProcessor | null = null;

  // Register connection with connection manager
  try {
    connectionId = connectionManager.registerConnection(ws, { sessionId });
  } catch (error) {
    console.error('[asr-gateway] Failed to register connection:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Maximum connections reached. Please try again later.',
    }));
    ws.close();
    return;
  }

  ws.on('message', async (data: Buffer) => {
    try {
      // Check if this is a control message (JSON) or audio data (binary)
      if (data[0] === 0x7B) { // '{' - likely JSON
        const message = JSON.parse(data.toString());

        if (message.action === 'start') {
          console.log(`[asr-gateway] Starting transcription session: ${sessionId}`);

          // Start latency tracking
          latencyTracker.startSession(sessionId);
          latencyTracker.startStage(sessionId, 'provider-acquisition');

          // Acquire provider from pool
          try {
            const pooled = await providerPool.acquire();
            provider = pooled.provider;
            providerId = pooled.id;
            sessionId = `session-${Date.now()}-${pooled.providerName.replace(/\s+/g, '-')}`;

            latencyTracker.endStage(sessionId, 'provider-acquisition');
          } catch (error) {
            console.error('[asr-gateway] Failed to acquire provider:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'No ASR providers available. Please try again later.',
            }));
            return;
          }

          // Create transcription session
          transcriptionProcessor.createSession(sessionId, provider.getName());

          // Initialize audio processor with VAD
          audioProcessor = new AudioProcessor({
            enableVAD: ENABLE_VAD,
            vadConfig: {
              sampleRate: message.sampleRate || 16000,
              energyThreshold: parseFloat(process.env.VAD_ENERGY_THRESHOLD || '0.01'),
              silenceThreshold: parseFloat(process.env.VAD_SILENCE_THRESHOLD || '0.005'),
              minSpeechDuration: parseInt(process.env.VAD_MIN_SPEECH_DURATION || '250', 10),
              minSilenceDuration: parseInt(process.env.VAD_MIN_SILENCE_DURATION || '500', 10),
              preSpeechPadding: parseInt(process.env.VAD_PRE_SPEECH_PADDING || '300', 10),
              postSpeechPadding: parseInt(process.env.VAD_POST_SPEECH_PADDING || '300', 10),
            },
            maxBufferSize: parseInt(process.env.VAD_MAX_BUFFER_SIZE || '1048576', 10),
            flushInterval: parseInt(process.env.VAD_FLUSH_INTERVAL || '100', 10),
            bypassVADOnStart: process.env.VAD_BYPASS_ON_START !== 'false',
          });

          // Set ASR provider for audio processor
          audioProcessor.setASRProvider(provider);

          // Handle VAD events
          audioProcessor.on('speech:start', (event) => {
            console.log(`[asr-gateway] Speech detected in session ${sessionId}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'vad',
                event: 'speech_start',
                timestamp: event.timestamp,
              }));
            }
          });

          audioProcessor.on('speech:end', (event) => {
            console.log(`[asr-gateway] Speech ended in session ${sessionId}, duration: ${event.speechDuration}ms`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'vad',
                event: 'speech_end',
                timestamp: event.timestamp,
                duration: event.speechDuration,
              }));
            }
          });

          audioProcessor.on('error', (error) => {
            console.error(`[asr-gateway] AudioProcessor error:`, error);
          });

          // Start streaming session
          latencyTracker.startStage(sessionId, 'asr-stream-start');

          await provider.startStream(
            (result) => {
              // Record first token latency
              latencyTracker.recordFirstToken(sessionId);
              latencyTracker.endStage(sessionId, 'asr-stream-start');

              // Process result through transcription processor
              const processed = transcriptionProcessor.processResult(
                sessionId,
                result,
                provider!.getName()
              );

              // Send processed transcription results back to client
              if (processed && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'transcript',
                  transcript: processed.transcript,
                  isFinal: processed.isFinal,
                  confidence: processed.confidence,
                  timestamp: processed.timestamp,
                  metadata: processed.metadata,
                }));

                // Record final result latency and metrics
                if (processed.isFinal) {
                  latencyTracker.recordFinalResult(sessionId);

                  // Get latency metrics for this session
                  const latencyMetrics = latencyTracker.getSessionMetrics(sessionId);
                  if (latencyMetrics) {
                    console.log(`[asr-gateway] Session ${sessionId} latency: first-token=${latencyMetrics.firstTokenLatency}ms, total=${latencyMetrics.totalLatency}ms`);
                  }
                }
              }
            },
            (error) => {
              console.error(`[asr-gateway] Transcription error:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: error.message,
                }));
              }

              // On error, remove provider from pool and get a new one
              if (providerId) {
                providerPool.remove(providerId, error);
                providerId = null;
                provider = null;
              }
            },
            {
              languageCode: message.languageCode || 'en-US',
              sampleRate: message.sampleRate || 16000,
            }
          );

          ws.send(JSON.stringify({
            type: 'status',
            status: 'started',
            sessionId,
            provider: provider.getName(),
            bufferSize: connectionManager.getBufferSize(),
          }));
        } else if (message.action === 'stop') {
          console.log(`[asr-gateway] Stopping transcription session: ${sessionId}`);

          // Flush any remaining audio in processor
          if (audioProcessor) {
            await audioProcessor.flush();
            audioProcessor.reset();
            audioProcessor = null;
          }

          if (provider && providerId) {
            await provider.endStream();

            // Get session stats to calculate average confidence
            const stats = transcriptionProcessor.getSessionStats(sessionId);
            const avgConfidence = stats?.averageConfidence ?? 0;

            providerPool.release(providerId, true, avgConfidence);
            provider = null;
            providerId = null;
          }

          // End transcription session and get stats
          const stats = transcriptionProcessor.getSessionStats(sessionId);
          transcriptionProcessor.endSession(sessionId);

          // End latency tracking
          const latencyMetrics = latencyTracker.endSession(sessionId);

          ws.send(JSON.stringify({
            type: 'status',
            status: 'stopped',
            stats,
            latency: latencyMetrics ? {
              firstToken: latencyMetrics.firstTokenLatency,
              total: latencyMetrics.totalLatency,
            } : undefined,
          }));
        } else if (message.action === 'calculate-wer' && message.reference && message.hypothesis) {
          // Calculate WER for quality assessment
          const werResult = werCalculator.calculate(message.reference, message.hypothesis);
          const providerName = provider?.getName() || 'unknown';

          werCalculator.recordWER(providerName, werResult);

          // Record WER with provider manager if available
          if (providerManager) {
            providerManager.recordWordErrorRate(providerName, werResult.wer);
          }

          ws.send(JSON.stringify({
            type: 'wer-result',
            wer: werResult.wer,
            details: werResult,
          }));
        } else if (message.action === 'ping') {
          // Handle explicit ping from client
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }));
        }
      } else {
        // Binary audio data
        if (!provider || !audioProcessor) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Session not started. Send {"action": "start"} first.',
          }));
          return;
        }

        // Send audio chunk through audio processor (with VAD if enabled)
        const bufferSize = connectionManager.getBufferSize();

        // If chunk is larger than buffer size, split it
        if (data.length > bufferSize) {
          for (let i = 0; i < data.length; i += bufferSize) {
            const chunk = data.slice(i, Math.min(i + bufferSize, data.length));
            await audioProcessor.processAudioChunk(chunk);
          }
        } else {
          await audioProcessor.processAudioChunk(data);
        }
      }
    } catch (error) {
      console.error(`[asr-gateway] WebSocket message error:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  });

  ws.on('close', async () => {
    console.log(`[asr-gateway] WebSocket connection closed: ${sessionId}`);

    // Clean up audio processor
    if (audioProcessor) {
      await audioProcessor.flush();
      audioProcessor.reset();
      audioProcessor = null;
    }

    // Clean up provider
    if (provider && providerId) {
      await provider.endStream();

      // Get session stats for provider health tracking
      const stats = transcriptionProcessor.getSessionStats(sessionId);
      providerPool.release(providerId, true, stats?.averageConfidence ?? 0);
      provider = null;
      providerId = null;
    }

    // End transcription session
    transcriptionProcessor.endSession(sessionId);

    // Unregister connection
    if (connectionId) {
      connectionManager.unregisterConnection(connectionId);
      connectionId = null;
    }
  });

  ws.on('error', (error) => {
    console.error(`[asr-gateway] WebSocket error:`, error);

    // Clean up audio processor
    if (audioProcessor) {
      audioProcessor.reset();
      audioProcessor = null;
    }

    // Clean up provider (mark as failure)
    if (provider && providerId) {
      provider.endStream().catch(console.error);
      providerPool.release(providerId, false);
      provider = null;
      providerId = null;
    }

    // End transcription session
    transcriptionProcessor.endSession(sessionId);
  });
});

// Health check endpoint with connection stats
app.get('/healthz', (req, res) => {
  const connectionStats = connectionManager.getStats();
  const poolStats = providerPool.getStats();

  res.status(200).json({
    status: 'healthy',
    service: 'asr-gateway',
    timestamp: new Date().toISOString(),
    connections: {
      active: connectionStats.activeConnections,
      total: connectionStats.totalConnections,
      failed: connectionStats.failedConnections,
    },
    providerPool: {
      size: poolStats.poolSize,
      inUse: poolStats.inUse,
      available: poolStats.available,
    },
  });
});

// Stats endpoint for detailed monitoring
app.get('/stats', (req, res) => {
  const connectionStats = connectionManager.getStats();
  const poolStats = providerPool.getStats();
  const processorStats = transcriptionProcessor.getStats();
  const providerManagerStats = providerManager?.getStats();

  res.json({
    connections: connectionStats,
    providerPool: poolStats,
    transcriptionProcessor: processorStats,
    providerManager: providerManagerStats,
    configuration: {
      maxConnections: MAX_CONNECTIONS,
      heartbeatInterval: HEARTBEAT_INTERVAL,
      bufferSize: BUFFER_SIZE,
      maxProviderPoolSize: MAX_PROVIDER_POOL_SIZE,
      minProviderPoolSize: MIN_PROVIDER_POOL_SIZE,
      multiProviderEnabled: ENABLE_MULTI_PROVIDER,
      vadEnabled: ENABLE_VAD,
    },
  });
});

// Metrics endpoint for performance monitoring
app.get('/metrics', (req, res) => {
  const latencyReport = latencyTracker.getLatencyReport();
  const werReport = werCalculator.getWERReport();
  const latencyStats = latencyTracker.getGlobalStats();
  const werStats = werCalculator.getGlobalStats();

  res.json({
    latency: {
      ...latencyReport,
      raw: latencyStats,
    },
    wer: {
      ...werReport,
      raw: werStats,
    },
    performance: {
      latencyTargetMet: latencyTracker.isLatencyTargetMet(),
      werAcceptable: werCalculator.isWERAcceptable(),
      overallHealth: latencyTracker.isLatencyTargetMet() && werCalculator.isWERAcceptable() ? 'good' : 'needs-improvement',
    },
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis ASR Gateway',
    version: '2.1.0',
    description: 'Streams to cloud ASR services (AWS Transcribe, Deepgram, Google, Azure) with advanced transcription processing',
    provider: PRIMARY_ASR_PROVIDER,
    features: [
      'WebSocket connection pooling',
      'Automatic reconnection with exponential backoff',
      'Connection health monitoring and heartbeat',
      'ASR provider connection pooling',
      'Real-time transcription result processing',
      'Partial and final result aggregation',
      'Confidence score tracking and filtering',
      'Session state management',
      'Multi-provider result normalization',
      'Optimized buffer sizes for low-latency streaming',
      'Graceful shutdown handling',
    ],
    endpoints: {
      health: '/healthz',
      stats: '/stats',
      transcribe: '/transcribe',
      stream: 'ws://localhost:' + PORT + '/transcribe/stream',
    },
    configuration: {
      maxConnections: MAX_CONNECTIONS,
      heartbeatInterval: HEARTBEAT_INTERVAL,
      bufferSize: BUFFER_SIZE,
      providerPool: {
        min: MIN_PROVIDER_POOL_SIZE,
        max: MAX_PROVIDER_POOL_SIZE,
      },
    },
  });
});

// ASR transcription endpoint (for future batch/file transcription)
app.post('/transcribe', (req, res) => {
  res.json({
    message: 'Batch transcription endpoint',
    note: 'Use WebSocket endpoint /transcribe/stream for real-time streaming',
    providers: ['aws', 'deepgram', 'google', 'azure'],
    status: 'streaming implementation complete, batch pending',
  });
});

server.listen(PORT, () => {
  console.log(`[asr-gateway] Running on port ${PORT}`);
  console.log(`[asr-gateway] Health check: http://localhost:${PORT}/healthz`);
  console.log(`[asr-gateway] Stats endpoint: http://localhost:${PORT}/stats`);
  console.log(`[asr-gateway] WebSocket stream: ws://localhost:${PORT}/transcribe/stream`);
  console.log(`[asr-gateway] Primary ASR provider: ${PRIMARY_ASR_PROVIDER}`);
  console.log(`[asr-gateway] Connection pool: ${MAX_CONNECTIONS} max, ${HEARTBEAT_INTERVAL}ms heartbeat`);
  console.log(`[asr-gateway] Provider pool: ${MIN_PROVIDER_POOL_SIZE}-${MAX_PROVIDER_POOL_SIZE} providers`);
  console.log(`[asr-gateway] Buffer size: ${BUFFER_SIZE} bytes`);
});

// Periodic cleanup of old transcription sessions (every 5 minutes)
const sessionCleanupInterval = setInterval(() => {
  const cleaned = transcriptionProcessor.cleanupSessions(3600000); // 1 hour max age
  if (cleaned > 0) {
    console.log(`[asr-gateway] Cleaned up ${cleaned} old transcription sessions`);
  }
}, 300000);

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`[asr-gateway] Received ${signal}, starting graceful shutdown...`);

  // Stop periodic cleanup
  clearInterval(sessionCleanupInterval);

  // Stop accepting new connections
  wss.close(() => {
    console.log('[asr-gateway] WebSocket server closed');
  });

  // Cleanup all active transcription sessions
  const activeSessions = transcriptionProcessor.getActiveSessions();
  for (const sessionId of activeSessions) {
    transcriptionProcessor.endSession(sessionId);
  }
  console.log('[asr-gateway] Transcription sessions cleaned up');

  // Cleanup connection manager
  connectionManager.cleanup();
  console.log('[asr-gateway] Connection manager cleaned up');

  // Cleanup provider pool
  await providerPool.cleanup();
  console.log('[asr-gateway] Provider pool cleaned up');

  // Cleanup provider manager
  if (providerManager) {
    providerManager.cleanup();
    console.log('[asr-gateway] Provider manager cleaned up');
  }

  // Close HTTP server
  server.close(() => {
    console.log('[asr-gateway] HTTP server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    console.error('[asr-gateway] Forced shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 second timeout
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
