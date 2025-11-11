/**
 * AWS Transcribe Streaming Provider
 * Implements real-time speech-to-text using AWS Transcribe Streaming API
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  AudioEvent,
  TranscriptResultStream,
  LanguageCode,
  MediaEncoding,
} from '@aws-sdk/client-transcribe-streaming';
import { ASRProvider, TranscriptionResult, ASRConfig } from './ASRProvider';

export class AWSTranscribeProvider implements ASRProvider {
  private client: TranscribeStreamingClient;
  private audioStream?: AsyncIterable<AudioStream>;
  private audioGeneratorController?: ReadableStreamDefaultController<AudioEvent>;
  private isStreaming: boolean = false;

  constructor(region: string = 'us-east-1') {
    this.client = new TranscribeStreamingClient({ region });
  }

  async startStream(
    onTranscript: (result: TranscriptionResult) => void,
    onError: (error: Error) => void,
    config?: ASRConfig
  ): Promise<void> {
    if (this.isStreaming) {
      throw new Error('Stream already active');
    }

    const languageCode = (config?.languageCode || 'en-US') as LanguageCode;
    const sampleRate = config?.sampleRate || 16000;

    try {
      // Create audio stream using ReadableStream
      const stream = new ReadableStream<AudioEvent>({
        start: (controller) => {
          this.audioGeneratorController = controller;
        },
      });

      this.audioStream = stream as any;

      // Start transcription command
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: languageCode,
        MediaSampleRateHertz: sampleRate,
        MediaEncoding: MediaEncoding.PCM,
        AudioStream: this.audioStream,
      });

      this.isStreaming = true;

      // Execute command and handle response stream
      const response = await this.client.send(command);

      if (!response.TranscriptResultStream) {
        throw new Error('No transcript result stream received');
      }

      // Process transcription results
      this.processTranscriptStream(response.TranscriptResultStream, onTranscript, onError);
    } catch (error) {
      this.isStreaming = false;
      onError(error as Error);
    }
  }

  private async processTranscriptStream(
    resultStream: AsyncIterable<TranscriptResultStream>,
    onTranscript: (result: TranscriptionResult) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      for await (const event of resultStream) {
        if (event.TranscriptEvent) {
          const results = event.TranscriptEvent.Transcript?.Results || [];

          for (const result of results) {
            if (!result.Alternatives || result.Alternatives.length === 0) {
              continue;
            }

            const alternative = result.Alternatives[0];
            const transcript = alternative.Transcript || '';
            const isFinal = !result.IsPartial;
            const confidence = alternative.Items?.[0]?.Confidence;

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
      }
    } catch (error) {
      onError(error as Error);
    } finally {
      this.isStreaming = false;
    }
  }

  async sendAudio(audioChunk: Buffer): Promise<void> {
    if (!this.isStreaming || !this.audioGeneratorController) {
      throw new Error('Stream not active');
    }

    // Create AudioEvent and enqueue it
    const audioEvent: AudioEvent = {
      AudioChunk: new Uint8Array(audioChunk),
    };

    this.audioGeneratorController.enqueue(audioEvent);
  }

  async endStream(): Promise<void> {
    if (!this.isStreaming) {
      return;
    }

    if (this.audioGeneratorController) {
      this.audioGeneratorController.close();
      this.audioGeneratorController = undefined;
    }

    this.audioStream = undefined;
    this.isStreaming = false;
  }

  getName(): string {
    return 'AWS Transcribe';
  }
}
