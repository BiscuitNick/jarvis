/**
 * PipelineState.ts
 *
 * Manages the state of a real-time voice assistant pipeline.
 * Tracks the flow through: Audio → ASR → LLM+RAG → TTS → Client
 */

export enum PipelineStage {
  IDLE = 'idle',
  AUDIO_CAPTURE = 'audio_capture',
  ASR_PROCESSING = 'asr_processing',
  LLM_PROCESSING = 'llm_processing',
  RAG_RETRIEVAL = 'rag_retrieval',
  TTS_SYNTHESIS = 'tts_synthesis',
  AUDIO_PLAYBACK = 'audio_playback',
  COMPLETED = 'completed',
  ERROR = 'error',
  INTERRUPTED = 'interrupted',
}

export interface PipelineMetrics {
  startTime: number;
  audioToAsrLatency?: number;
  asrToLlmLatency?: number;
  llmToTtsLatency?: number;
  ttsToClientLatency?: number;
  totalLatency?: number;
  firstTokenLatency?: number;
  asrPartialCount: number;
  llmTokenCount: number;
  ttsChunkCount: number;
}

export interface PipelineContext {
  sessionId: string;
  userId: string;
  conversationHistory: Array<{ role: string; content: string; timestamp: number }>;
  currentTranscript: string;
  currentResponse: string;
  ragContext?: {
    documents: any[];
    citations: string[];
  };
  metadata: {
    intent?: string;
    grounding?: any;
    voiceSettings?: {
      speed?: number;
      voice?: string;
    };
  };
}

export class PipelineState {
  public readonly id: string;
  public readonly sessionId: string;
  public stage: PipelineStage;
  public context: PipelineContext;
  public metrics: PipelineMetrics;
  public error?: Error;
  public isInterrupted: boolean = false;

  private stageHistory: Array<{ stage: PipelineStage; timestamp: number }> = [];
  private startTime: number;

  constructor(sessionId: string, userId: string) {
    this.id = `pipeline-${sessionId}-${Date.now()}`;
    this.sessionId = sessionId;
    this.stage = PipelineStage.IDLE;
    this.startTime = Date.now();

    this.context = {
      sessionId,
      userId,
      conversationHistory: [],
      currentTranscript: '',
      currentResponse: '',
      metadata: {},
    };

    this.metrics = {
      startTime: this.startTime,
      asrPartialCount: 0,
      llmTokenCount: 0,
      ttsChunkCount: 0,
    };
  }

  /**
   * Transition to a new pipeline stage
   */
  public transitionTo(newStage: PipelineStage): void {
    const now = Date.now();
    this.stageHistory.push({ stage: this.stage, timestamp: now });

    // Calculate latency between stages
    switch (newStage) {
      case PipelineStage.ASR_PROCESSING:
        this.metrics.audioToAsrLatency = now - this.startTime;
        break;
      case PipelineStage.LLM_PROCESSING:
        if (this.stage === PipelineStage.ASR_PROCESSING) {
          this.metrics.asrToLlmLatency = now - (this.stageHistory[this.stageHistory.length - 1]?.timestamp || now);
        }
        break;
      case PipelineStage.TTS_SYNTHESIS:
        if (this.stage === PipelineStage.LLM_PROCESSING) {
          this.metrics.llmToTtsLatency = now - (this.stageHistory[this.stageHistory.length - 1]?.timestamp || now);
        }
        break;
      case PipelineStage.AUDIO_PLAYBACK:
        if (this.stage === PipelineStage.TTS_SYNTHESIS) {
          this.metrics.ttsToClientLatency = now - (this.stageHistory[this.stageHistory.length - 1]?.timestamp || now);
        }
        break;
      case PipelineStage.COMPLETED:
        this.metrics.totalLatency = now - this.startTime;
        break;
    }

    this.stage = newStage;
  }

  /**
   * Mark first token received (for latency measurement)
   */
  public markFirstToken(): void {
    if (!this.metrics.firstTokenLatency) {
      this.metrics.firstTokenLatency = Date.now() - this.startTime;
    }
  }

  /**
   * Update transcript with partial or final result
   */
  public updateTranscript(transcript: string, isFinal: boolean): void {
    this.context.currentTranscript = transcript;
    this.metrics.asrPartialCount++;
  }

  /**
   * Append to current LLM response
   */
  public appendResponse(chunk: string): void {
    this.context.currentResponse += chunk;
    this.metrics.llmTokenCount++;
  }

  /**
   * Add RAG context to the pipeline
   */
  public setRagContext(documents: any[], citations: string[]): void {
    this.context.ragContext = { documents, citations };
  }

  /**
   * Add a conversation turn to history
   */
  public addToHistory(role: string, content: string): void {
    this.context.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Mark pipeline as interrupted
   */
  public interrupt(): void {
    this.isInterrupted = true;
    this.stage = PipelineStage.INTERRUPTED;
  }

  /**
   * Set error state
   */
  public setError(error: Error): void {
    this.error = error;
    this.stage = PipelineStage.ERROR;
  }

  /**
   * Check if pipeline can proceed (not interrupted or errored)
   */
  public canProceed(): boolean {
    return !this.isInterrupted && this.stage !== PipelineStage.ERROR && this.stage !== PipelineStage.COMPLETED;
  }

  /**
   * Get a snapshot of current state for monitoring
   */
  public getSnapshot() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      stage: this.stage,
      metrics: { ...this.metrics },
      context: {
        transcriptLength: this.context.currentTranscript.length,
        responseLength: this.context.currentResponse.length,
        historyLength: this.context.conversationHistory.length,
        hasRagContext: !!this.context.ragContext,
      },
      isInterrupted: this.isInterrupted,
      error: this.error?.message,
      stageHistory: [...this.stageHistory],
    };
  }
}
