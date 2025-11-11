/**
 * ASR Provider Pool
 * Manages a pool of ASR provider connections for efficient resource utilization
 */
import { EventEmitter } from 'node:events';
import { ASRProvider } from '../providers/ASRProvider';
export interface ProviderPoolConfig {
    maxPoolSize?: number;
    minPoolSize?: number;
    acquireTimeout?: number;
    idleTimeout?: number;
    providerType?: 'aws' | 'deepgram' | 'google' | 'azure';
    providerRegion?: string;
}
export declare class ASRProviderPool extends EventEmitter {
    private pool;
    private config;
    private idleCheckInterval?;
    private providerFactory;
    constructor(config?: ProviderPoolConfig);
    /**
     * Acquire a provider from the pool
     */
    acquire(): Promise<{
        id: string;
        provider: ASRProvider;
    }>;
    /**
     * Release a provider back to the pool
     */
    release(providerId: string): void;
    /**
     * Remove a provider from the pool (e.g., if it failed)
     */
    remove(providerId: string): Promise<void>;
    /**
     * Get pool statistics
     */
    getStats(): {
        poolSize: number;
        inUse: number;
        available: number;
        maxPoolSize: number;
        minPoolSize: number;
        providers: {
            id: string;
            inUse: boolean;
            age: number;
            usageCount: number;
            timeSinceLastUse: number;
        }[];
    };
    /**
     * Cleanup the pool and all providers
     */
    cleanup(): Promise<void>;
    /**
     * Private: Initialize pool with minimum providers
     */
    private initializePool;
    /**
     * Private: Ensure minimum pool size is maintained
     */
    private ensureMinPoolSize;
    /**
     * Private: Create a pooled provider instance
     */
    private createPooledProvider;
    /**
     * Private: Create provider factory based on configuration
     */
    private createProviderFactory;
    /**
     * Private: Start idle connection cleanup
     */
    private startIdleCheck;
    /**
     * Private: Generate unique provider ID
     */
    private generateProviderId;
    /**
     * Private: Sleep utility
     */
    private sleep;
}
//# sourceMappingURL=ASRProviderPool.d.ts.map