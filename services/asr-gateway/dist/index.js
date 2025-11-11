"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = require("http");
const WebSocketConnectionManager_1 = require("./connection/WebSocketConnectionManager");
const ASRProviderPool_1 = require("./connection/ASRProviderPool");
const TranscriptionProcessor_1 = require("./processing/TranscriptionProcessor");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server, path: '/transcribe/stream' });
const PORT = process.env.PORT || 8080;
const PRIMARY_ASR_PROVIDER = process.env.PRIMARY_ASR_PROVIDER || 'aws';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
// Configuration for connection management
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '100', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10);
const BUFFER_SIZE = parseInt(process.env.BUFFER_SIZE || '32768', 10); // 32KB for low latency
const MAX_PROVIDER_POOL_SIZE = parseInt(process.env.MAX_PROVIDER_POOL_SIZE || '10', 10);
const MIN_PROVIDER_POOL_SIZE = parseInt(process.env.MIN_PROVIDER_POOL_SIZE || '2', 10);
// Initialize connection manager
const connectionManager = new WebSocketConnectionManager_1.WebSocketConnectionManager({
    maxConnections: MAX_CONNECTIONS,
    heartbeatInterval: HEARTBEAT_INTERVAL,
    reconnectMaxAttempts: 5,
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000,
    connectionTimeout: 10000,
    bufferSize: BUFFER_SIZE,
});
// Initialize ASR provider pool
const providerPool = new ASRProviderPool_1.ASRProviderPool({
    maxPoolSize: MAX_PROVIDER_POOL_SIZE,
    minPoolSize: MIN_PROVIDER_POOL_SIZE,
    acquireTimeout: 5000,
    idleTimeout: 60000,
    providerType: PRIMARY_ASR_PROVIDER,
    providerRegion: AWS_REGION,
});
// Initialize transcription processor
const transcriptionProcessor = new TranscriptionProcessor_1.TranscriptionProcessor({
    minConfidenceThreshold: parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.5'),
    aggregationWindowMs: parseInt(process.env.AGGREGATION_WINDOW_MS || '500', 10),
    maxPartialHistory: parseInt(process.env.MAX_PARTIAL_HISTORY || '10', 10),
    enableWordTimestamps: process.env.ENABLE_WORD_TIMESTAMPS !== 'false',
});
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
app.use(express_1.default.json());
// WebSocket connection handler for streaming transcription
wss.on('connection', (ws) => {
    console.log('[asr-gateway] New WebSocket connection established');
    let provider = null;
    let providerId = null;
    let connectionId = null;
    let sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    // Register connection with connection manager
    try {
        connectionId = connectionManager.registerConnection(ws, { sessionId });
    }
    catch (error) {
        console.error('[asr-gateway] Failed to register connection:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Maximum connections reached. Please try again later.',
        }));
        ws.close();
        return;
    }
    ws.on('message', async (data) => {
        try {
            // Check if this is a control message (JSON) or audio data (binary)
            if (data[0] === 0x7B) { // '{' - likely JSON
                const message = JSON.parse(data.toString());
                if (message.action === 'start') {
                    console.log(`[asr-gateway] Starting transcription session: ${sessionId}`);
                    // Acquire provider from pool
                    try {
                        const pooled = await providerPool.acquire();
                        provider = pooled.provider;
                        providerId = pooled.id;
                    }
                    catch (error) {
                        console.error('[asr-gateway] Failed to acquire provider:', error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'No ASR providers available. Please try again later.',
                        }));
                        return;
                    }
                    // Create transcription session
                    transcriptionProcessor.createSession(sessionId, provider.getName());
                    // Start streaming session
                    await provider.startStream((result) => {
                        // Process result through transcription processor
                        const processed = transcriptionProcessor.processResult(sessionId, result, provider.getName());
                        // Send processed transcription results back to client
                        if (processed && ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'transcript',
                                transcript: processed.transcript,
                                isFinal: processed.isFinal,
                                confidence: processed.confidence,
                                timestamp: processed.timestamp,
                                metadata: processed.metadata,
                            }));
                        }
                    }, (error) => {
                        console.error(`[asr-gateway] Transcription error:`, error);
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: error.message,
                            }));
                        }
                        // On error, remove provider from pool and get a new one
                        if (providerId) {
                            providerPool.remove(providerId);
                            providerId = null;
                            provider = null;
                        }
                    }, {
                        languageCode: message.languageCode || 'en-US',
                        sampleRate: message.sampleRate || 16000,
                    });
                    ws.send(JSON.stringify({
                        type: 'status',
                        status: 'started',
                        sessionId,
                        provider: provider.getName(),
                        bufferSize: connectionManager.getBufferSize(),
                    }));
                }
                else if (message.action === 'stop') {
                    console.log(`[asr-gateway] Stopping transcription session: ${sessionId}`);
                    if (provider && providerId) {
                        await provider.endStream();
                        providerPool.release(providerId);
                        provider = null;
                        providerId = null;
                    }
                    // End transcription session and get stats
                    const stats = transcriptionProcessor.getSessionStats(sessionId);
                    transcriptionProcessor.endSession(sessionId);
                    ws.send(JSON.stringify({
                        type: 'status',
                        status: 'stopped',
                        stats,
                    }));
                }
                else if (message.action === 'ping') {
                    // Handle explicit ping from client
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now(),
                    }));
                }
            }
            else {
                // Binary audio data
                if (!provider) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Session not started. Send {"action": "start"} first.',
                    }));
                    return;
                }
                // Send audio chunk to ASR provider with buffer size awareness
                const bufferSize = connectionManager.getBufferSize();
                // If chunk is larger than buffer size, split it
                if (data.length > bufferSize) {
                    for (let i = 0; i < data.length; i += bufferSize) {
                        const chunk = data.slice(i, Math.min(i + bufferSize, data.length));
                        await provider.sendAudio(chunk);
                    }
                }
                else {
                    await provider.sendAudio(data);
                }
            }
        }
        catch (error) {
            console.error(`[asr-gateway] WebSocket message error:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    });
    ws.on('close', async () => {
        console.log(`[asr-gateway] WebSocket connection closed: ${sessionId}`);
        // Clean up provider
        if (provider && providerId) {
            await provider.endStream();
            providerPool.release(providerId);
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
        // Clean up provider
        if (provider && providerId) {
            provider.endStream().catch(console.error);
            providerPool.release(providerId);
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
    res.json({
        connections: connectionStats,
        providerPool: poolStats,
        transcriptionProcessor: processorStats,
        configuration: {
            maxConnections: MAX_CONNECTIONS,
            heartbeatInterval: HEARTBEAT_INTERVAL,
            bufferSize: BUFFER_SIZE,
            maxProviderPoolSize: MAX_PROVIDER_POOL_SIZE,
            minProviderPoolSize: MIN_PROVIDER_POOL_SIZE,
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
const gracefulShutdown = async (signal) => {
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
//# sourceMappingURL=index.js.map