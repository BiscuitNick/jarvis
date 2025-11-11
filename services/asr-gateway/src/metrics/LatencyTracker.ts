/**
 * Latency Tracker
 * Monitors and tracks latency at each pipeline stage for performance optimization
 */

export interface LatencyStage {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

export interface LatencyMetrics {
  sessionId: string;
  stages: Map<string, LatencyStage>;
  totalLatency: number;
  firstTokenLatency: number;
  audioReceived: number;
  transcriptionStarted?: number;
  firstResultReceived?: number;
  finalResultReceived?: number;
}

export class LatencyTracker {
  private sessions: Map<string, LatencyMetrics> = new Map();
  private globalStats: {
    totalSessions: number;
    avgFirstTokenLatency: number;
    avgTotalLatency: number;
    p50FirstToken: number;
    p95FirstToken: number;
    p99FirstToken: number;
    latencySamples: number[];
  } = {
    totalSessions: 0,
    avgFirstTokenLatency: 0,
    avgTotalLatency: 0,
    p50FirstToken: 0,
    p95FirstToken: 0,
    p99FirstToken: 0,
    latencySamples: [],
  };

  /**
   * Start tracking a new session
   */
  startSession(sessionId: string): void {
    this.sessions.set(sessionId, {
      sessionId,
      stages: new Map(),
      totalLatency: 0,
      firstTokenLatency: 0,
      audioReceived: Date.now(),
    });
  }

  /**
   * Start a latency stage
   */
  startStage(sessionId: string, stageName: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[LatencyTracker] Session ${sessionId} not found`);
      return;
    }

    session.stages.set(stageName, {
      name: stageName,
      startTime: Date.now(),
    });
  }

  /**
   * End a latency stage
   */
  endStage(sessionId: string, stageName: string): number | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[LatencyTracker] Session ${sessionId} not found`);
      return undefined;
    }

    const stage = session.stages.get(stageName);
    if (!stage) {
      console.warn(`[LatencyTracker] Stage ${stageName} not found for session ${sessionId}`);
      return undefined;
    }

    stage.endTime = Date.now();
    stage.duration = stage.endTime - stage.startTime;

    return stage.duration;
  }

  /**
   * Record first token latency
   */
  recordFirstToken(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (!session.firstResultReceived) {
      session.firstResultReceived = Date.now();
      session.firstTokenLatency = session.firstResultReceived - session.audioReceived;

      // Add to global stats
      this.globalStats.latencySamples.push(session.firstTokenLatency);

      // Keep only last 1000 samples
      if (this.globalStats.latencySamples.length > 1000) {
        this.globalStats.latencySamples.shift();
      }

      // Update averages
      this.updateGlobalStats();
    }
  }

  /**
   * Record final result latency
   */
  recordFinalResult(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.finalResultReceived = Date.now();
    session.totalLatency = session.finalResultReceived - session.audioReceived;
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): LatencyMetrics | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * End session tracking
   */
  endSession(sessionId: string): LatencyMetrics | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.globalStats.totalSessions++;
      this.sessions.delete(sessionId);
      return session;
    }
    return undefined;
  }

  /**
   * Get global statistics
   */
  getGlobalStats() {
    return {
      ...this.globalStats,
      activeSessions: this.sessions.size,
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.sessions.clear();
    this.globalStats = {
      totalSessions: 0,
      avgFirstTokenLatency: 0,
      avgTotalLatency: 0,
      p50FirstToken: 0,
      p95FirstToken: 0,
      p99FirstToken: 0,
      latencySamples: [],
    };
  }

  /**
   * Private: Update global statistics
   */
  private updateGlobalStats(): void {
    const samples = this.globalStats.latencySamples;

    if (samples.length === 0) {
      return;
    }

    // Calculate average
    const sum = samples.reduce((acc, val) => acc + val, 0);
    this.globalStats.avgFirstTokenLatency = sum / samples.length;

    // Calculate percentiles
    const sorted = [...samples].sort((a, b) => a - b);
    this.globalStats.p50FirstToken = this.calculatePercentile(sorted, 0.5);
    this.globalStats.p95FirstToken = this.calculatePercentile(sorted, 0.95);
    this.globalStats.p99FirstToken = this.calculatePercentile(sorted, 0.99);
  }

  /**
   * Private: Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) {
      return 0;
    }

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Check if latency target is met
   */
  isLatencyTargetMet(targetMs: number = 500): boolean {
    return this.globalStats.p95FirstToken <= targetMs;
  }

  /**
   * Get latency report
   */
  getLatencyReport() {
    const stats = this.getGlobalStats();

    return {
      summary: {
        totalSessions: stats.totalSessions,
        activeSessions: stats.activeSessions,
        avgFirstTokenLatency: Math.round(stats.avgFirstTokenLatency),
        p50FirstToken: Math.round(stats.p50FirstToken),
        p95FirstToken: Math.round(stats.p95FirstToken),
        p99FirstToken: Math.round(stats.p99FirstToken),
        targetMet: this.isLatencyTargetMet(),
        target: '500ms',
      },
      recommendations: this.getRecommendations(),
    };
  }

  /**
   * Get optimization recommendations
   */
  private getRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.globalStats;

    if (stats.p95FirstToken > 500) {
      recommendations.push('P95 first token latency exceeds 500ms target');
    }

    if (stats.p50FirstToken > 300) {
      recommendations.push('Median latency is high - consider optimizing audio processing');
    }

    if (stats.p99FirstToken > 1000) {
      recommendations.push('P99 latency is very high - investigate outliers');
    }

    if (recommendations.length === 0) {
      recommendations.push('Latency performance is within acceptable range');
    }

    return recommendations;
  }
}
