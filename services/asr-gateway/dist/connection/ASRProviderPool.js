"use strict";
/**
 * ASR Provider Pool
 * Manages a pool of ASR provider connections for efficient resource utilization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASRProviderPool = void 0;
const node_events_1 = require("node:events");
const AWSTranscribeProvider_1 = require("../providers/AWSTranscribeProvider");
class ASRProviderPool extends node_events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.pool = [];
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
    async acquire() {
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
        throw new Error(`Failed to acquire provider within timeout (${this.config.acquireTimeout}ms)`);
    }
    /**
     * Release a provider back to the pool
     */
    release(providerId) {
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
    async remove(providerId) {
        const index = this.pool.findIndex((p) => p.id === providerId);
        if (index === -1) {
            return;
        }
        const pooled = this.pool[index];
        // Clean up provider resources
        try {
            await pooled.provider.endStream();
        }
        catch (error) {
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
    async cleanup() {
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
        }
        // End all provider streams
        const cleanupPromises = this.pool.map((p) => p.provider.endStream().catch((err) => {
            console.error(`[ASRProviderPool] Error cleaning up provider ${p.id}:`, err);
        }));
        await Promise.all(cleanupPromises);
        this.pool = [];
        this.emit('pool:cleanup');
    }
    /**
     * Private: Initialize pool with minimum providers
     */
    initializePool() {
        for (let i = 0; i < this.config.minPoolSize; i++) {
            const pooled = this.createPooledProvider();
            this.pool.push(pooled);
        }
        this.emit('pool:initialized', { size: this.config.minPoolSize });
    }
    /**
     * Private: Ensure minimum pool size is maintained
     */
    ensureMinPoolSize() {
        const toCreate = this.config.minPoolSize - this.pool.length;
        for (let i = 0; i < toCreate; i++) {
            const pooled = this.createPooledProvider();
            this.pool.push(pooled);
        }
    }
    /**
     * Private: Create a pooled provider instance
     */
    createPooledProvider() {
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
    createProviderFactory() {
        const { providerType, providerRegion } = this.config;
        switch (providerType) {
            case 'aws':
                return () => new AWSTranscribeProvider_1.AWSTranscribeProvider(providerRegion);
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
    startIdleCheck() {
        this.idleCheckInterval = setInterval(() => {
            const now = Date.now();
            // Find idle providers that exceed idle timeout
            const idleProviders = this.pool.filter((p) => !p.inUse && now - p.lastUsed > this.config.idleTimeout);
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
    generateProviderId() {
        return `provider-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }
    /**
     * Private: Sleep utility
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.ASRProviderPool = ASRProviderPool;
//# sourceMappingURL=ASRProviderPool.js.map