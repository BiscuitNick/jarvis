/**
 * Transcription Result Processor
 * Handles real-time transcription results with partial and final aggregation
 */

import { EventEmitter } from 'node:events';
import { TranscriptionResult } from '../providers/ASRProvider';

export interface ProcessedTranscript {
  sessionId: string;
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  words?: TranscriptWord[];
  timestamp: number;
  provider: string;
  metadata?: Record<string, any>;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptionSession {
  id: string;
  provider: string;
  startTime: number;
  lastUpdateTime: number;
  partialTranscripts: string[];
  finalTranscripts: string[];
  totalWords: number;
  averageConfidence: number;
  minConfidenceThreshold: number;
}

export interface TranscriptionProcessorConfig {
  minConfidenceThreshold?: number;
  aggregationWindowMs?: number;
  maxPartialHistory?: number;
  enableWordTimestamps?: boolean;
}

export class TranscriptionProcessor extends EventEmitter {
  private sessions: Map<string, TranscriptionSession> = new Map();
  private config: Required<TranscriptionProcessorConfig>;
  private aggregationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: TranscriptionProcessorConfig = {}) {
    super();

    this.config = {
      minConfidenceThreshold: config.minConfidenceThreshold || 0.5,
      aggregationWindowMs: config.aggregationWindowMs || 500,
      maxPartialHistory: config.maxPartialHistory || 10,
      enableWordTimestamps: config.enableWordTimestamps !== false,
    };
  }

  /**
   * Create a new transcription session
   */
  createSession(sessionId: string, provider: string): void {
    const session: TranscriptionSession = {
      id: sessionId,
      provider,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      partialTranscripts: [],
      finalTranscripts: [],
      totalWords: 0,
      averageConfidence: 0,
      minConfidenceThreshold: this.config.minConfidenceThreshold,
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', { sessionId, provider });
  }

  /**
   * Process incoming transcription result
   */
  processResult(
    sessionId: string,
    result: TranscriptionResult,
    provider: string
  ): ProcessedTranscript | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      console.warn(`[TranscriptionProcessor] Session ${sessionId} not found`);
      return null;
    }

    // Filter by confidence threshold
    if (
      result.confidence !== undefined &&
      result.confidence < this.config.minConfidenceThreshold
    ) {
      this.emit('result:filtered', {
        sessionId,
        reason: 'low-confidence',
        confidence: result.confidence,
      });
      return null;
    }

    // Update session
    session.lastUpdateTime = Date.now();

    // Process partial vs final results
    if (result.isFinal) {
      session.finalTranscripts.push(result.transcript);
      session.partialTranscripts = []; // Clear partials after final

      // Update statistics
      const wordCount = result.transcript.split(/\s+/).length;
      session.totalWords += wordCount;

      if (result.confidence !== undefined) {
        // Update running average
        const totalResults = session.finalTranscripts.length;
        session.averageConfidence =
          (session.averageConfidence * (totalResults - 1) + result.confidence) /
          totalResults;
      }
    } else {
      // Keep recent partial results
      session.partialTranscripts.push(result.transcript);
      if (session.partialTranscripts.length > this.config.maxPartialHistory) {
        session.partialTranscripts.shift();
      }
    }

    // Create processed transcript
    const processed: ProcessedTranscript = {
      sessionId,
      transcript: result.transcript,
      isFinal: result.isFinal,
      confidence: result.confidence,
      timestamp: result.timestamp || Date.now(),
      provider,
      metadata: {
        sessionStartTime: session.startTime,
        totalWords: session.totalWords,
        averageConfidence: session.averageConfidence,
      },
    };

    // Emit event
    if (result.isFinal) {
      this.emit('transcript:final', processed);
    } else {
      this.emit('transcript:partial', processed);
    }

    return processed;
  }

  /**
   * Aggregate partial results within time window
   */
  aggregatePartials(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);

    if (!session || session.partialTranscripts.length === 0) {
      return null;
    }

    // Return the most recent partial (usually the most complete)
    return session.partialTranscripts[session.partialTranscripts.length - 1];
  }

  /**
   * Get complete transcript for session
   */
  getCompleteTranscript(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    return session.finalTranscripts.join(' ');
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      provider: session.provider,
      duration: Date.now() - session.startTime,
      totalWords: session.totalWords,
      finalTranscripts: session.finalTranscripts.length,
      partialTranscripts: session.partialTranscripts.length,
      averageConfidence: session.averageConfidence,
      lastUpdateTime: session.lastUpdateTime,
    };
  }

  /**
   * Normalize results across different provider formats
   */
  normalizeProviderResult(
    rawResult: any,
    provider: string
  ): TranscriptionResult {
    switch (provider) {
      case 'aws':
        return this.normalizeAWSResult(rawResult);
      case 'deepgram':
        return this.normalizeDeepgramResult(rawResult);
      case 'google':
        return this.normalizeGoogleResult(rawResult);
      case 'azure':
        return this.normalizeAzureResult(rawResult);
      default:
        return rawResult as TranscriptionResult;
    }
  }

  /**
   * End a transcription session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    // Clear any aggregation timers
    const timer = this.aggregationTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.aggregationTimers.delete(sessionId);
    }

    const stats = this.getSessionStats(sessionId);
    this.emit('session:ended', stats);

    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup old sessions
   */
  cleanupSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUpdateTime > maxAgeMs) {
        this.endSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emit('sessions:cleaned', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get processor statistics
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      configuration: this.config,
      sessions: Array.from(this.sessions.values()).map((s) => ({
        id: s.id,
        provider: s.provider,
        duration: Date.now() - s.startTime,
        totalWords: s.totalWords,
        averageConfidence: s.averageConfidence,
      })),
    };
  }

  /**
   * Private: Normalize AWS Transcribe result
   */
  private normalizeAWSResult(result: any): TranscriptionResult {
    // Already normalized in AWSTranscribeProvider
    return result;
  }

  /**
   * Private: Normalize Deepgram result
   */
  private normalizeDeepgramResult(result: any): TranscriptionResult {
    const channel = result.channel?.alternatives?.[0];

    return {
      transcript: channel?.transcript || '',
      isFinal: result.is_final || false,
      confidence: channel?.confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Private: Normalize Google Speech-to-Text result
   */
  private normalizeGoogleResult(result: any): TranscriptionResult {
    const alternative = result.results?.[0]?.alternatives?.[0];

    return {
      transcript: alternative?.transcript || '',
      isFinal: result.results?.[0]?.isFinal || false,
      confidence: alternative?.confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Private: Normalize Azure Speech result
   */
  private normalizeAzureResult(result: any): TranscriptionResult {
    return {
      transcript: result.text || '',
      isFinal: result.recognitionStatus === 'Success',
      confidence: result.confidence,
      timestamp: Date.now(),
    };
  }
}
