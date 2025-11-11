/**
 * Provider Manager
 * Manages ASR provider health monitoring, failover, and quality-based switching
 */

import { EventEmitter } from 'events';
import { ASRProvider } from './ASRProvider';
import { AWSTranscribeProvider } from './AWSTranscribeProvider';
import { DeepgramProvider } from './DeepgramProvider';
import { GoogleSpeechProvider } from './GoogleSpeechProvider';
import { AzureSpeechProvider } from './AzureSpeechProvider';

export interface ProviderHealth {
  providerName: string;
  isHealthy: boolean;
  errorCount: number;
  successCount: number;
  averageConfidence: number;
  averageLatency: number;
  wordErrorRate?: number;
  lastError?: Error;
  lastErrorTime?: number;
  lastSuccessTime?: number;
}

export interface ProviderConfig {
  type: 'aws' | 'deepgram' | 'google' | 'azure';
  priority: number;
  enabled: boolean;
  config?: any;
}

export interface ProviderManagerOptions {
  providers: ProviderConfig[];
  healthCheckInterval?: number;
  errorThreshold?: number;
  confidenceThreshold?: number;
  werThreshold?: number;
  failoverDelay?: number;
}

export class ProviderManager extends EventEmitter {
  private providers: Map<string, ASRProvider> = new Map();
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private providerPriority: Map<string, number> = new Map();
  private activeProvider: string | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private options: Required<ProviderManagerOptions>;

  constructor(options: ProviderManagerOptions) {
    super();
    this.options = {
      providers: options.providers,
      healthCheckInterval: options.healthCheckInterval || 30000,
      errorThreshold: options.errorThreshold || 5,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      werThreshold: options.werThreshold || 0.15,
      failoverDelay: options.failoverDelay || 5000,
    };

    this.initializeProviders();
    this.startHealthMonitoring();
  }

  private initializeProviders(): void {
    for (const providerConfig of this.options.providers) {
      if (!providerConfig.enabled) continue;

      let provider: ASRProvider | null = null;

      try {
        switch (providerConfig.type) {
          case 'aws':
            provider = new AWSTranscribeProvider(
              providerConfig.config?.region || process.env.AWS_REGION || 'us-east-1'
            );
            break;
          case 'deepgram':
            provider = new DeepgramProvider(
              providerConfig.config?.apiKey || process.env.DEEPGRAM_API_KEY || ''
            );
            break;
          case 'google':
            provider = new GoogleSpeechProvider(providerConfig.config?.credentials);
            break;
          case 'azure':
            provider = new AzureSpeechProvider(
              providerConfig.config?.subscriptionKey || process.env.AZURE_SPEECH_KEY || '',
              providerConfig.config?.region || process.env.AZURE_SPEECH_REGION || 'eastus'
            );
            break;
          default:
            console.warn(`[ProviderManager] Unknown provider type: ${providerConfig.type}`);
            continue;
        }

        if (provider) {
          const providerName = provider.getName();
          this.providers.set(providerName, provider);
          this.providerPriority.set(providerName, providerConfig.priority);
          this.providerHealth.set(providerName, {
            providerName,
            isHealthy: true,
            errorCount: 0,
            successCount: 0,
            averageConfidence: 0,
            averageLatency: 0,
          });

          console.log(`[ProviderManager] Initialized provider: ${providerName} (priority: ${providerConfig.priority})`);
        }
      } catch (error) {
        console.error(`[ProviderManager] Failed to initialize ${providerConfig.type} provider:`, error);
      }
    }

    // Select initial active provider (highest priority)
    this.selectActiveProvider();
  }

  private selectActiveProvider(): void {
    // Get all healthy providers sorted by priority
    const healthyProviders = Array.from(this.providers.keys())
      .filter(name => this.providerHealth.get(name)?.isHealthy)
      .sort((a, b) => {
        const priorityA = this.providerPriority.get(a) || 999;
        const priorityB = this.providerPriority.get(b) || 999;
        return priorityA - priorityB;
      });

    if (healthyProviders.length > 0) {
      const previousProvider = this.activeProvider;
      this.activeProvider = healthyProviders[0];

      if (previousProvider && previousProvider !== this.activeProvider) {
        console.log(`[ProviderManager] Switched active provider: ${previousProvider} -> ${this.activeProvider}`);
        this.emit('provider:switched', {
          from: previousProvider,
          to: this.activeProvider,
          reason: 'health',
        });
      }
    } else {
      console.warn('[ProviderManager] No healthy providers available!');
      this.activeProvider = null;
      this.emit('provider:none-available');
    }
  }

  getActiveProvider(): ASRProvider | null {
    if (!this.activeProvider) {
      return null;
    }
    return this.providers.get(this.activeProvider) || null;
  }

  getActiveProviderName(): string | null {
    return this.activeProvider;
  }

  recordSuccess(providerName: string, confidence?: number, latency?: number): void {
    const health = this.providerHealth.get(providerName);
    if (!health) return;

    health.successCount++;
    health.lastSuccessTime = Date.now();

    // Update average confidence using exponential moving average
    if (confidence !== undefined) {
      if (health.averageConfidence === 0) {
        health.averageConfidence = confidence;
      } else {
        health.averageConfidence = 0.9 * health.averageConfidence + 0.1 * confidence;
      }
    }

    // Update average latency using exponential moving average
    if (latency !== undefined) {
      if (health.averageLatency === 0) {
        health.averageLatency = latency;
      } else {
        health.averageLatency = 0.9 * health.averageLatency + 0.1 * latency;
      }
    }

    // Check if provider should be marked healthy if it was unhealthy
    if (!health.isHealthy && health.successCount >= 3) {
      health.isHealthy = true;
      health.errorCount = 0;
      console.log(`[ProviderManager] Provider ${providerName} marked as healthy`);
      this.emit('provider:recovered', { providerName });
      this.selectActiveProvider();
    }

    // Check for quality-based switching
    this.checkQualityBasedSwitching();
  }

  recordError(providerName: string, error: Error): void {
    const health = this.providerHealth.get(providerName);
    if (!health) return;

    health.errorCount++;
    health.lastError = error;
    health.lastErrorTime = Date.now();

    console.error(`[ProviderManager] Error from ${providerName}:`, error.message);

    // Mark provider as unhealthy if error threshold exceeded
    if (health.errorCount >= this.options.errorThreshold) {
      health.isHealthy = false;
      console.warn(`[ProviderManager] Provider ${providerName} marked as unhealthy`);
      this.emit('provider:unhealthy', { providerName, error });

      // If this was the active provider, switch to another
      if (this.activeProvider === providerName) {
        this.selectActiveProvider();
      }
    }
  }

  recordWordErrorRate(providerName: string, wer: number): void {
    const health = this.providerHealth.get(providerName);
    if (!health) return;

    health.wordErrorRate = wer;

    // Check if WER exceeds threshold
    if (wer > this.options.werThreshold) {
      console.warn(`[ProviderManager] Provider ${providerName} has high WER: ${wer.toFixed(3)}`);
      this.emit('provider:high-wer', { providerName, wer });
      this.checkQualityBasedSwitching();
    }
  }

  private checkQualityBasedSwitching(): void {
    if (!this.activeProvider) return;

    const activeHealth = this.providerHealth.get(this.activeProvider);
    if (!activeHealth) return;

    // Check if active provider has low confidence or high WER
    const needsSwitch =
      (activeHealth.averageConfidence > 0 && activeHealth.averageConfidence < this.options.confidenceThreshold) ||
      (activeHealth.wordErrorRate !== undefined && activeHealth.wordErrorRate > this.options.werThreshold);

    if (needsSwitch) {
      // Find a better provider
      const betterProvider = this.findBetterProvider(activeHealth);
      if (betterProvider) {
        const previousProvider = this.activeProvider;
        this.activeProvider = betterProvider;
        console.log(`[ProviderManager] Quality-based switch: ${previousProvider} -> ${betterProvider}`);
        this.emit('provider:switched', {
          from: previousProvider,
          to: betterProvider,
          reason: 'quality',
          metrics: {
            confidence: activeHealth.averageConfidence,
            wer: activeHealth.wordErrorRate,
          },
        });
      }
    }
  }

  private findBetterProvider(currentHealth: ProviderHealth): string | null {
    const candidates = Array.from(this.providers.keys())
      .filter(name => {
        const health = this.providerHealth.get(name);
        return health?.isHealthy && name !== this.activeProvider;
      })
      .map(name => {
        const health = this.providerHealth.get(name)!;
        const priority = this.providerPriority.get(name) || 999;

        // Calculate quality score (higher is better)
        let score = 0;
        score += health.averageConfidence * 50; // Confidence weight
        score -= (health.wordErrorRate || 0) * 100; // WER penalty
        score -= priority * 10; // Priority bonus (lower priority number = higher score)
        score -= health.averageLatency * 0.01; // Latency penalty

        return { name, score, health };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score > 0) {
      return candidates[0].name;
    }

    return null;
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  private performHealthCheck(): void {
    for (const [providerName, health] of this.providerHealth.entries()) {
      // Reset error count if no recent errors (last 5 minutes)
      if (health.lastErrorTime && Date.now() - health.lastErrorTime > 300000) {
        if (health.errorCount > 0) {
          health.errorCount = Math.max(0, health.errorCount - 1);
        }
      }

      // Mark provider as healthy if it has been successful recently
      if (!health.isHealthy && health.lastSuccessTime && Date.now() - health.lastSuccessTime < 60000) {
        health.isHealthy = true;
        console.log(`[ProviderManager] Provider ${providerName} automatically recovered`);
        this.emit('provider:recovered', { providerName });
      }
    }

    // Re-select active provider if current is unhealthy
    if (this.activeProvider) {
      const activeHealth = this.providerHealth.get(this.activeProvider);
      if (!activeHealth?.isHealthy) {
        this.selectActiveProvider();
      }
    }
  }

  getProviderHealth(providerName?: string): ProviderHealth | Map<string, ProviderHealth> {
    if (providerName) {
      return this.providerHealth.get(providerName) || {} as ProviderHealth;
    }
    return this.providerHealth;
  }

  getStats(): any {
    return {
      activeProvider: this.activeProvider,
      totalProviders: this.providers.size,
      healthyProviders: Array.from(this.providerHealth.values()).filter(h => h.isHealthy).length,
      providers: Array.from(this.providerHealth.entries()).map(([name, health]) => ({
        name,
        priority: this.providerPriority.get(name),
        ...health,
      })),
    };
  }

  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.removeAllListeners();
  }
}
