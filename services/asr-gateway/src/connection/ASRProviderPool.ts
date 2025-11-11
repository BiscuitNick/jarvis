/**
 * ASR Provider Pool
 * Manages a pool of ASR provider connections for efficient resource utilization
 * Works with ProviderManager for provider selection and health tracking
 */

import { EventEmitter } from 'node:events';
import { ASRProvider } from '../providers/ASRProvider';
import { ProviderManager } from '../providers/ProviderManager';

export interface ProviderPoolConfig {
  maxPoolSize?: number;
  minPoolSize?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  providerManager?: ProviderManager;
  providerType?: 'aws' | 'deepgram' | 'google' | 'azure';
  providerRegion?: string;
}

interface PooledProvider {
  id: string;
  provider: ASRProvider;
  providerName: string;
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
  usageCount: number;
  startTime?: number; // Track when provider started processing
}

export class ASRProviderPool extends EventEmitter {
  private pool: PooledProvider[] = [];
  private config: Omit<Required<ProviderPoolConfig>, 'providerManager'> & { providerManager?: ProviderManager };
  private idleCheckInterval?: NodeJS.Timeout;
  private providerManager?: ProviderManager;

  constructor(config: ProviderPoolConfig = {}) {
    super();

    this.config = {
      maxPoolSize: config.maxPoolSize || 10,
      minPoolSize: config.minPoolSize || 2,
      acquireTimeout: config.acquireTimeout || 5000,
      idleTimeout: config.idleTimeout || 60000, // 1 minute
      providerType: config.providerType || 'aws',
      providerRegion: config.providerRegion || 'us-east-1',
      providerManager: config.providerManager,
    };

    this.providerManager = config.providerManager;

    // Initialize minimum pool size
    this.initializePool();

    // Start idle connection cleanup
    this.startIdleCheck();
  }

  /**
   * Acquire a provider from the pool
   */
  async acquire(): Promise<{ id: string; provider: ASRProvider; providerName: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.acquireTimeout) {
      // Try to find an available provider
      const available = this.pool.find((p) => !p.inUse);

      if (available) {
        available.inUse = true;
        available.lastUsed = Date.now();
        available.startTime = Date.now();
        available.usageCount++;

        this.emit('provider:acquired', { id: available.id, providerName: available.providerName });

        return {
          id: available.id,
          provider: available.provider,
          providerName: available.providerName,
        };
      }

      // If pool is not at max size, create a new provider
      if (this.pool.length < this.config.maxPoolSize) {
        const pooled = this.createPooledProvider();
        if (!pooled) {
          throw new Error('No healthy providers available');
        }

        pooled.inUse = true;
        pooled.startTime = Date.now();
        this.pool.push(pooled);

        this.emit('provider:created', { id: pooled.id, providerName: pooled.providerName });

        return {
          id: pooled.id,
          provider: pooled.provider,
          providerName: pooled.providerName,
        };
      }

      // Wait a bit before retrying
      await this.sleep(100);
    }

    throw new Error(
      `Failed to acquire provider within timeout (${this.config.acquireTimeout}ms)`
    );
  }

  /**
   * Release a provider back to the pool
   */
  release(providerId: string, success: boolean = true, confidence?: number): void {
    const pooled = this.pool.find((p) => p.id === providerId);

    if (!pooled) {
      console.warn(`[ASRProviderPool] Provider ${providerId} not found in pool`);
      return;
    }

    pooled.inUse = false;
    const endTime = Date.now();
    pooled.lastUsed = endTime;

    // Calculate latency if startTime was set
    const latency = pooled.startTime ? endTime - pooled.startTime : undefined;
    pooled.startTime = undefined;

    // Record metrics with ProviderManager if available
    if (this.providerManager && success) {
      this.providerManager.recordSuccess(pooled.providerName, confidence, latency);
    }

    this.emit('provider:released', {
      id: providerId,
      providerName: pooled.providerName,
      latency
    });
  }

  /**
   * Remove a provider from the pool (e.g., if it failed)
   */
  async remove(providerId: string, error?: Error): Promise<void> {
    const index = this.pool.findIndex((p) => p.id === providerId);

    if (index === -1) {
      return;
    }

    const pooled = this.pool[index];

    // Record error with ProviderManager if available
    if (this.providerManager && error) {
      this.providerManager.recordError(pooled.providerName, error);
    }

    // Clean up provider resources
    try {
      await pooled.provider.endStream();
    } catch (cleanupError) {
      console.error(`[ASRProviderPool] Error ending stream for provider ${providerId}:`, cleanupError);
    }

    this.pool.splice(index, 1);

    this.emit('provider:removed', { id: providerId, providerName: pooled.providerName });

    // Ensure minimum pool size
    if (this.pool.length < this.config.minPoolSize) {
      this.ensureMinPoolSize();
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const inUse = this.pool.filter((p) => p.inUse).length;
    const available = this.pool.length - inUse;

    return {
      poolSize: this.pool.length,
      inUse,
      available,
      maxPoolSize: this.config.maxPoolSize,
      minPoolSize: this.config.minPoolSize,
      providers: this.pool.map((p) => ({
        id: p.id,
        inUse: p.inUse,
        age: Date.now() - p.createdAt,
        usageCount: p.usageCount,
        timeSinceLastUse: Date.now() - p.lastUsed,
      })),
    };
  }

  /**
   * Cleanup the pool and all providers
   */
  async cleanup(): Promise<void> {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    // End all provider streams
    const cleanupPromises = this.pool.map((p) =>
      p.provider.endStream().catch((err) => {
        console.error(`[ASRProviderPool] Error cleaning up provider ${p.id}:`, err);
      })
    );

    await Promise.all(cleanupPromises);
    this.pool = [];

    this.emit('pool:cleanup');
  }

  /**
   * Private: Initialize pool with minimum providers
   */
  private initializePool(): void {
    for (let i = 0; i < this.config.minPoolSize; i++) {
      const pooled = this.createPooledProvider();
      if (pooled) {
        this.pool.push(pooled);
      }
    }

    this.emit('pool:initialized', { size: this.config.minPoolSize });
  }

  /**
   * Private: Ensure minimum pool size is maintained
   */
  private ensureMinPoolSize(): void {
    const toCreate = this.config.minPoolSize - this.pool.length;

    for (let i = 0; i < toCreate; i++) {
      const pooled = this.createPooledProvider();
      if (pooled) {
        this.pool.push(pooled);
      }
    }
  }

  /**
   * Private: Create a pooled provider instance
   */
  private createPooledProvider(): PooledProvider | null {
    // Get provider from ProviderManager if available
    let provider: ASRProvider;
    let providerName: string;

    if (this.providerManager) {
      const activeProvider = this.providerManager.getActiveProvider();
      providerName = this.providerManager.getActiveProviderName() || 'unknown';

      if (!activeProvider) {
        console.error('[ASRProviderPool] No active provider available from ProviderManager');
        return null;
      }
      provider = activeProvider;
    } else {
      // Fallback to simple provider creation (backward compatibility)
      const { providerType, providerRegion } = this.config;
      const AWSTranscribeProvider = require('../providers/AWSTranscribeProvider').AWSTranscribeProvider;

      switch (providerType) {
        case 'aws':
          provider = new AWSTranscribeProvider(providerRegion);
          providerName = 'AWS Transcribe';
          break;
        default:
          throw new Error(`Unsupported provider type: ${providerType}`);
      }
    }

    return {
      id: this.generateProviderId(),
      provider,
      providerName,
      inUse: false,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
    };
  }

  /**
   * Private: Start idle connection cleanup
   */
  private startIdleCheck(): void {
    this.idleCheckInterval = setInterval(() => {
      const now = Date.now();

      // Find idle providers that exceed idle timeout
      const idleProviders = this.pool.filter(
        (p) => !p.inUse && now - p.lastUsed > this.config.idleTimeout
      );

      // Remove idle providers, but maintain minimum pool size
      for (const idle of idleProviders) {
        if (this.pool.length > this.config.minPoolSize) {
          this.remove(idle.id);
        }
      }
    }, this.config.idleTimeout / 2);
  }

  /**
   * Private: Generate unique provider ID
   */
  private generateProviderId(): string {
    return `provider-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Private: Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
