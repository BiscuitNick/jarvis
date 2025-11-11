/**
 * OpenAI GPT provider implementation
 */

import OpenAI from 'openai';
import { LLMProvider } from './LLMProvider';
import { CompletionRequest, CompletionResponse, StreamChunk, Message } from '../types';

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string, model: string = 'gpt-4o', timeout: number = 10000) {
    super('openai', model, apiKey, timeout);
    this.client = new OpenAI({
      apiKey: this.apiKey,
      timeout: this.timeout,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const messages = this.formatMessages(request.messages);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1000,
        stream: false,
      });

      const content = response.choices[0]?.message?.content || '';

      return {
        content,
        provider: this.name,
        model: this.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        finishReason: response.choices[0]?.finish_reason,
      };
    } catch (error: any) {
      console.error(`[${this.name}] Completion error:`, error);
      throw new Error(`OpenAI completion failed: ${error.message}`);
    }
  }

  async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      const messages = this.formatMessages(request.messages);

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1000,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const done = chunk.choices[0]?.finish_reason !== null;

        if (content) {
          onChunk({
            content,
            done: false,
            provider: this.name,
            model: this.model,
          });
        }

        if (done) {
          onChunk({
            content: '',
            done: true,
            provider: this.name,
            model: this.model,
          });
        }
      }
    } catch (error: any) {
      console.error(`[${this.name}] Stream error:`, error);
      throw new Error(`OpenAI streaming failed: ${error.message}`);
    }
  }

  private formatMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }
}
