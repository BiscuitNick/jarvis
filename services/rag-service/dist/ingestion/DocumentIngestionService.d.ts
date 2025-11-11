/**
 * Document Ingestion Service
 * Orchestrates the ingestion pipeline: fetch → chunk → embed → store
 */
import { Pool } from 'pg';
import { GitHubRepoConfig } from './GitHubClient';
export interface IngestionResult {
    documentId: string;
    chunksCreated: number;
    tokensUsed: number;
    sourceUrl: string;
}
export interface IngestionStats {
    documentsProcessed: number;
    chunksCreated: number;
    tokensUsed: number;
    estimatedCost: number;
    errors: string[];
}
export declare class DocumentIngestionService {
    private githubClient;
    private chunker;
    private embeddingService;
    private pool;
    constructor(pool: Pool, githubToken?: string, openaiKey?: string, embeddingModel?: string);
    /**
     * Ingest documents from a GitHub repository
     */
    ingestGitHubRepository(config: GitHubRepoConfig): Promise<IngestionStats>;
    /**
     * Ingest a single document
     */
    ingestDocument(content: string, sourceUrl: string, sourceType: string, title?: string, metadata?: any): Promise<IngestionResult>;
    /**
     * Delete document and its embeddings
     */
    deleteDocument(documentId: string): Promise<void>;
    /**
     * Get ingestion statistics
     */
    getIngestionStats(): Promise<{
        totalDocuments: number;
        totalChunks: number;
        sourceTypes: {
            [key: string]: number;
        };
    }>;
}
//# sourceMappingURL=DocumentIngestionService.d.ts.map