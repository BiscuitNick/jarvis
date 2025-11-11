/**
 * Voice Activity Detector
 * Implements energy-based VAD for detecting speech vs silence in audio streams
 */

import { EventEmitter } from 'events';

export interface VADConfig {
  sampleRate?: number;
  energyThreshold?: number;
  silenceThreshold?: number;
  minSpeechDuration?: number; // ms
  minSilenceDuration?: number; // ms
  preSpeechPadding?: number; // ms
  postSpeechPadding?: number; // ms
}

export interface VADResult {
  isSpeech: boolean;
  energy: number;
  timestamp: number;
}

export class VoiceActivityDetector extends EventEmitter {
  private config: Required<VADConfig>;
  private speechState: 'silence' | 'speech' = 'silence';
  private speechStartTime: number = 0;
  private silenceStartTime: number = 0;
  private audioBuffer: Buffer[] = [];
  private preSpeechBuffer: Buffer[] = [];
  private maxPreSpeechBufferSize: number;
  private lastEnergyValues: number[] = [];
  private adaptiveThreshold: number;

  constructor(config: VADConfig = {}) {
    super();

    this.config = {
      sampleRate: config.sampleRate || 16000,
      energyThreshold: config.energyThreshold || 0.01,
      silenceThreshold: config.silenceThreshold || 0.005,
      minSpeechDuration: config.minSpeechDuration || 250, // 250ms
      minSilenceDuration: config.minSilenceDuration || 500, // 500ms
      preSpeechPadding: config.preSpeechPadding || 300, // 300ms
      postSpeechPadding: config.postSpeechPadding || 300, // 300ms
    };

    this.adaptiveThreshold = this.config.energyThreshold;

    // Calculate max pre-speech buffer size based on padding and sample rate
    // Assuming 16-bit PCM mono audio
    const bytesPerMs = (this.config.sampleRate * 2) / 1000;
    this.maxPreSpeechBufferSize = Math.ceil(this.config.preSpeechPadding / 20); // Assuming 20ms chunks
  }

  /**
   * Process an audio chunk and detect voice activity
   */
  process(audioChunk: Buffer): VADResult {
    const energy = this.calculateEnergy(audioChunk);
    const timestamp = Date.now();

    // Update adaptive threshold
    this.updateAdaptiveThreshold(energy);

    // Determine if current chunk contains speech
    const isSpeech = energy > this.adaptiveThreshold;

    // Handle state transitions
    if (isSpeech) {
      this.handleSpeechDetected(audioChunk, energy, timestamp);
    } else {
      this.handleSilenceDetected(audioChunk, energy, timestamp);
    }

    return {
      isSpeech: this.speechState === 'speech',
      energy,
      timestamp,
    };
  }

  /**
   * Get buffered audio chunks
   */
  getBufferedAudio(): Buffer[] {
    return this.audioBuffer;
  }

  /**
   * Clear audio buffer
   */
  clearBuffer(): void {
    this.audioBuffer = [];
    this.preSpeechBuffer = [];
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.speechState = 'silence';
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.clearBuffer();
    this.lastEnergyValues = [];
    this.adaptiveThreshold = this.config.energyThreshold;
  }

  /**
   * Get current state
   */
  getState(): 'silence' | 'speech' {
    return this.speechState;
  }

  /**
   * Private: Calculate RMS energy of audio chunk
   */
  private calculateEnergy(audioChunk: Buffer): number {
    let sum = 0;
    const samples = audioChunk.length / 2; // 16-bit samples

    for (let i = 0; i < audioChunk.length; i += 2) {
      const sample = audioChunk.readInt16LE(i) / 32768.0; // Normalize to [-1, 1]
      sum += sample * sample;
    }

    return Math.sqrt(sum / samples);
  }

  /**
   * Private: Update adaptive threshold based on recent energy values
   */
  private updateAdaptiveThreshold(energy: number): void {
    this.lastEnergyValues.push(energy);

    // Keep only last 100 values
    if (this.lastEnergyValues.length > 100) {
      this.lastEnergyValues.shift();
    }

    // Calculate median of recent energy values
    if (this.lastEnergyValues.length >= 20) {
      const sorted = [...this.lastEnergyValues].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      // Adaptive threshold is median + some margin
      this.adaptiveThreshold = Math.max(
        this.config.silenceThreshold,
        Math.min(this.config.energyThreshold, median * 2)
      );
    }
  }

  /**
   * Private: Handle speech detection
   */
  private handleSpeechDetected(audioChunk: Buffer, energy: number, timestamp: number): void {
    if (this.speechState === 'silence') {
      // Transition from silence to speech
      this.speechStartTime = timestamp;
      this.silenceStartTime = 0;

      // Include pre-speech buffer
      this.audioBuffer = [...this.preSpeechBuffer];
      this.preSpeechBuffer = [];

      this.audioBuffer.push(audioChunk);

      // Only emit speech-start if we don't have minimum duration requirement yet
      this.emit('speech:start', {
        timestamp,
        energy,
        preSpeechBufferSize: this.audioBuffer.length,
      });

      this.speechState = 'speech';
    } else {
      // Continue speech
      this.audioBuffer.push(audioChunk);
      this.silenceStartTime = 0; // Reset silence timer
    }
  }

  /**
   * Private: Handle silence detection
   */
  private handleSilenceDetected(audioChunk: Buffer, energy: number, timestamp: number): void {
    if (this.speechState === 'speech') {
      // Potential end of speech
      if (this.silenceStartTime === 0) {
        this.silenceStartTime = timestamp;
      }

      const silenceDuration = timestamp - this.silenceStartTime;

      // Add to buffer during post-speech padding
      const speechDuration = timestamp - this.speechStartTime;
      if (silenceDuration < this.config.postSpeechPadding) {
        this.audioBuffer.push(audioChunk);
      }

      // Check if we've met minimum silence duration
      if (silenceDuration >= this.config.minSilenceDuration &&
          speechDuration >= this.config.minSpeechDuration) {
        // Emit speech-end with buffered audio
        this.emit('speech:end', {
          timestamp,
          speechDuration,
          silenceDuration,
          audioChunks: this.audioBuffer,
        });

        this.speechState = 'silence';
        this.speechStartTime = 0;
        this.silenceStartTime = 0;
        this.audioBuffer = [];
      }
    } else {
      // Continue silence - maintain pre-speech buffer
      this.preSpeechBuffer.push(audioChunk);

      if (this.preSpeechBuffer.length > this.maxPreSpeechBufferSize) {
        this.preSpeechBuffer.shift();
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Required<VADConfig> {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      state: this.speechState,
      speechStartTime: this.speechStartTime,
      silenceStartTime: this.silenceStartTime,
      bufferedChunks: this.audioBuffer.length,
      preSpeechBufferSize: this.preSpeechBuffer.length,
      adaptiveThreshold: this.adaptiveThreshold,
      lastEnergyValues: this.lastEnergyValues.slice(-10),
    };
  }
}
