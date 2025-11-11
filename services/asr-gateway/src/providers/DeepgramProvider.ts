/**
 * Deepgram Provider
 * Implements real-time speech-to-text using Deepgram Streaming API
 */

import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { ASRProvider, TranscriptionResult, ASRConfig } from './ASRProvider';

export class DeepgramProvider implements ASRProvider {
  private deepgram: ReturnType<typeof createClient>;
  private liveClient: LiveClient | null = null;
  private isStreaming: boolean = false;

  constructor(apiKey: string) {
    this.deepgram = createClient(apiKey);
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
      // Create live transcription connection
      this.liveClient = this.deepgram.listen.live({
        language: languageCode,
        punctuate: true,
        smart_format: true,
        model: 'nova-2',
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: 1,
        interim_results: true,
      });

      this.isStreaming = true;

      // Handle transcript events
      this.liveClient.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const confidence = data.channel?.alternatives?.[0]?.confidence;
        const isFinal = data.is_final || data.speech_final || false;

        if (transcript) {
          onTranscript({
            transcript,
            isFinal,
            confidence,
            timestamp: Date.now(),
          });
        }
      });

      // Handle errors
      this.liveClient.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error('[DeepgramProvider] Error:', error);
        onError(new Error(error.message || 'Deepgram transcription error'));
      });

      // Handle close events
      this.liveClient.on(LiveTranscriptionEvents.Close, () => {
        console.log('[DeepgramProvider] Connection closed');
        this.isStreaming = false;
      });

      // Handle warnings
      this.liveClient.on(LiveTranscriptionEvents.Warning, (warning: any) => {
        console.warn('[DeepgramProvider] Warning:', warning);
      });

      // Handle metadata
      this.liveClient.on(LiveTranscriptionEvents.Metadata, (metadata: any) => {
        console.log('[DeepgramProvider] Metadata received:', metadata);
      });

    } catch (error) {
      this.isStreaming = false;
      onError(error as Error);
    }
  }

  async sendAudio(audioChunk: Buffer): Promise<void> {
    if (!this.isStreaming || !this.liveClient) {
      throw new Error('Stream not active');
    }

    // Send audio chunk to Deepgram
    this.liveClient.send(audioChunk);
  }

  async endStream(): Promise<void> {
    if (!this.isStreaming || !this.liveClient) {
      return;
    }

    try {
      // Finish the stream
      this.liveClient.finish();
      this.liveClient = null;
      this.isStreaming = false;
    } catch (error) {
      console.error('[DeepgramProvider] Error ending stream:', error);
      this.isStreaming = false;
      this.liveClient = null;
    }
  }

  getName(): string {
    return 'Deepgram';
  }
}
