/**
 * Audio Processor
 * Integrates VAD with ASR streaming pipeline for optimized audio processing
 */

import { EventEmitter } from 'events';
import { VoiceActivityDetector, VADConfig } from './VoiceActivityDetector';
import { ASRProvider } from '../providers/ASRProvider';

export interface AudioProcessorConfig {
  vadConfig?: VADConfig;
  enableVAD?: boolean;
  maxBufferSize?: number; // Maximum audio buffer size in bytes
  flushInterval?: number; // Interval to flush audio buffer (ms)
  bypassVADOnStart?: boolean; // Send initial audio without VAD for faster response
}

export class AudioProcessor extends EventEmitter {
  private vad: VoiceActivityDetector;
  private config: Required<AudioProcessorConfig>;
  private asrProvider: ASRProvider | null = null;
  private audioQueue: Buffer[] = [];
  private isProcessing: boolean = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private bypassedInitialChunks: number = 0;
  private readonly BYPASS_CHUNK_COUNT = 5; // Number of initial chunks to bypass VAD

  constructor(config: AudioProcessorConfig = {}) {
    super();

    this.config = {
      vadConfig: config.vadConfig || {},
      enableVAD: config.enableVAD !== false,
      maxBufferSize: config.maxBufferSize || 1024 * 1024, // 1MB
      flushInterval: config.flushInterval || 100, // 100ms
      bypassVADOnStart: config.bypassVADOnStart !== false,
    };

    this.vad = new VoiceActivityDetector(this.config.vadConfig);

    // Setup VAD event listeners
    this.vad.on('speech:start', (event) => {
      console.log('[AudioProcessor] Speech started', event);
      this.emit('speech:start', event);
    });

    this.vad.on('speech:end', (event) => {
      console.log('[AudioProcessor] Speech ended', event);
      this.emit('speech:end', event);
      this.flushAudioQueue();
    });
  }

  /**
   * Set the ASR provider for audio streaming
   */
  setASRProvider(provider: ASRProvider): void {
    this.asrProvider = provider;
  }

  /**
   * Process incoming audio chunk
   */
  async processAudioChunk(audioChunk: Buffer): Promise<void> {
    if (!this.asrProvider) {
      throw new Error('ASR provider not set');
    }

    // If VAD is disabled, send audio directly
    if (!this.config.enableVAD) {
      await this.asrProvider.sendAudio(audioChunk);
      return;
    }

    // Bypass VAD for initial chunks to get faster first response
    if (this.config.bypassVADOnStart && this.bypassedInitialChunks < this.BYPASS_CHUNK_COUNT) {
      this.bypassedInitialChunks++;
      await this.asrProvider.sendAudio(audioChunk);
      return;
    }

    // Process with VAD
    const vadResult = this.vad.process(audioChunk);

    this.emit('vad:result', vadResult);

    // If speech is detected, queue audio for processing
    if (vadResult.isSpeech || this.vad.getState() === 'speech') {
      this.audioQueue.push(audioChunk);

      // Check if we need to flush the queue
      const totalBufferSize = this.audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
      if (totalBufferSize >= this.config.maxBufferSize) {
        await this.flushAudioQueue();
      } else {
        // Start flush timer if not already running
        this.startFlushTimer();
      }
    } else {
      // During silence, flush any remaining audio
      if (this.audioQueue.length > 0) {
        await this.flushAudioQueue();
      }
    }
  }

  /**
   * Flush audio queue to ASR provider
   */
  private async flushAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0 || !this.asrProvider) {
      return;
    }

    // Stop flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Process queued audio
    const chunksToProcess = [...this.audioQueue];
    this.audioQueue = [];

    try {
      for (const chunk of chunksToProcess) {
        await this.asrProvider.sendAudio(chunk);
      }

      this.emit('audio:flushed', {
        chunkCount: chunksToProcess.length,
        totalBytes: chunksToProcess.reduce((sum, chunk) => sum + chunk.length, 0),
      });
    } catch (error) {
      console.error('[AudioProcessor] Error flushing audio queue:', error);
      this.emit('error', error);
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushAudioQueue();
    }, this.config.flushInterval);
  }

  /**
   * Force flush all buffered audio
   */
  async flush(): Promise<void> {
    await this.flushAudioQueue();
  }

  /**
   * Reset processor state
   */
  reset(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.vad.reset();
    this.audioQueue = [];
    this.asrProvider = null;
    this.bypassedInitialChunks = 0;
  }

  /**
   * Enable or disable VAD
   */
  setVADEnabled(enabled: boolean): void {
    this.config.enableVAD = enabled;

    if (!enabled && this.audioQueue.length > 0) {
      this.flushAudioQueue();
    }
  }

  /**
   * Get VAD state
   */
  getVADState(): 'silence' | 'speech' {
    return this.vad.getState();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      vadEnabled: this.config.enableVAD,
      queuedChunks: this.audioQueue.length,
      queuedBytes: this.audioQueue.reduce((sum, chunk) => sum + chunk.length, 0),
      bypassedChunks: this.bypassedInitialChunks,
      vadState: this.vad.getState(),
      vadStats: this.vad.getStats(),
    };
  }

  /**
   * Update VAD configuration
   */
  updateVADConfig(config: Partial<VADConfig>): void {
    // Create a new VAD with updated config
    const currentConfig = this.vad.getConfig();
    this.vad = new VoiceActivityDetector({ ...currentConfig, ...config });

    // Re-setup event listeners
    this.vad.on('speech:start', (event) => {
      console.log('[AudioProcessor] Speech started', event);
      this.emit('speech:start', event);
    });

    this.vad.on('speech:end', (event) => {
      console.log('[AudioProcessor] Speech ended', event);
      this.emit('speech:end', event);
      this.flushAudioQueue();
    });
  }
}
