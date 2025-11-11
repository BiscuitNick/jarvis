"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const TTSProviderManager_1 = require("./providers/TTSProviderManager");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
app.use(express_1.default.json());
// Initialize TTS Provider Manager
const providerConfigs = [
    {
        type: 'google',
        priority: 1,
        enabled: !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_CLOUD_PROJECT,
        config: {},
    },
    {
        type: 'azure',
        priority: 2,
        enabled: !!process.env.AZURE_SPEECH_KEY,
        config: {
            subscriptionKey: process.env.AZURE_SPEECH_KEY,
            region: process.env.AZURE_SPEECH_REGION || 'eastus',
        },
    },
    {
        type: 'elevenlabs',
        priority: 3,
        enabled: !!process.env.ELEVENLABS_API_KEY,
        config: {
            apiKey: process.env.ELEVENLABS_API_KEY,
        },
    },
];
const ttsManager = new TTSProviderManager_1.TTSProviderManager({
    providers: providerConfigs,
    healthCheckInterval: 30000,
    errorThreshold: 5,
    failoverDelay: 5000,
});
// Log provider initialization
ttsManager.on('provider:switched', (data) => {
    console.log(`[TTS] Provider switched from ${data.from} to ${data.to} (reason: ${data.reason})`);
});
ttsManager.on('provider:unhealthy', (data) => {
    console.warn(`[TTS] Provider ${data.providerName} marked unhealthy:`, data.error.message);
});
ttsManager.on('provider:recovered', (data) => {
    console.log(`[TTS] Provider ${data.providerName} recovered`);
});
// Health check endpoint
app.get('/healthz', (req, res) => {
    const stats = ttsManager.getStats();
    const isHealthy = stats.healthyProviders > 0;
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'tts-service',
        timestamp: new Date().toISOString(),
        providers: stats,
    });
});
// Root endpoint
app.get('/', (req, res) => {
    const stats = ttsManager.getStats();
    res.json({
        service: 'Jarvis TTS Service',
        version: '1.0.0',
        description: 'Streams cloud neural TTS audio',
        activeProvider: stats.activeProvider,
        availableProviders: stats.providers.map((p) => p.name),
    });
});
// Provider stats endpoint
app.get('/stats', (req, res) => {
    const stats = ttsManager.getStats();
    res.json(stats);
});
// Text-to-speech endpoint
app.post('/synthesize', async (req, res) => {
    try {
        const { text, voice, audio } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        const synthesisRequest = {
            text,
            voice: voice || {},
            audio: audio || { audioEncoding: 'mp3', sampleRateHertz: 24000 },
        };
        const result = await ttsManager.synthesize(synthesisRequest);
        // Set appropriate headers
        const contentType = result.audioEncoding === 'mp3'
            ? 'audio/mpeg'
            : result.audioEncoding === 'wav'
                ? 'audio/wav'
                : result.audioEncoding === 'opus'
                    ? 'audio/opus'
                    : 'application/octet-stream';
        res.set({
            'Content-Type': contentType,
            'Content-Length': result.audioContent.length.toString(),
            'X-Provider': ttsManager.getActiveProviderName() || 'unknown',
        });
        res.send(result.audioContent);
    }
    catch (error) {
        console.error('[TTS] Synthesis error:', error);
        res.status(500).json({
            error: 'TTS synthesis failed',
            message: error.message,
        });
    }
});
// Streaming TTS endpoint
app.post('/synthesize/stream', async (req, res) => {
    try {
        const { text, voice, audio } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        const synthesisRequest = {
            text,
            voice: voice || {},
            audio: audio || { audioEncoding: 'mp3', sampleRateHertz: 24000 },
        };
        // Set streaming headers
        const audioEncoding = synthesisRequest.audio?.audioEncoding || 'mp3';
        const contentType = audioEncoding === 'mp3'
            ? 'audio/mpeg'
            : audioEncoding === 'wav'
                ? 'audio/wav'
                : audioEncoding === 'opus'
                    ? 'audio/opus'
                    : 'application/octet-stream';
        res.set({
            'Content-Type': contentType,
            'Transfer-Encoding': 'chunked',
            'X-Provider': ttsManager.getActiveProviderName() || 'unknown',
        });
        await ttsManager.synthesizeStream(synthesisRequest, (chunk) => {
            res.write(chunk);
        }, (error) => {
            console.error('[TTS] Streaming error:', error);
            res.end();
        });
        res.end();
    }
    catch (error) {
        console.error('[TTS] Streaming synthesis error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'TTS streaming failed',
                message: error.message,
            });
        }
    }
});
// List available voices
app.get('/voices', async (req, res) => {
    try {
        const { languageCode } = req.query;
        const provider = ttsManager.getActiveProvider();
        if (!provider) {
            return res.status(503).json({ error: 'No TTS provider available' });
        }
        const voices = await provider.listVoices(languageCode);
        res.json({
            provider: ttsManager.getActiveProviderName(),
            voices,
        });
    }
    catch (error) {
        console.error('[TTS] List voices error:', error);
        res.status(500).json({
            error: 'Failed to list voices',
            message: error.message,
        });
    }
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[TTS] SIGTERM received, cleaning up...');
    ttsManager.cleanup();
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('[TTS] SIGINT received, cleaning up...');
    ttsManager.cleanup();
    process.exit(0);
});
app.listen(PORT, () => {
    console.log(`[tts-service] Running on port ${PORT}`);
    console.log(`[tts-service] Health check: http://localhost:${PORT}/healthz`);
    console.log(`[tts-service] Active provider: ${ttsManager.getActiveProviderName()}`);
});
