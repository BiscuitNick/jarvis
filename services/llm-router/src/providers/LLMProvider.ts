/**
 * Abstract base class for LLM providers
 */

import { CompletionRequest, CompletionResponse, StreamChunk } from '../types';

export abstract class LLMProvider {
  protected name: string;
  protected model: string;
  protected apiKey: string;
  protected timeout: number;

  constructor(name: string, model: string, apiKey: string, timeout: number = 10000) {
    this.name = name;
    this.model = model;
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  abstract streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;

  getName(): string {
    return this.name;
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Health check for the provider
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple test completion
      await this.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 5,
      });
      return true;
    } catch (error) {
      console.error(`[${this.name}] Health check failed:`, error);
      return false;
    }
  }
}
