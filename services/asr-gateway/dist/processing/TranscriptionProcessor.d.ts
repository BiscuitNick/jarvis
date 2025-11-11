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
export declare class TranscriptionProcessor extends EventEmitter {
    private sessions;
    private config;
    private aggregationTimers;
    constructor(config?: TranscriptionProcessorConfig);
    /**
     * Create a new transcription session
     */
    createSession(sessionId: string, provider: string): void;
    /**
     * Process incoming transcription result
     */
    processResult(sessionId: string, result: TranscriptionResult, provider: string): ProcessedTranscript | null;
    /**
     * Aggregate partial results within time window
     */
    aggregatePartials(sessionId: string): string | null;
    /**
     * Get complete transcript for session
     */
    getCompleteTranscript(sessionId: string): string | null;
    /**
     * Get session statistics
     */
    getSessionStats(sessionId: string): {
        sessionId: string;
        provider: string;
        duration: number;
        totalWords: number;
        finalTranscripts: number;
        partialTranscripts: number;
        averageConfidence: number;
        lastUpdateTime: number;
    } | null;
    /**
     * Normalize results across different provider formats
     */
    normalizeProviderResult(rawResult: any, provider: string): TranscriptionResult;
    /**
     * End a transcription session
     */
    endSession(sessionId: string): void;
    /**
     * Cleanup old sessions
     */
    cleanupSessions(maxAgeMs?: number): number;
    /**
     * Get all active sessions
     */
    getActiveSessions(): string[];
    /**
     * Get processor statistics
     */
    getStats(): {
        activeSessions: number;
        configuration: Required<TranscriptionProcessorConfig>;
        sessions: {
            id: string;
            provider: string;
            duration: number;
            totalWords: number;
            averageConfidence: number;
        }[];
    };
    /**
     * Private: Normalize AWS Transcribe result
     */
    private normalizeAWSResult;
    /**
     * Private: Normalize Deepgram result
     */
    private normalizeDeepgramResult;
    /**
     * Private: Normalize Google Speech-to-Text result
     */
    private normalizeGoogleResult;
    /**
     * Private: Normalize Azure Speech result
     */
    private normalizeAzureResult;
}
//# sourceMappingURL=TranscriptionProcessor.d.ts.map