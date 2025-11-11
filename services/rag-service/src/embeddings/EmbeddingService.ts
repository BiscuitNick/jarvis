/**
 * Embedding Service
 * Generates embeddings for text using OpenAI or other providers
 */

import OpenAI from 'openai';

export interface EmbeddingResult {
  embedding: number[];
  text: string;
  model: string;
  tokens: number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private model: string;
  private maxBatchSize: number = 100; // OpenAI limit
  private dimension: number = 1536; // text-embedding-ada-002 dimension

  constructor(apiKey?: string, model: string = 'text-embedding-ada-002') {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = model;

    // Set dimension based on model
    if (model === 'text-embedding-3-small') {
      this.dimension = 1536;
    } else if (model === 'text-embedding-3-large') {
      this.dimension = 3072;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
      });

      return {
        embedding: response.data[0].embedding,
        text,
        model: this.model,
        tokens: response.usage.total_tokens,
      };
    } catch (error) {
      console.error('[EmbeddingService] Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
    const allEmbeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, Math.min(i + this.maxBatchSize, texts.length));

      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: batch,
        });

        const batchResults = response.data.map((item, idx) => ({
          embedding: item.embedding,
          text: batch[idx],
          model: this.model,
          tokens: 0, // Individual token count not provided in batch
        }));

        allEmbeddings.push(...batchResults);
        totalTokens += response.usage.total_tokens;

        // Rate limiting delay between batches
        if (i + this.maxBatchSize < texts.length) {
          await this.delay(100); // 100ms delay between batches
        }
      } catch (error) {
        console.error(`[EmbeddingService] Error generating batch embeddings (batch ${i}):`, error);
        throw error;
      }
    }

    return {
      embeddings: allEmbeddings,
      totalTokens,
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Get embedding dimension for current model
   */
  getDimension(): number {
    return this.dimension;
  }

  /**
   * Get current model name
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Estimate cost for embeddings
   * OpenAI pricing (as of 2024):
   * - text-embedding-ada-002: $0.0001 per 1K tokens
   * - text-embedding-3-small: $0.00002 per 1K tokens
   * - text-embedding-3-large: $0.00013 per 1K tokens
   */
  estimateCost(tokens: number): number {
    const pricePerThousand = {
      'text-embedding-ada-002': 0.0001,
      'text-embedding-3-small': 0.00002,
      'text-embedding-3-large': 0.00013,
    };

    const price = pricePerThousand[this.model as keyof typeof pricePerThousand] || 0.0001;
    return (tokens / 1000) * price;
  }
}
