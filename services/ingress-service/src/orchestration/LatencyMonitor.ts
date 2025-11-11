/**
 * LatencyMonitor.ts
 *
 * Monitors and tracks latency across the entire pipeline with distributed tracing.
 * Target: <500ms end-to-end latency for first token.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { PipelineState, PipelineStage } from './PipelineState';
import { Counter, Histogram, Gauge } from 'prom-client';

interface LatencyThresholds {
  firstToken: number; // Target: 500ms
  audioToAsr: number; // Target: 50ms
  asrToLlm: number; // Target: 100ms
  llmFirstToken: number; // Target: 300ms
  llmToTts: number; // Target: 50ms
  ttsToClient: number; // Target: 100ms
  endToEnd: number; // Target: 2000ms (full response)
}

interface LatencyAlert {
  pipelineId: string;
  sessionId: string;
  stage: string;
  actualMs: number;
  thresholdMs: number;
  timestamp: number;
}

export class LatencyMonitor extends EventEmitter {
  private thresholds: LatencyThresholds;
  private alerts: LatencyAlert[] = [];

  // Prometheus metrics
  private readonly latencyHistogram: Histogram;
  private readonly firstTokenHistogram: Histogram;
  private readonly stageLatencyHistogram: Histogram;
  private readonly latencyViolations: Counter;
  private readonly activePipelines: Gauge;

  constructor(thresholds?: Partial<LatencyThresholds>) {
    super();

    this.thresholds = {
      firstToken: thresholds?.firstToken || 500,
      audioToAsr: thresholds?.audioToAsr || 50,
      asrToLlm: thresholds?.asrToLlm || 100,
      llmFirstToken: thresholds?.llmFirstToken || 300,
      llmToTts: thresholds?.llmToTts || 50,
      ttsToClient: thresholds?.ttsToClient || 100,
      endToEnd: thresholds?.endToEnd || 2000,
    };

    // Initialize Prometheus metrics
    this.latencyHistogram = new Histogram({
      name: 'jarvis_pipeline_latency_seconds',
      help: 'End-to-end pipeline latency in seconds',
      labelNames: ['session_id', 'status'],
      buckets: [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0],
    });

    this.firstTokenHistogram = new Histogram({
      name: 'jarvis_first_token_latency_seconds',
      help: 'Time to first token (TTFT) in seconds',
      labelNames: ['session_id'],
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0],
    });

    this.stageLatencyHistogram = new Histogram({
      name: 'jarvis_stage_latency_seconds',
      help: 'Latency for individual pipeline stages',
      labelNames: ['stage', 'session_id'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0],
    });

    this.latencyViolations = new Counter({
      name: 'jarvis_latency_violations_total',
      help: 'Total count of latency threshold violations',
      labelNames: ['stage', 'session_id'],
    });

    this.activePipelines = new Gauge({
      name: 'jarvis_active_pipelines',
      help: 'Number of currently active pipelines',
    });

    logger.info({ thresholds: this.thresholds }, 'LatencyMonitor initialized');
  }

  /**
   * Start monitoring a pipeline
   */
  public startMonitoring(pipelineId: string, sessionId: string): void {
    this.activePipelines.inc();
    logger.debug({ pipelineId, sessionId }, 'Started monitoring pipeline');
  }

  /**
   * Stop monitoring a pipeline and record final metrics
   */
  public stopMonitoring(state: PipelineState): void {
    this.activePipelines.dec();

    const metrics = state.metrics;
    const sessionId = state.sessionId;

    // Record end-to-end latency
    if (metrics.totalLatency) {
      const latencySeconds = metrics.totalLatency / 1000;
      this.latencyHistogram.observe(
        { session_id: sessionId, status: state.stage === PipelineStage.COMPLETED ? 'completed' : 'failed' },
        latencySeconds
      );

      // Check for end-to-end violation
      if (metrics.totalLatency > this.thresholds.endToEnd) {
        this.recordViolation(state.id, sessionId, 'end-to-end', metrics.totalLatency, this.thresholds.endToEnd);
      }
    }

    // Record first token latency
    if (metrics.firstTokenLatency) {
      const ttftSeconds = metrics.firstTokenLatency / 1000;
      this.firstTokenHistogram.observe({ session_id: sessionId }, ttftSeconds);

      // Check for TTFT violation (critical metric)
      if (metrics.firstTokenLatency > this.thresholds.firstToken) {
        this.recordViolation(state.id, sessionId, 'first-token', metrics.firstTokenLatency, this.thresholds.firstToken);
      }
    }

    // Record stage-level latencies
    this.recordStageLatency(sessionId, 'audio-to-asr', metrics.audioToAsrLatency, this.thresholds.audioToAsr);
    this.recordStageLatency(sessionId, 'asr-to-llm', metrics.asrToLlmLatency, this.thresholds.asrToLlm);
    this.recordStageLatency(sessionId, 'llm-to-tts', metrics.llmToTtsLatency, this.thresholds.llmToTts);
    this.recordStageLatency(sessionId, 'tts-to-client', metrics.ttsToClientLatency, this.thresholds.ttsToClient);

    // Log summary
    logger.info(
      {
        pipelineId: state.id,
        sessionId,
        metrics: {
          totalLatency: metrics.totalLatency,
          firstTokenLatency: metrics.firstTokenLatency,
          audioToAsr: metrics.audioToAsrLatency,
          asrToLlm: metrics.asrToLlmLatency,
          llmToTts: metrics.llmToTtsLatency,
          ttsToClient: metrics.ttsToClientLatency,
        },
      },
      'Pipeline latency summary'
    );
  }

  /**
   * Record stage-level latency
   */
  private recordStageLatency(
    sessionId: string,
    stage: string,
    actualMs: number | undefined,
    thresholdMs: number
  ): void {
    if (actualMs === undefined) return;

    const latencySeconds = actualMs / 1000;
    this.stageLatencyHistogram.observe({ stage, session_id: sessionId }, latencySeconds);

    // Check for violation
    if (actualMs > thresholdMs) {
      this.latencyViolations.inc({ stage, session_id: sessionId });
    }
  }

  /**
   * Record a latency violation
   */
  private recordViolation(
    pipelineId: string,
    sessionId: string,
    stage: string,
    actualMs: number,
    thresholdMs: number
  ): void {
    const alert: LatencyAlert = {
      pipelineId,
      sessionId,
      stage,
      actualMs,
      thresholdMs,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Emit alert event
    this.emit('violation', alert);

    logger.warn(
      { alert },
      `Latency violation: ${stage} took ${actualMs}ms (threshold: ${thresholdMs}ms)`
    );
  }

  /**
   * Get recent latency violations
   */
  public getRecentViolations(limit: number = 10): LatencyAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get latency statistics
   */
  public getStats(): {
    thresholds: LatencyThresholds;
    totalViolations: number;
    violationsByStage: Record<string, number>;
    recentAlerts: LatencyAlert[];
  } {
    const violationsByStage: Record<string, number> = {};

    for (const alert of this.alerts) {
      violationsByStage[alert.stage] = (violationsByStage[alert.stage] || 0) + 1;
    }

    return {
      thresholds: { ...this.thresholds },
      totalViolations: this.alerts.length,
      violationsByStage,
      recentAlerts: this.alerts.slice(-5),
    };
  }

  /**
   * Update latency thresholds
   */
  public updateThresholds(newThresholds: Partial<LatencyThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };

    logger.info({ thresholds: this.thresholds }, 'Updated latency thresholds');
  }

  /**
   * Clear alert history
   */
  public clearAlerts(): void {
    this.alerts = [];
    logger.info('Cleared latency alert history');
  }

  /**
   * Shutdown monitor
   */
  public shutdown(): void {
    logger.info('Shutting down LatencyMonitor');
    this.removeAllListeners();
  }
}
