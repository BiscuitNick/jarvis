/**
 * Anthropic Claude provider implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './LLMProvider';
import { CompletionRequest, CompletionResponse, StreamChunk, Message } from '../types';

export class AnthropicProvider extends LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022', timeout: number = 10000) {
    super('anthropic', model, apiKey, timeout);
    this.client = new Anthropic({
      apiKey: this.apiKey,
      timeout: this.timeout,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const { system, messages } = this.formatMessages(request.messages);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 1000,
        temperature: request.temperature ?? 0.7,
        system,
        messages,
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';

      return {
        content,
        provider: this.name,
        model: this.model,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: response.stop_reason || undefined,
      };
    } catch (error: any) {
      console.error(`[${this.name}] Completion error:`, error);
      throw new Error(`Anthropic completion failed: ${error.message}`);
    }
  }

  async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      const { system, messages } = this.formatMessages(request.messages);

      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 1000,
        temperature: request.temperature ?? 0.7,
        system,
        messages,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            onChunk({
              content: event.delta.text,
              done: false,
              provider: this.name,
              model: this.model,
            });
          }
        } else if (event.type === 'message_stop') {
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
      throw new Error(`Anthropic streaming failed: ${error.message}`);
    }
  }

  private formatMessages(messages: Message[]): {
    system?: string;
    messages: Anthropic.MessageParam[];
  } {
    // Extract system message if present
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    return {
      system: systemMessage?.content,
      messages: conversationMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
    };
  }
}
