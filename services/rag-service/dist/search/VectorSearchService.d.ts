/**
 * Vector Search Service
 * Performs semantic search using pgvector
 */
import { Pool } from 'pg';
import { EmbeddingService } from '../embeddings/EmbeddingService';
export interface SearchResult {
    chunkId: string;
    documentId: string;
    chunkText: string;
    chunkIndex: number;
    similarity: number;
    documentTitle: string;
    sourceUrl: string;
    sourceType: string;
    metadata: any;
}
export interface SearchOptions {
    limit?: number;
    similarityThreshold?: number;
    sourceTypes?: string[];
    includeMetadata?: boolean;
}
export declare class VectorSearchService {
    private pool;
    private embeddingService;
    private defaultSimilarityThreshold;
    constructor(pool: Pool, embeddingService: EmbeddingService);
    /**
     * Perform semantic search for relevant documents
     */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Search with query expansion (generates multiple query variations)
     */
    searchWithExpansion(query: string, expansions: string[], options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Find similar documents to a given document
     */
    findSimilarDocuments(documentId: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Hybrid search combining vector similarity and keyword matching
     */
    hybridSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Get search statistics
     */
    getSearchStats(): Promise<{
        totalEmbeddings: number;
        avgChunksPerDocument: number;
        embeddingDimension: number;
    }>;
    /**
     * Update similarity threshold
     */
    setSimilarityThreshold(threshold: number): void;
    /**
     * Get current similarity threshold
     */
    getSimilarityThreshold(): number;
}
//# sourceMappingURL=VectorSearchService.d.ts.map