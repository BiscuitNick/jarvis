/**
 * Google Cloud Text-to-Speech Provider
 * Uses Google Cloud TTS API for neural voice synthesis
 */

import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import {
  TTSProvider,
  SynthesisRequest,
  SynthesisResult,
  VoiceConfig,
} from './TTSProvider';

export class GoogleCloudTTSProvider implements TTSProvider {
  private client!: TextToSpeechClient;
  private isConfigured: boolean = false;

  constructor(credentials?: any) {
    try {
      this.client = new TextToSpeechClient(
        credentials ? { credentials } : undefined
      );
      this.isConfigured = true;
      console.log('[GoogleCloudTTS] Initialized successfully');
    } catch (error) {
      console.error('[GoogleCloudTTS] Failed to initialize:', error);
      this.isConfigured = false;
    }
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    if (!this.isConfigured) {
      throw new Error('Google Cloud TTS provider is not configured');
    }

    try {
      const ttsRequest: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest =
        {
          input: { text: request.text },
          voice: {
            languageCode: request.voice?.languageCode || 'en-US',
            name: request.voice?.name,
            ssmlGender:
              request.voice?.gender === 'male'
                ? 'MALE'
                : request.voice?.gender === 'female'
                ? 'FEMALE'
                : 'NEUTRAL',
          },
          audioConfig: {
            audioEncoding: this.mapAudioEncoding(
              request.audio?.audioEncoding || 'mp3'
            ),
            sampleRateHertz: request.audio?.sampleRateHertz || 24000,
            pitch: request.audio?.pitch || 0,
            speakingRate: request.audio?.speakingRate || 1.0,
            volumeGainDb: request.audio?.volumeGainDb || 0,
          },
        };

      const [response] = await this.client.synthesizeSpeech(ttsRequest);

      if (!response.audioContent) {
        throw new Error('No audio content received from Google Cloud TTS');
      }

      const audioBuffer = Buffer.from(response.audioContent as Uint8Array);

      return {
        audioContent: audioBuffer,
        audioEncoding: request.audio?.audioEncoding || 'mp3',
        sampleRate: request.audio?.sampleRateHertz || 24000,
      };
    } catch (error) {
      console.error('[GoogleCloudTTS] Synthesis error:', error);
      throw error;
    }
  }

  async synthesizeStream(
    request: SynthesisRequest,
    onAudioChunk: (chunk: Buffer) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // Google Cloud TTS doesn't support native streaming, so we synthesize and chunk
      const result = await this.synthesize(request);
      const chunkSize = 4096;

      for (let i = 0; i < result.audioContent.length; i += chunkSize) {
        const chunk = result.audioContent.slice(i, i + chunkSize);
        onAudioChunk(chunk);

        // Small delay to simulate streaming
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } catch (error) {
      onError(error as Error);
    }
  }

  async listVoices(languageCode?: string): Promise<VoiceConfig[]> {
    if (!this.isConfigured) {
      throw new Error('Google Cloud TTS provider is not configured');
    }

    try {
      const [response] = await this.client.listVoices({
        languageCode: languageCode,
      });

      return (
        response.voices?.map((voice) => ({
          name: voice.name || undefined,
          languageCode: voice.languageCodes?.[0] || undefined,
          gender:
            voice.ssmlGender === 'MALE'
              ? 'male'
              : voice.ssmlGender === 'FEMALE'
              ? 'female'
              : 'neutral',
        })) || []
      );
    } catch (error) {
      console.error('[GoogleCloudTTS] List voices error:', error);
      throw error;
    }
  }

  getName(): string {
    return 'google-cloud-tts';
  }

  isAvailable(): boolean {
    return this.isConfigured;
  }

  private mapAudioEncoding(
    encoding: string
  ): protos.google.cloud.texttospeech.v1.AudioEncoding {
    switch (encoding.toLowerCase()) {
      case 'mp3':
        return protos.google.cloud.texttospeech.v1.AudioEncoding.MP3;
      case 'wav':
      case 'pcm':
        return protos.google.cloud.texttospeech.v1.AudioEncoding.LINEAR16;
      case 'opus':
        return protos.google.cloud.texttospeech.v1.AudioEncoding.OGG_OPUS;
      default:
        return protos.google.cloud.texttospeech.v1.AudioEncoding.MP3;
    }
  }
}
