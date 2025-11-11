/**
 * Type definitions for LLM Router service
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  intent?: 'critical' | 'casual';
  context?: RetrievalContext;
}

export interface RetrievalContext {
  documents: RetrievedDocument[];
  query: string;
}

export interface RetrievedDocument {
  content: string;
  source: string;
  relevance: number;
  metadata?: Record<string, any>;
}

export interface CompletionResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  citations?: string[];
  finishReason?: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  provider?: string;
  model?: string;
}

export interface ProviderHealth {
  name: string;
  healthy: boolean;
  lastCheck: Date;
  errorCount: number;
  averageLatency: number;
}

export enum IntentType {
  CRITICAL = 'critical',
  CASUAL = 'casual',
}

export interface LLMProviderConfig {
  name: string;
  apiKey: string;
  model: string;
  maxRetries?: number;
  timeout?: number;
}
