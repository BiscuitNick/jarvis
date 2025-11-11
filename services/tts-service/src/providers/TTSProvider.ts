/**
 * TTS Provider Interface
 * Defines the contract for all TTS providers (Google Cloud TTS, Azure TTS, ElevenLabs)
 */

export interface VoiceConfig {
  voiceId?: string;
  languageCode?: string;
  gender?: 'male' | 'female' | 'neutral';
  name?: string;
}

export interface AudioConfig {
  audioEncoding?: 'mp3' | 'wav' | 'pcm' | 'opus';
  sampleRateHertz?: number;
  pitch?: number;
  speakingRate?: number;
  volumeGainDb?: number;
}

export interface SynthesisRequest {
  text: string;
  voice?: VoiceConfig;
  audio?: AudioConfig;
}

export interface SynthesisResult {
  audioContent: Buffer;
  audioEncoding: string;
  sampleRate: number;
  duration?: number;
}

export interface TTSProvider {
  /**
   * Synthesize speech from text
   * @param request Synthesis request with text and configuration
   * @returns Synthesized audio buffer
   */
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;

  /**
   * Stream speech synthesis for real-time output
   * @param request Synthesis request
   * @param onAudioChunk Callback for receiving audio chunks
   * @param onError Callback for error handling
   */
  synthesizeStream(
    request: SynthesisRequest,
    onAudioChunk: (chunk: Buffer) => void,
    onError: (error: Error) => void
  ): Promise<void>;

  /**
   * List available voices for this provider
   * @param languageCode Optional language filter
   */
  listVoices(languageCode?: string): Promise<VoiceConfig[]>;

  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Check if provider is available/configured
   */
  isAvailable(): boolean;
}
