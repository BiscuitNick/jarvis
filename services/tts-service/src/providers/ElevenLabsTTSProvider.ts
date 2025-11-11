/**
 * ElevenLabs Text-to-Speech Provider
 * Uses ElevenLabs API for high-quality neural voice synthesis
 */

import axios, { AxiosInstance } from 'axios';
import {
  TTSProvider,
  SynthesisRequest,
  SynthesisResult,
  VoiceConfig,
} from './TTSProvider';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

export class ElevenLabsTTSProvider implements TTSProvider {
  private apiKey!: string;
  private apiClient!: AxiosInstance;
  private isConfigured: boolean = false;
  private baseUrl: string = 'https://api.elevenlabs.io/v1';

  constructor(apiKey: string) {
    try {
      if (!apiKey) {
        throw new Error('ElevenLabs API key is required');
      }

      this.apiKey = apiKey;
      this.apiClient = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });
      this.isConfigured = true;
      console.log('[ElevenLabs] Initialized successfully');
    } catch (error) {
      console.error('[ElevenLabs] Failed to initialize:', error);
      this.isConfigured = false;
    }
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
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

      const response = await this.apiClient.post(
        `/text-to-speech/${voiceId}`,
        requestBody,
        {
          responseType: 'arraybuffer',
          params: {
            output_format: this.mapAudioFormat(
              request.audio?.audioEncoding || 'mp3',
              request.audio?.sampleRateHertz || 24000
            ),
          },
        }
      );

      const audioBuffer = Buffer.from(response.data);

      return {
        audioContent: audioBuffer,
        audioEncoding: request.audio?.audioEncoding || 'mp3',
        sampleRate: request.audio?.sampleRateHertz || 24000,
      };
    } catch (error: any) {
      console.error('[ElevenLabs] Synthesis error:', error.message);
      if (error.response) {
        console.error('[ElevenLabs] Error response:', error.response.data);
      }
      throw error;
    }
  }

  async synthesizeStream(
    request: SynthesisRequest,
    onAudioChunk: (chunk: Buffer) => void,
    onError: (error: Error) => void
  ): Promise<void> {
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

      const response = await this.apiClient.post(
        `/text-to-speech/${voiceId}/stream`,
        requestBody,
        {
          responseType: 'stream',
          params: {
            output_format: this.mapAudioFormat(
              request.audio?.audioEncoding || 'mp3',
              request.audio?.sampleRateHertz || 24000
            ),
          },
        }
      );

      // Stream the response data
      response.data.on('data', (chunk: Buffer) => {
        onAudioChunk(chunk);
      });

      response.data.on('end', () => {
        console.log('[ElevenLabs] Streaming completed');
      });

      response.data.on('error', (error: Error) => {
        console.error('[ElevenLabs] Streaming error:', error);
        onError(error);
      });
    } catch (error: any) {
      console.error('[ElevenLabs] Stream synthesis error:', error.message);
      onError(error);
    }
  }

  async listVoices(languageCode?: string): Promise<VoiceConfig[]> {
    if (!this.isConfigured) {
      throw new Error('ElevenLabs TTS provider is not configured');
    }

    try {
      const response = await this.apiClient.get('/voices');
      const voices: ElevenLabsVoice[] = response.data.voices || [];

      return voices.map((voice) => ({
        voiceId: voice.voice_id,
        name: voice.name,
        languageCode: voice.labels?.language || 'en',
        gender:
          voice.labels?.gender === 'male'
            ? 'male'
            : voice.labels?.gender === 'female'
            ? 'female'
            : 'neutral',
      }));
    } catch (error: any) {
      console.error('[ElevenLabs] List voices error:', error.message);
      throw error;
    }
  }

  getName(): string {
    return 'elevenlabs';
  }

  isAvailable(): boolean {
    return this.isConfigured;
  }

  private mapAudioFormat(encoding: string, sampleRate: number): string {
    // ElevenLabs format: <codec>_<sample_rate>
    const codec = encoding === 'pcm' ? 'pcm' : 'mp3';

    // ElevenLabs supports: 16000, 22050, 24000, 44100
    const validRates = [16000, 22050, 24000, 44100];
    const closestRate = validRates.reduce((prev, curr) =>
      Math.abs(curr - sampleRate) < Math.abs(prev - sampleRate) ? curr : prev
    );

    return `${codec}_${closestRate}`;
  }
}
