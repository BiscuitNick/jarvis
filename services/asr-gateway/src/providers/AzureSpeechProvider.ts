/**
 * Azure Speech Services Provider
 * Implements real-time speech-to-text using Azure Cognitive Services Speech SDK
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { ASRProvider, TranscriptionResult, ASRConfig } from './ASRProvider';

export class AzureSpeechProvider implements ASRProvider {
  private speechConfig: sdk.SpeechConfig;
  private recognizer: sdk.SpeechRecognizer | null = null;
  private pushStream: sdk.PushAudioInputStream | null = null;
  private isStreaming: boolean = false;

  constructor(subscriptionKey: string, region: string) {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
    this.speechConfig.speechRecognitionLanguage = 'en-US';
    this.speechConfig.enableDictation();
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
      // Set language
      this.speechConfig.speechRecognitionLanguage = languageCode;

      // Create push stream for audio input
      const audioFormat = sdk.AudioStreamFormat.getWaveFormatPCM(sampleRate, 16, 1);
      this.pushStream = sdk.AudioInputStream.createPushStream(audioFormat);

      // Create audio config from push stream
      const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);

      // Create speech recognizer
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      // Handle recognizing event (partial results)
      this.recognizer.recognizing = (s, e) => {
        if (e.result.text) {
          onTranscript({
            transcript: e.result.text,
            isFinal: false,
            timestamp: Date.now(),
          });
        }
      };

      // Handle recognized event (final results)
      this.recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
          onTranscript({
            transcript: e.result.text,
            isFinal: true,
            confidence: e.result.properties?.getProperty(
              sdk.PropertyId.SpeechServiceResponse_JsonResult
            ) ? this.extractConfidence(e.result) : undefined,
            timestamp: Date.now(),
          });
        } else if (e.result.reason === sdk.ResultReason.NoMatch) {
          console.log('[AzureSpeechProvider] No speech recognized');
        }
      };

      // Handle errors
      this.recognizer.canceled = (s, e) => {
        console.error('[AzureSpeechProvider] Recognition canceled:', e.errorDetails);
        onError(new Error(e.errorDetails || 'Azure Speech recognition canceled'));
        this.isStreaming = false;
      };

      // Handle session events
      this.recognizer.sessionStopped = (s, e) => {
        console.log('[AzureSpeechProvider] Session stopped');
        this.isStreaming = false;
      };

      // Start continuous recognition
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          console.log('[AzureSpeechProvider] Recognition started');
          this.isStreaming = true;
        },
        (error) => {
          console.error('[AzureSpeechProvider] Failed to start recognition:', error);
          this.isStreaming = false;
          onError(new Error(error));
        }
      );
    } catch (error) {
      this.isStreaming = false;
      onError(error as Error);
    }
  }

  private extractConfidence(result: sdk.SpeechRecognitionResult): number | undefined {
    try {
      const jsonResult = result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult
      );
      if (jsonResult) {
        const parsed = JSON.parse(jsonResult);
        return parsed.NBest?.[0]?.Confidence;
      }
    } catch (error) {
      console.error('[AzureSpeechProvider] Error extracting confidence:', error);
    }
    return undefined;
  }

  async sendAudio(audioChunk: Buffer): Promise<void> {
    if (!this.isStreaming || !this.pushStream) {
      throw new Error('Stream not active');
    }

    // Push audio chunk to the stream
    this.pushStream.write(audioChunk);
  }

  async endStream(): Promise<void> {
    if (!this.isStreaming) {
      return;
    }

    try {
      // Close push stream
      if (this.pushStream) {
        this.pushStream.close();
        this.pushStream = null;
      }

      // Stop recognition
      if (this.recognizer) {
        await new Promise<void>((resolve) => {
          this.recognizer!.stopContinuousRecognitionAsync(
            () => {
              console.log('[AzureSpeechProvider] Recognition stopped');
              resolve();
            },
            (error) => {
              console.error('[AzureSpeechProvider] Error stopping recognition:', error);
              resolve();
            }
          );
        });

        this.recognizer.close();
        this.recognizer = null;
      }

      this.isStreaming = false;
    } catch (error) {
      console.error('[AzureSpeechProvider] Error ending stream:', error);
      this.isStreaming = false;
      this.pushStream = null;
      this.recognizer = null;
    }
  }

  getName(): string {
    return 'Azure Speech Services';
  }
}
