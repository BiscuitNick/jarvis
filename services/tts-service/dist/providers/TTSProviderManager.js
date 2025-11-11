"use strict";
/**
 * TTS Provider Manager
 * Manages TTS provider health monitoring, failover, and quality-based switching
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTSProviderManager = void 0;
const events_1 = require("events");
const GoogleCloudTTSProvider_1 = require("./GoogleCloudTTSProvider");
const AzureTTSProvider_1 = require("./AzureTTSProvider");
const ElevenLabsTTSProvider_1 = require("./ElevenLabsTTSProvider");
class TTSProviderManager extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.providers = new Map();
        this.providerHealth = new Map();
        this.providerPriority = new Map();
        this.activeProvider = null;
        this.healthCheckInterval = null;
        this.options = {
            providers: options.providers,
            healthCheckInterval: options.healthCheckInterval || 30000,
            errorThreshold: options.errorThreshold || 5,
            failoverDelay: options.failoverDelay || 5000,
        };
        this.initializeProviders();
        this.startHealthMonitoring();
    }
    initializeProviders() {
        for (const providerConfig of this.options.providers) {
            if (!providerConfig.enabled)
                continue;
            let provider = null;
            try {
                switch (providerConfig.type) {
                    case 'google':
                        provider = new GoogleCloudTTSProvider_1.GoogleCloudTTSProvider(providerConfig.config?.credentials);
                        break;
                    case 'azure':
                        provider = new AzureTTSProvider_1.AzureTTSProvider(providerConfig.config?.subscriptionKey || process.env.AZURE_SPEECH_KEY || '', providerConfig.config?.region || process.env.AZURE_SPEECH_REGION || 'eastus');
                        break;
                    case 'elevenlabs':
                        provider = new ElevenLabsTTSProvider_1.ElevenLabsTTSProvider(providerConfig.config?.apiKey || process.env.ELEVENLABS_API_KEY || '');
                        break;
                    default:
                        console.warn(`[TTSProviderManager] Unknown provider type: ${providerConfig.type}`);
                        continue;
                }
                if (provider && provider.isAvailable()) {
                    const providerName = provider.getName();
                    this.providers.set(providerName, provider);
                    this.providerPriority.set(providerName, providerConfig.priority);
                    this.providerHealth.set(providerName, {
                        providerName,
                        isHealthy: true,
                        errorCount: 0,
                        successCount: 0,
                        averageLatency: 0,
                    });
                    console.log(`[TTSProviderManager] Initialized provider: ${providerName} (priority: ${providerConfig.priority})`);
                }
            }
            catch (error) {
                console.error(`[TTSProviderManager] Failed to initialize ${providerConfig.type} provider:`, error);
            }
        }
        // Select initial active provider (highest priority)
        this.selectActiveProvider();
    }
    selectActiveProvider() {
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
                console.log(`[TTSProviderManager] Switched active provider: ${previousProvider} -> ${this.activeProvider}`);
                this.emit('provider:switched', {
                    from: previousProvider,
                    to: this.activeProvider,
                    reason: 'health',
                });
            }
        }
        else {
            console.warn('[TTSProviderManager] No healthy providers available!');
            this.activeProvider = null;
            this.emit('provider:none-available');
        }
    }
    getActiveProvider() {
        if (!this.activeProvider) {
            return null;
        }
        return this.providers.get(this.activeProvider) || null;
    }
    getActiveProviderName() {
        return this.activeProvider;
    }
    async synthesize(request) {
        const provider = this.getActiveProvider();
        if (!provider) {
            throw new Error('No TTS provider available');
        }
        const providerName = this.getActiveProviderName();
        const startTime = Date.now();
        try {
            const result = await provider.synthesize(request);
            const latency = Date.now() - startTime;
            this.recordSuccess(providerName, latency);
            return result;
        }
        catch (error) {
            this.recordError(providerName, error);
            throw error;
        }
    }
    async synthesizeStream(request, onAudioChunk, onError) {
        const provider = this.getActiveProvider();
        if (!provider) {
            onError(new Error('No TTS provider available'));
            return;
        }
        const providerName = this.getActiveProviderName();
        const startTime = Date.now();
        try {
            await provider.synthesizeStream(request, (chunk) => {
                onAudioChunk(chunk);
            }, (error) => {
                this.recordError(providerName, error);
                onError(error);
            });
            const latency = Date.now() - startTime;
            this.recordSuccess(providerName, latency);
        }
        catch (error) {
            this.recordError(providerName, error);
            onError(error);
        }
    }
    recordSuccess(providerName, latency) {
        const health = this.providerHealth.get(providerName);
        if (!health)
            return;
        health.successCount++;
        health.lastSuccessTime = Date.now();
        // Update average latency using exponential moving average
        if (latency !== undefined) {
            if (health.averageLatency === 0) {
                health.averageLatency = latency;
            }
            else {
                health.averageLatency = 0.9 * health.averageLatency + 0.1 * latency;
            }
        }
        // Check if provider should be marked healthy if it was unhealthy
        if (!health.isHealthy && health.successCount >= 3) {
            health.isHealthy = true;
            health.errorCount = 0;
            console.log(`[TTSProviderManager] Provider ${providerName} marked as healthy`);
            this.emit('provider:recovered', { providerName });
            this.selectActiveProvider();
        }
    }
    recordError(providerName, error) {
        const health = this.providerHealth.get(providerName);
        if (!health)
            return;
        health.errorCount++;
        health.lastError = error;
        health.lastErrorTime = Date.now();
        console.error(`[TTSProviderManager] Error from ${providerName}:`, error.message);
        // Mark provider as unhealthy if error threshold exceeded
        if (health.errorCount >= this.options.errorThreshold) {
            health.isHealthy = false;
            console.warn(`[TTSProviderManager] Provider ${providerName} marked as unhealthy`);
            this.emit('provider:unhealthy', { providerName, error });
            // If this was the active provider, switch to another
            if (this.activeProvider === providerName) {
                this.selectActiveProvider();
            }
        }
    }
    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.options.healthCheckInterval);
    }
    performHealthCheck() {
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
                console.log(`[TTSProviderManager] Provider ${providerName} automatically recovered`);
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
    getProviderHealth(providerName) {
        if (providerName) {
            return this.providerHealth.get(providerName) || {};
        }
        return this.providerHealth;
    }
    getStats() {
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
    cleanup() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.removeAllListeners();
    }
}
exports.TTSProviderManager = TTSProviderManager;
