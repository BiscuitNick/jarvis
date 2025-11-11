"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = require("http");
const AWSTranscribeProvider_1 = require("./providers/AWSTranscribeProvider");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server, path: '/transcribe/stream' });
const PORT = process.env.PORT || 8080;
const PRIMARY_ASR_PROVIDER = process.env.PRIMARY_ASR_PROVIDER || 'aws';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
app.use(express_1.default.json());
// WebSocket connection handler for streaming transcription
wss.on('connection', (ws) => {
    console.log('[asr-gateway] New WebSocket connection established');
    let provider = null;
    let sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    ws.on('message', async (data) => {
        try {
            // Check if this is a control message (JSON) or audio data (binary)
            if (data[0] === 0x7B) { // '{' - likely JSON
                const message = JSON.parse(data.toString());
                if (message.action === 'start') {
                    console.log(`[asr-gateway] Starting transcription session: ${sessionId}`);
                    // Initialize provider based on configuration
                    if (PRIMARY_ASR_PROVIDER === 'aws') {
                        provider = new AWSTranscribeProvider_1.AWSTranscribeProvider(AWS_REGION);
                    }
                    else {
                        throw new Error(`Unsupported ASR provider: ${PRIMARY_ASR_PROVIDER}`);
                    }
                    // Start streaming session
                    await provider.startStream((result) => {
                        // Send transcription results back to client
                        ws.send(JSON.stringify({
                            type: 'transcript',
                            transcript: result.transcript,
                            isFinal: result.isFinal,
                            confidence: result.confidence,
                            timestamp: result.timestamp,
                        }));
                    }, (error) => {
                        console.error(`[asr-gateway] Transcription error:`, error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: error.message,
                        }));
                    }, {
                        languageCode: message.languageCode || 'en-US',
                        sampleRate: message.sampleRate || 16000,
                    });
                    ws.send(JSON.stringify({
                        type: 'status',
                        status: 'started',
                        sessionId,
                        provider: provider.getName(),
                    }));
                }
                else if (message.action === 'stop') {
                    console.log(`[asr-gateway] Stopping transcription session: ${sessionId}`);
                    if (provider) {
                        await provider.endStream();
                        provider = null;
                    }
                    ws.send(JSON.stringify({
                        type: 'status',
                        status: 'stopped',
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
                // Send audio chunk to ASR provider
                await provider.sendAudio(data);
            }
        }
        catch (error) {
            console.error(`[asr-gateway] WebSocket error:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    });
    ws.on('close', async () => {
        console.log(`[asr-gateway] WebSocket connection closed: ${sessionId}`);
        if (provider) {
            await provider.endStream();
            provider = null;
        }
    });
    ws.on('error', (error) => {
        console.error(`[asr-gateway] WebSocket error:`, error);
        if (provider) {
            provider.endStream().catch(console.error);
            provider = null;
        }
    });
});
// Health check endpoint
app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'asr-gateway',
        timestamp: new Date().toISOString(),
    });
});
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Jarvis ASR Gateway',
        version: '1.0.0',
        description: 'Streams to cloud ASR services (AWS Transcribe, Deepgram, Google, Azure)',
        provider: PRIMARY_ASR_PROVIDER,
        endpoints: {
            health: '/healthz',
            transcribe: '/transcribe',
            stream: 'ws://localhost:' + PORT + '/transcribe/stream',
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
    console.log(`[asr-gateway] WebSocket stream: ws://localhost:${PORT}/transcribe/stream`);
    console.log(`[asr-gateway] Primary ASR provider: ${PRIMARY_ASR_PROVIDER}`);
});
//# sourceMappingURL=index.js.map