/**
 * Document Ingestion Service
 * Orchestrates the ingestion pipeline: fetch → chunk → embed → store
 */

import { Pool } from 'pg';
import { GitHubClient, GitHubDocument, GitHubRepoConfig } from './GitHubClient';
import { DocumentChunker, ChunkOptions } from '../chunking/DocumentChunker';
import { EmbeddingService } from '../embeddings/EmbeddingService';

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

export class DocumentIngestionService {
  private githubClient: GitHubClient;
  private chunker: DocumentChunker;
  private embeddingService: EmbeddingService;
  private pool: Pool;

  constructor(
    pool: Pool,
    githubToken?: string,
    openaiKey?: string,
    embeddingModel: string = 'text-embedding-ada-002'
  ) {
    this.pool = pool;
    this.githubClient = new GitHubClient(githubToken);
    this.chunker = new DocumentChunker();
    this.embeddingService = new EmbeddingService(openaiKey, embeddingModel);
  }

  /**
   * Ingest documents from a GitHub repository
   */
  async ingestGitHubRepository(config: GitHubRepoConfig): Promise<IngestionStats> {
    const stats: IngestionStats = {
      documentsProcessed: 0,
      chunksCreated: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      errors: [],
    };

    try {
      console.log(`[Ingestion] Fetching content from ${config.owner}/${config.repo}...`);

      // Fetch documents from GitHub
      const documents = await this.githubClient.fetchRepositoryContent(config);
      console.log(`[Ingestion] Fetched ${documents.length} documents`);

      // Process each document
      for (const doc of documents) {
        try {
          const result = await this.ingestDocument(
            doc.content,
            doc.url,
            'github',
            doc.path,
            {
              fileType: doc.type,
              sha: doc.sha,
              repository: `${config.owner}/${config.repo}`,
            }
          );

          stats.documentsProcessed++;
          stats.chunksCreated += result.chunksCreated;
          stats.tokensUsed += result.tokensUsed;
        } catch (error) {
          const errorMsg = `Failed to ingest ${doc.path}: ${error}`;
          console.error(`[Ingestion] ${errorMsg}`);
          stats.errors.push(errorMsg);
        }
      }

      stats.estimatedCost = this.embeddingService.estimateCost(stats.tokensUsed);

      console.log(`[Ingestion] Complete: ${stats.documentsProcessed} docs, ${stats.chunksCreated} chunks, ${stats.tokensUsed} tokens, $${stats.estimatedCost.toFixed(4)}`);

      return stats;
    } catch (error) {
      console.error('[Ingestion] Error ingesting repository:', error);
      throw error;
    }
  }

  /**
   * Ingest a single document
   */
  async ingestDocument(
    content: string,
    sourceUrl: string,
    sourceType: string,
    title?: string,
    metadata?: any
  ): Promise<IngestionResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if document already exists
      const existingDoc = await client.query(
        'SELECT id FROM knowledge_documents WHERE source_url = $1',
        [sourceUrl]
      );

      let documentId: string;

      if (existingDoc.rows.length > 0) {
        // Update existing document
        documentId = existingDoc.rows[0].id;
        await client.query(
          `UPDATE knowledge_documents
           SET content = $1, title = $2, metadata = $3, updated_at = CURRENT_TIMESTAMP, last_indexed_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [content, title || sourceUrl, metadata || {}, documentId]
        );

        // Delete old embeddings
        await client.query('DELETE FROM embeddings WHERE document_id = $1', [documentId]);
      } else {
        // Create new document
        const result = await client.query(
          `INSERT INTO knowledge_documents (source_url, source_type, title, content, metadata, last_indexed_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           RETURNING id`,
          [sourceUrl, sourceType, title || sourceUrl, content, metadata || {}]
        );
        documentId = result.rows[0].id;
      }

      // Chunk the document
      const chunks = this.chunker.chunkDocument(content);
      console.log(`[Ingestion] Created ${chunks.length} chunks for ${title || sourceUrl}`);

      // Generate embeddings in batches
      const chunkTexts = chunks.map((c) => c.text);
      const embeddingResult = await this.embeddingService.generateBatchEmbeddings(chunkTexts);

      // Store embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddingResult.embeddings[i];

        await client.query(
          `INSERT INTO embeddings (document_id, chunk_text, chunk_index, vector, embedding_model, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            documentId,
            chunk.text,
            chunk.index,
            `[${embedding.embedding.join(',')}]`, // pgvector expects array format: [1,2,3]
            embedding.model,
            chunk.metadata,
          ]
        );
      }

      await client.query('COMMIT');

      return {
        documentId,
        chunksCreated: chunks.length,
        tokensUsed: embeddingResult.totalTokens,
        sourceUrl,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Ingestion] Error ingesting document:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete document and its embeddings
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.pool.query('DELETE FROM knowledge_documents WHERE id = $1', [documentId]);
  }

  /**
   * Get ingestion statistics
   */
  async getIngestionStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    sourceTypes: { [key: string]: number };
  }> {
    const docCount = await this.pool.query('SELECT COUNT(*) as count FROM knowledge_documents');
    const chunkCount = await this.pool.query('SELECT COUNT(*) as count FROM embeddings');
    const sourceTypes = await this.pool.query(
      'SELECT source_type, COUNT(*) as count FROM knowledge_documents GROUP BY source_type'
    );

    return {
      totalDocuments: parseInt(docCount.rows[0].count),
      totalChunks: parseInt(chunkCount.rows[0].count),
      sourceTypes: sourceTypes.rows.reduce((acc, row) => {
        acc[row.source_type] = parseInt(row.count);
        return acc;
      }, {} as { [key: string]: number }),
    };
  }
}
