"use strict";
/**
 * ElevenLabs Text-to-Speech Provider
 * Uses ElevenLabs API for high-quality neural voice synthesis
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElevenLabsTTSProvider = void 0;
const axios_1 = __importDefault(require("axios"));
class ElevenLabsTTSProvider {
    constructor(apiKey) {
        this.isConfigured = false;
        this.baseUrl = 'https://api.elevenlabs.io/v1';
        try {
            if (!apiKey) {
                throw new Error('ElevenLabs API key is required');
            }
            this.apiKey = apiKey;
            this.apiClient = axios_1.default.create({
                baseURL: this.baseUrl,
                headers: {
                    'xi-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
            });
            this.isConfigured = true;
            console.log('[ElevenLabs] Initialized successfully');
        }
        catch (error) {
            console.error('[ElevenLabs] Failed to initialize:', error);
            this.isConfigured = false;
        }
    }
    async synthesize(request) {
        if (!this.isConfigured) {
            throw new Error('ElevenLabs TTS provider is not configured');
        }
        try {
            // Use default voice if not specified
            const voiceId = request.voice?.voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
            const requestBody = {
                text: request.text,
                model_id: 'eleven_monolingual_v1', // or 'eleven_multilingual_v2'
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                },
            };
            const response = await this.apiClient.post(`/text-to-speech/${voiceId}`, requestBody, {
                responseType: 'arraybuffer',
                params: {
                    output_format: this.mapAudioFormat(request.audio?.audioEncoding || 'mp3', request.audio?.sampleRateHertz || 24000),
                },
            });
            const audioBuffer = Buffer.from(response.data);
            return {
                audioContent: audioBuffer,
                audioEncoding: request.audio?.audioEncoding || 'mp3',
                sampleRate: request.audio?.sampleRateHertz || 24000,
            };
        }
        catch (error) {
            console.error('[ElevenLabs] Synthesis error:', error.message);
            if (error.response) {
                console.error('[ElevenLabs] Error response:', error.response.data);
            }
            throw error;
        }
    }
    async synthesizeStream(request, onAudioChunk, onError) {
        if (!this.isConfigured) {
            onError(new Error('ElevenLabs TTS provider is not configured'));
            return;
        }
        try {
            const voiceId = request.voice?.voiceId || '21m00Tcm4TlvDq8ikWAM';
            const requestBody = {
                text: request.text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                },
            };
            const response = await this.apiClient.post(`/text-to-speech/${voiceId}/stream`, requestBody, {
                responseType: 'stream',
                params: {
                    output_format: this.mapAudioFormat(request.audio?.audioEncoding || 'mp3', request.audio?.sampleRateHertz || 24000),
                },
            });
            // Stream the response data
            response.data.on('data', (chunk) => {
                onAudioChunk(chunk);
            });
            response.data.on('end', () => {
                console.log('[ElevenLabs] Streaming completed');
            });
            response.data.on('error', (error) => {
                console.error('[ElevenLabs] Streaming error:', error);
                onError(error);
            });
        }
        catch (error) {
            console.error('[ElevenLabs] Stream synthesis error:', error.message);
            onError(error);
        }
    }
    async listVoices(languageCode) {
        if (!this.isConfigured) {
            throw new Error('ElevenLabs TTS provider is not configured');
        }
        try {
            const response = await this.apiClient.get('/voices');
            const voices = response.data.voices || [];
            return voices.map((voice) => ({
                voiceId: voice.voice_id,
                name: voice.name,
                languageCode: voice.labels?.language || 'en',
                gender: voice.labels?.gender === 'male'
                    ? 'male'
                    : voice.labels?.gender === 'female'
                        ? 'female'
                        : 'neutral',
            }));
        }
        catch (error) {
            console.error('[ElevenLabs] List voices error:', error.message);
            throw error;
        }
    }
    getName() {
        return 'elevenlabs';
    }
    isAvailable() {
        return this.isConfigured;
    }
    mapAudioFormat(encoding, sampleRate) {
        // ElevenLabs format: <codec>_<sample_rate>
        const codec = encoding === 'pcm' ? 'pcm' : 'mp3';
        // ElevenLabs supports: 16000, 22050, 24000, 44100
        const validRates = [16000, 22050, 24000, 44100];
        const closestRate = validRates.reduce((prev, curr) => Math.abs(curr - sampleRate) < Math.abs(prev - sampleRate) ? curr : prev);
        return `${codec}_${closestRate}`;
    }
}
exports.ElevenLabsTTSProvider = ElevenLabsTTSProvider;
