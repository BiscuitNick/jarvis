/**
 * Provider manager with fallback logic and health monitoring
 */

import { LLMProvider } from './providers/LLMProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { CompletionRequest, CompletionResponse, StreamChunk, ProviderHealth } from './types';

export class ProviderManager {
  private providers: LLMProvider[] = [];
  private healthStatus: Map<string, ProviderHealth> = new Map();
  private currentProviderIndex = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeProviders();
    this.startHealthChecks();
  }

  private initializeProviders(): void {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GOOGLE_API_KEY;

    // Add providers in priority order
    if (openaiKey) {
      const provider = new OpenAIProvider(openaiKey, 'gpt-4o', 10000);
      this.providers.push(provider);
      this.initHealthStatus(provider.getName());
      console.log('[ProviderManager] Initialized OpenAI provider');
    }

    if (anthropicKey) {
      const provider = new AnthropicProvider(anthropicKey, 'claude-3-5-sonnet-20241022', 10000);
      this.providers.push(provider);
      this.initHealthStatus(provider.getName());
      console.log('[ProviderManager] Initialized Anthropic provider');
    }

    if (geminiKey) {
      const provider = new GeminiProvider(geminiKey, 'gemini-1.5-pro', 10000);
      this.providers.push(provider);
      this.initHealthStatus(provider.getName());
      console.log('[ProviderManager] Initialized Gemini provider');
    }

    if (this.providers.length === 0) {
      console.warn('[ProviderManager] No LLM providers configured!');
    }
  }

  private initHealthStatus(providerName: string): void {
    this.healthStatus.set(providerName, {
      name: providerName,
      healthy: true,
      lastCheck: new Date(),
      errorCount: 0,
      averageLatency: 0,
    });
  }

  private startHealthChecks(): void {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 5 * 60 * 1000);
  }

  private async performHealthChecks(): Promise<void> {
    console.log('[ProviderManager] Performing health checks...');

    for (const provider of this.providers) {
      const startTime = Date.now();
      const healthy = await provider.healthCheck();
      const latency = Date.now() - startTime;

      const status = this.healthStatus.get(provider.getName());
      if (status) {
        status.healthy = healthy;
        status.lastCheck = new Date();
        status.averageLatency = (status.averageLatency + latency) / 2;

        if (!healthy) {
          status.errorCount++;
          console.warn(`[ProviderManager] ${provider.getName()} health check failed`);
        } else {
          status.errorCount = 0;
          console.log(`[ProviderManager] ${provider.getName()} is healthy (${latency}ms)`);
        }
      }
    }
  }

  /**
   * Get the next healthy provider with fallback
   */
  private getHealthyProvider(): LLMProvider | null {
    if (this.providers.length === 0) {
      return null;
    }

    // Try to find a healthy provider
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[(this.currentProviderIndex + i) % this.providers.length];
      const health = this.healthStatus.get(provider.getName());

      if (health && health.healthy && health.errorCount < 3) {
        this.currentProviderIndex = (this.currentProviderIndex + i) % this.providers.length;
        return provider;
      }
    }

    // If no healthy provider found, try the first one anyway
    console.warn('[ProviderManager] No healthy provider found, using first available');
    return this.providers[0];
  }

  /**
   * Complete a request with automatic fallback
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    let lastError: Error | null = null;

    // Try each provider until one succeeds
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const provider = this.getHealthyProvider();

      if (!provider) {
        throw new Error('No LLM providers available');
      }

      try {
        const startTime = Date.now();
        const response = await this.withTimeout(
          provider.complete(request),
          request.maxTokens ? 10000 : 10000 // 10 second timeout
        );
        const latency = Date.now() - startTime;

        // Update health metrics
        const health = this.healthStatus.get(provider.getName());
        if (health) {
          health.averageLatency = (health.averageLatency + latency) / 2;
          health.healthy = true;
          health.errorCount = 0;
        }

        console.log(`[ProviderManager] Request completed via ${provider.getName()} (${latency}ms)`);
        return response;
      } catch (error: any) {
        console.error(`[ProviderManager] ${provider.getName()} failed:`, error.message);
        lastError = error;

        // Mark provider as unhealthy
        const health = this.healthStatus.get(provider.getName());
        if (health) {
          health.errorCount++;
          if (health.errorCount >= 3) {
            health.healthy = false;
          }
        }

        // Move to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
      }
    }

    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Stream complete with automatic fallback
   */
  async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    let lastError: Error | null = null;

    // Try each provider until one succeeds
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const provider = this.getHealthyProvider();

      if (!provider) {
        throw new Error('No LLM providers available');
      }

      try {
        const startTime = Date.now();
        await this.withTimeout(
          provider.streamComplete(request, onChunk),
          10000 // 10 second timeout
        );
        const latency = Date.now() - startTime;

        // Update health metrics
        const health = this.healthStatus.get(provider.getName());
        if (health) {
          health.averageLatency = (health.averageLatency + latency) / 2;
          health.healthy = true;
          health.errorCount = 0;
        }

        console.log(`[ProviderManager] Stream completed via ${provider.getName()} (${latency}ms)`);
        return;
      } catch (error: any) {
        console.error(`[ProviderManager] ${provider.getName()} stream failed:`, error.message);
        lastError = error;

        // Mark provider as unhealthy
        const health = this.healthStatus.get(provider.getName());
        if (health) {
          health.errorCount++;
          if (health.errorCount >= 3) {
            health.healthy = false;
          }
        }

        // Move to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
      }
    }

    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Wrap a promise with a timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Get health status for all providers
   */
  getHealthStatus(): ProviderHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}
