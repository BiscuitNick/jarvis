/**
 * Google Speech-to-Text Provider
 * Implements real-time speech-to-text using Google Cloud Speech-to-Text Streaming API
 */

import { SpeechClient } from '@google-cloud/speech';
import { ASRProvider, TranscriptionResult, ASRConfig } from './ASRProvider';
import { Duplex } from 'stream';

export class GoogleSpeechProvider implements ASRProvider {
  private client: SpeechClient;
  private recognizeStream: Duplex | null = null;
  private isStreaming: boolean = false;

  constructor(credentials?: any) {
    this.client = new SpeechClient(credentials ? { credentials } : {});
  }

  async startStream(
    onTranscript: (result: TranscriptionResult) => void,
    onError: (error: Error) => void,
    config?: ASRConfig
  ): Promise<void> {
    if (this.isStreaming) {
      throw new Error('Stream already active');
    }

    const languageCode = config?.languageCode || 'en-US';
    const sampleRate = config?.sampleRate || 16000;

    try {
      // Create streaming recognition request
      const request = {
        config: {
          encoding: 'LINEAR16' as const,
          sampleRateHertz: sampleRate,
          languageCode: languageCode,
          enableAutomaticPunctuation: true,
          model: 'latest_long',
          useEnhanced: true,
        },
        interimResults: true,
      };

      this.recognizeStream = this.client
        .streamingRecognize(request as any)
        .on('data', (data: any) => {
          if (data.results && data.results.length > 0) {
            const result = data.results[0];
            if (result.alternatives && result.alternatives.length > 0) {
              const alternative = result.alternatives[0];
              const transcript = alternative.transcript || '';
              const confidence = alternative.confidence;
              const isFinal = result.isFinal || false;

              if (transcript) {
                onTranscript({
                  transcript,
                  isFinal,
                  confidence,
                  timestamp: Date.now(),
                });
              }
            }
          }
        })
        .on('error', (error: Error) => {
          console.error('[GoogleSpeechProvider] Error:', error);
          this.isStreaming = false;
          onError(error);
        })
        .on('end', () => {
          console.log('[GoogleSpeechProvider] Stream ended');
          this.isStreaming = false;
        });

      this.isStreaming = true;
    } catch (error) {
      this.isStreaming = false;
      onError(error as Error);
    }
  }

  async sendAudio(audioChunk: Buffer): Promise<void> {
    if (!this.isStreaming || !this.recognizeStream) {
      throw new Error('Stream not active');
    }

    // Send audio chunk to Google Speech
    this.recognizeStream.write(audioChunk);
  }

  async endStream(): Promise<void> {
    if (!this.isStreaming || !this.recognizeStream) {
      return;
    }

    try {
      // End the stream
      this.recognizeStream.end();
      this.recognizeStream = null;
      this.isStreaming = false;
    } catch (error) {
      console.error('[GoogleSpeechProvider] Error ending stream:', error);
      this.isStreaming = false;
      this.recognizeStream = null;
    }
  }

  getName(): string {
    return 'Google Speech-to-Text';
  }
}
