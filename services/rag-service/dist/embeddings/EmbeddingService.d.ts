/**
 * Embedding Service
 * Generates embeddings for text using OpenAI or other providers
 */
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
export declare class EmbeddingService {
    private openai;
    private model;
    private maxBatchSize;
    private dimension;
    constructor(apiKey?: string, model?: string);
    /**
     * Generate embedding for a single text
     */
    generateEmbedding(text: string): Promise<EmbeddingResult>;
    /**
     * Generate embeddings for multiple texts in batches
     */
    generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult>;
    /**
     * Calculate cosine similarity between two embeddings
     */
    cosineSimilarity(embedding1: number[], embedding2: number[]): number;
    /**
     * Get embedding dimension for current model
     */
    getDimension(): number;
    /**
     * Get current model name
     */
    getModel(): string;
    /**
     * Delay helper
     */
    private delay;
    /**
     * Estimate cost for embeddings
     * OpenAI pricing (as of 2024):
     * - text-embedding-ada-002: $0.0001 per 1K tokens
     * - text-embedding-3-small: $0.00002 per 1K tokens
     * - text-embedding-3-large: $0.00013 per 1K tokens
     */
    estimateCost(tokens: number): number;
}
//# sourceMappingURL=EmbeddingService.d.ts.map