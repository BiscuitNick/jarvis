/**
 * Google Gemini provider implementation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider } from './LLMProvider';
import { CompletionRequest, CompletionResponse, StreamChunk, Message } from '../types';

export class GeminiProvider extends LLMProvider {
  private client: GoogleGenerativeAI;
  private generationConfig: any;

  constructor(apiKey: string, model: string = 'gemini-1.5-pro', timeout: number = 10000) {
    super('gemini', model, apiKey, timeout);
    this.client = new GoogleGenerativeAI(this.apiKey);
    this.generationConfig = {
      temperature: 0.7,
      maxOutputTokens: 1000,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      // Format messages for Gemini
      const { systemInstruction, history, prompt } = this.formatMessages(request.messages);

      // Create chat with history
      const chat = model.startChat({
        history,
        generationConfig: {
          ...this.generationConfig,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 1000,
        },
      });

      // Send message and get response
      const result = await chat.sendMessage(prompt);
      const response = await result.response;
      const content = response.text();

      return {
        content,
        provider: this.name,
        model: this.model,
        usage: {
          promptTokens: 0, // Gemini doesn't provide token counts in the same way
          completionTokens: 0,
          totalTokens: 0,
        },
        finishReason: 'stop',
      };
    } catch (error: any) {
      console.error(`[${this.name}] Completion error:`, error);
      throw new Error(`Gemini completion failed: ${error.message}`);
    }
  }

  async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      const { systemInstruction, history, prompt } = this.formatMessages(request.messages);

      const chat = model.startChat({
        history,
        generationConfig: {
          ...this.generationConfig,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 1000,
        },
      });

      const result = await chat.sendMessageStream(prompt);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          onChunk({
            content: text,
            done: false,
            provider: this.name,
            model: this.model,
          });
        }
      }

      // Send final chunk
      onChunk({
        content: '',
        done: true,
        provider: this.name,
        model: this.model,
      });
    } catch (error: any) {
      console.error(`[${this.name}] Stream error:`, error);
      throw new Error(`Gemini streaming failed: ${error.message}`);
    }
  }

  private formatMessages(messages: Message[]): {
    systemInstruction?: string;
    history: any[];
    prompt: string;
  } {
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Last message is the prompt
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const historyMessages = conversationMessages.slice(0, -1);

    // Format history for Gemini
    const history = historyMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    return {
      systemInstruction: systemMessage?.content,
      history,
      prompt: lastMessage?.content || '',
    };
  }
}
