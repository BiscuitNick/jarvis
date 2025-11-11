/**
 * ASR Provider Pool
 * Manages a pool of ASR provider connections for efficient resource utilization
 */

import { EventEmitter } from 'node:events';
import { ASRProvider } from '../providers/ASRProvider';
import { AWSTranscribeProvider } from '../providers/AWSTranscribeProvider';

export interface ProviderPoolConfig {
  maxPoolSize?: number;
  minPoolSize?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  providerType?: 'aws' | 'deepgram' | 'google' | 'azure';
  providerRegion?: string;
}

interface PooledProvider {
  id: string;
  provider: ASRProvider;
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
  usageCount: number;
}

export class ASRProviderPool extends EventEmitter {
  private pool: PooledProvider[] = [];
  private config: Required<ProviderPoolConfig>;
  private idleCheckInterval?: NodeJS.Timeout;
  private providerFactory: () => ASRProvider;

  constructor(config: ProviderPoolConfig = {}) {
    super();

    this.config = {
      maxPoolSize: config.maxPoolSize || 10,
      minPoolSize: config.minPoolSize || 2,
      acquireTimeout: config.acquireTimeout || 5000,
      idleTimeout: config.idleTimeout || 60000, // 1 minute
      providerType: config.providerType || 'aws',
      providerRegion: config.providerRegion || 'us-east-1',
    };

    // Set up provider factory based on type
    this.providerFactory = this.createProviderFactory();

    // Initialize minimum pool size
    this.initializePool();

    // Start idle connection cleanup
    this.startIdleCheck();
  }

  /**
   * Acquire a provider from the pool
   */
  async acquire(): Promise<{ id: string; provider: ASRProvider }> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.acquireTimeout) {
      // Try to find an available provider
      const available = this.pool.find((p) => !p.inUse);

      if (available) {
        available.inUse = true;
        available.lastUsed = Date.now();
        available.usageCount++;

        this.emit('provider:acquired', { id: available.id });

        return {
          id: available.id,
          provider: available.provider,
        };
      }

      // If pool is not at max size, create a new provider
      if (this.pool.length < this.config.maxPoolSize) {
        const pooled = this.createPooledProvider();
        pooled.inUse = true;
        this.pool.push(pooled);

        this.emit('provider:created', { id: pooled.id });

        return {
          id: pooled.id,
          provider: pooled.provider,
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
  release(providerId: string): void {
    const pooled = this.pool.find((p) => p.id === providerId);

    if (!pooled) {
      console.warn(`[ASRProviderPool] Provider ${providerId} not found in pool`);
      return;
    }

    pooled.inUse = false;
    pooled.lastUsed = Date.now();

    this.emit('provider:released', { id: providerId });
  }

  /**
   * Remove a provider from the pool (e.g., if it failed)
   */
  async remove(providerId: string): Promise<void> {
    const index = this.pool.findIndex((p) => p.id === providerId);

    if (index === -1) {
      return;
    }

    const pooled = this.pool[index];

    // Clean up provider resources
    try {
      await pooled.provider.endStream();
    } catch (error) {
      console.error(`[ASRProviderPool] Error ending stream for provider ${providerId}:`, error);
    }

    this.pool.splice(index, 1);

    this.emit('provider:removed', { id: providerId });

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
      this.pool.push(pooled);
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
      this.pool.push(pooled);
    }
  }

  /**
   * Private: Create a pooled provider instance
   */
  private createPooledProvider(): PooledProvider {
    return {
      id: this.generateProviderId(),
      provider: this.providerFactory(),
      inUse: false,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
    };
  }

  /**
   * Private: Create provider factory based on configuration
   */
  private createProviderFactory(): () => ASRProvider {
    const { providerType, providerRegion } = this.config;

    switch (providerType) {
      case 'aws':
        return () => new AWSTranscribeProvider(providerRegion);
      // Future providers can be added here
      // case 'deepgram':
      //   return () => new DeepgramProvider(config);
      // case 'google':
      //   return () => new GoogleSpeechProvider(config);
      // case 'azure':
      //   return () => new AzureSpeechProvider(config);
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
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
