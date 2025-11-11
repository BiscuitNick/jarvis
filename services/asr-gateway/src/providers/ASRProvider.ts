/**
 * ASR Provider Interface
 * Defines the contract for all ASR providers (AWS Transcribe, Deepgram, Google, Azure)
 */

export interface TranscriptionResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  timestamp?: number;
}

export interface ASRConfig {
  languageCode?: string;
  sampleRate?: number;
  encoding?: string;
}

export interface ASRProvider {
  /**
   * Start a streaming transcription session
   * @param onTranscript Callback for receiving transcription results
   * @param onError Callback for error handling
   * @param config Optional ASR configuration
   */
  startStream(
    onTranscript: (result: TranscriptionResult) => void,
    onError: (error: Error) => void,
    config?: ASRConfig
  ): Promise<void>;

  /**
   * Send audio chunk to the ASR service
   * @param audioChunk PCM audio data
   */
  sendAudio(audioChunk: Buffer): Promise<void>;

  /**
   * End the streaming session
   */
  endStream(): Promise<void>;

  /**
   * Get provider name
   */
  getName(): string;
}
