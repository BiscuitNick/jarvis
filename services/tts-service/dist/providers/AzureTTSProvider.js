"use strict";
/**
 * Azure Cognitive Services Text-to-Speech Provider
 * Uses Azure Speech Service for neural voice synthesis
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureTTSProvider = void 0;
const sdk = __importStar(require("microsoft-cognitiveservices-speech-sdk"));
class AzureTTSProvider {
    constructor(subscriptionKey, region) {
        this.speechConfig = null;
        this.isConfigured = false;
        try {
            if (!subscriptionKey || !region) {
                throw new Error('Azure subscription key and region are required');
            }
            this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
            this.isConfigured = true;
            console.log('[AzureTTS] Initialized successfully');
        }
        catch (error) {
            console.error('[AzureTTS] Failed to initialize:', error);
            this.isConfigured = false;
        }
    }
    async synthesize(request) {
        if (!this.isConfigured || !this.speechConfig) {
            throw new Error('Azure TTS provider is not configured');
        }
        return new Promise((resolve, reject) => {
            try {
                // Configure audio output
                const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
                // Set audio format
                const audioEncoding = request.audio?.audioEncoding || 'mp3';
                const sampleRate = request.audio?.sampleRateHertz || 24000;
                if (audioEncoding === 'mp3') {
                    this.speechConfig.speechSynthesisOutputFormat =
                        sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;
                }
                else if (audioEncoding === 'wav' || audioEncoding === 'pcm') {
                    this.speechConfig.speechSynthesisOutputFormat =
                        sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
                }
                else if (audioEncoding === 'opus') {
                    this.speechConfig.speechSynthesisOutputFormat =
                        sdk.SpeechSynthesisOutputFormat.Ogg24Khz16BitMonoOpus;
                }
                // Set voice
                if (request.voice?.name) {
                    this.speechConfig.speechSynthesisVoiceName = request.voice.name;
                }
                else {
                    // Default to neural voice
                    this.speechConfig.speechSynthesisVoiceName =
                        'en-US-JennyNeural';
                }
                const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, audioConfig);
                // Build SSML if we have voice parameters
                const textInput = this.buildSSML(request);
                synthesizer.speakSsmlAsync(textInput, (result) => {
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                        const audioBuffer = Buffer.from(result.audioData);
                        resolve({
                            audioContent: audioBuffer,
                            audioEncoding: audioEncoding,
                            sampleRate: sampleRate,
                        });
                    }
                    else {
                        reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
                    }
                    synthesizer.close();
                }, (error) => {
                    console.error('[AzureTTS] Synthesis error:', error);
                    synthesizer.close();
                    reject(error);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async synthesizeStream(request, onAudioChunk, onError) {
        try {
            // Azure doesn't support native streaming, so we synthesize and chunk
            const result = await this.synthesize(request);
            const chunkSize = 4096;
            for (let i = 0; i < result.audioContent.length; i += chunkSize) {
                const chunk = result.audioContent.slice(i, i + chunkSize);
                onAudioChunk(chunk);
                // Small delay to simulate streaming
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }
        catch (error) {
            onError(error);
        }
    }
    async listVoices(languageCode) {
        if (!this.isConfigured || !this.speechConfig) {
            throw new Error('Azure TTS provider is not configured');
        }
        // Return a subset of popular Azure neural voices
        // For full list, users can refer to Azure documentation
        const popularVoices = [
            { name: 'en-US-JennyNeural', languageCode: 'en-US', gender: 'female' },
            { name: 'en-US-GuyNeural', languageCode: 'en-US', gender: 'male' },
            { name: 'en-US-AriaNeural', languageCode: 'en-US', gender: 'female' },
            { name: 'en-GB-SoniaNeural', languageCode: 'en-GB', gender: 'female' },
            { name: 'en-GB-RyanNeural', languageCode: 'en-GB', gender: 'male' },
            { name: 'es-ES-ElviraNeural', languageCode: 'es-ES', gender: 'female' },
            { name: 'fr-FR-DeniseNeural', languageCode: 'fr-FR', gender: 'female' },
            { name: 'de-DE-KatjaNeural', languageCode: 'de-DE', gender: 'female' },
            { name: 'ja-JP-NanamiNeural', languageCode: 'ja-JP', gender: 'female' },
            { name: 'zh-CN-XiaoxiaoNeural', languageCode: 'zh-CN', gender: 'female' },
        ];
        if (languageCode) {
            return popularVoices.filter((v) => v.languageCode?.startsWith(languageCode));
        }
        return popularVoices;
    }
    getName() {
        return 'azure-tts';
    }
    isAvailable() {
        return this.isConfigured;
    }
    buildSSML(request) {
        const voice = request.voice?.name || 'en-US-JennyNeural';
        const pitch = request.audio?.pitch
            ? `${request.audio.pitch > 0 ? '+' : ''}${request.audio.pitch * 50}%`
            : '0%';
        const rate = request.audio?.speakingRate
            ? `${request.audio.speakingRate}`
            : '1.0';
        const volume = request.audio?.volumeGainDb
            ? `${request.audio.volumeGainDb > 0 ? '+' : ''}${request.audio.volumeGainDb}`
            : '0';
        return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voice}">
          <prosody pitch="${pitch}" rate="${rate}" volume="${volume}">
            ${this.escapeXml(request.text)}
          </prosody>
        </voice>
      </speak>
    `.trim();
    }
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
exports.AzureTTSProvider = AzureTTSProvider;
