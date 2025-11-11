/**
 * InterruptionHandler.ts
 *
 * Manages interruption detection and propagation throughout the pipeline.
 * Handles barge-in scenarios where the user starts speaking while the assistant is responding.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { PipelineOrchestrator } from './PipelineOrchestrator';

interface InterruptionConfig {
  vadThreshold: number; // Voice Activity Detection threshold (0-1)
  vadDurationMs: number; // Minimum duration to consider as interruption
  cooldownMs: number; // Cooldown period after interruption
}

interface InterruptionEvent {
  pipelineId: string;
  sessionId: string;
  timestamp: number;
  trigger: 'vad' | 'manual' | 'timeout';
  confidence: number;
}

export class InterruptionHandler extends EventEmitter {
  private config: InterruptionConfig;
  private orchestrator: PipelineOrchestrator;
  private recentInterruptions: Map<string, InterruptionEvent[]> = new Map();
  private cooldownTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(orchestrator: PipelineOrchestrator, config?: Partial<InterruptionConfig>) {
    super();
    this.orchestrator = orchestrator;
    this.config = {
      vadThreshold: config?.vadThreshold || 0.7,
      vadDurationMs: config?.vadDurationMs || 150, // <150ms requirement
      cooldownMs: config?.cooldownMs || 1000,
    };

    logger.info({ config: this.config }, 'InterruptionHandler initialized');
  }

  /**
   * Handle Voice Activity Detection signal
   */
  public async handleVAD(
    pipelineId: string,
    sessionId: string,
    confidence: number,
    durationMs: number
  ): Promise<void> {
    const pipeline = this.orchestrator.getPipelineState(pipelineId);
    if (!pipeline) {
      logger.warn({ pipelineId }, 'Pipeline not found for VAD signal');
      return;
    }

    // Check if we're in a cooldown period
    if (this.isInCooldown(sessionId)) {
      logger.debug({ sessionId }, 'Ignoring VAD during cooldown period');
      return;
    }

    // Check if VAD meets threshold and duration requirements
    if (confidence < this.config.vadThreshold) {
      logger.debug({ sessionId, confidence, threshold: this.config.vadThreshold }, 'VAD confidence below threshold');
      return;
    }

    if (durationMs < this.config.vadDurationMs) {
      logger.debug({ sessionId, durationMs, required: this.config.vadDurationMs }, 'VAD duration below minimum');
      return;
    }

    // Trigger interruption
    await this.triggerInterruption(pipelineId, sessionId, 'vad', confidence);
  }

  /**
   * Manually trigger interruption (e.g., from UI button)
   */
  public async manualInterrupt(pipelineId: string, sessionId: string): Promise<void> {
    await this.triggerInterruption(pipelineId, sessionId, 'manual', 1.0);
  }

  /**
   * Trigger interruption and propagate through pipeline
   */
  private async triggerInterruption(
    pipelineId: string,
    sessionId: string,
    trigger: 'vad' | 'manual' | 'timeout',
    confidence: number
  ): Promise<void> {
    const event: InterruptionEvent = {
      pipelineId,
      sessionId,
      timestamp: Date.now(),
      trigger,
      confidence,
    };

    logger.info({ event }, 'Triggering pipeline interruption');

    // Record interruption
    this.recordInterruption(sessionId, event);

    // Interrupt the pipeline via orchestrator
    await this.orchestrator.interruptPipeline(pipelineId);

    // Emit interruption event
    this.emit('interruption', event);
    this.emit(`interruption:${sessionId}`, event);
    this.emit(`interruption:${pipelineId}`, event);

    // Start cooldown period
    this.startCooldown(sessionId);
  }

  /**
   * Record interruption event for analytics
   */
  private recordInterruption(sessionId: string, event: InterruptionEvent): void {
    if (!this.recentInterruptions.has(sessionId)) {
      this.recentInterruptions.set(sessionId, []);
    }

    const events = this.recentInterruptions.get(sessionId)!;
    events.push(event);

    // Keep only last 10 interruptions per session
    if (events.length > 10) {
      events.shift();
    }
  }

  /**
   * Check if session is in cooldown period
   */
  private isInCooldown(sessionId: string): boolean {
    return this.cooldownTimers.has(sessionId);
  }

  /**
   * Start cooldown period for a session
   */
  private startCooldown(sessionId: string): void {
    // Clear existing cooldown if any
    const existingTimer = this.cooldownTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new cooldown
    const timer = setTimeout(() => {
      this.cooldownTimers.delete(sessionId);
      logger.debug({ sessionId }, 'Cooldown period ended');
    }, this.config.cooldownMs);

    this.cooldownTimers.set(sessionId, timer);
  }

  /**
   * Get interruption statistics for a session
   */
  public getSessionStats(sessionId: string): {
    totalInterruptions: number;
    byTrigger: Record<string, number>;
    avgConfidence: number;
    recentEvents: InterruptionEvent[];
  } {
    const events = this.recentInterruptions.get(sessionId) || [];

    const byTrigger: Record<string, number> = {};
    let totalConfidence = 0;

    for (const event of events) {
      byTrigger[event.trigger] = (byTrigger[event.trigger] || 0) + 1;
      totalConfidence += event.confidence;
    }

    return {
      totalInterruptions: events.length,
      byTrigger,
      avgConfidence: events.length > 0 ? totalConfidence / events.length : 0,
      recentEvents: events.slice(-5),
    };
  }

  /**
   * Clear interruption history for a session
   */
  public clearSessionHistory(sessionId: string): void {
    this.recentInterruptions.delete(sessionId);

    const timer = this.cooldownTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cooldownTimers.delete(sessionId);
    }
  }

  /**
   * Cleanup resources
   */
  public shutdown(): void {
    logger.info('Shutting down InterruptionHandler');

    // Clear all cooldown timers
    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }

    this.cooldownTimers.clear();
    this.recentInterruptions.clear();
    this.removeAllListeners();
  }
}
