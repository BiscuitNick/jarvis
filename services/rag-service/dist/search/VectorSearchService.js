"use strict";
/**
 * Vector Search Service
 * Performs semantic search using pgvector
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorSearchService = void 0;
class VectorSearchService {
    pool;
    embeddingService;
    defaultSimilarityThreshold = 0.7;
    constructor(pool, embeddingService) {
        this.pool = pool;
        this.embeddingService = embeddingService;
    }
    /**
     * Perform semantic search for relevant documents
     */
    async search(query, options = {}) {
        const limit = options.limit || 10;
        const threshold = options.similarityThreshold || this.defaultSimilarityThreshold;
        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddingService.generateEmbedding(query);
            // Build SQL query
            let sql = `
        SELECT
          e.id as chunk_id,
          e.document_id,
          e.chunk_text,
          e.chunk_index,
          1 - (e.vector <=> $1::vector) as similarity,
          d.title as document_title,
          d.source_url,
          d.source_type,
          d.metadata as document_metadata,
          e.metadata as chunk_metadata
        FROM embeddings e
        JOIN knowledge_documents d ON e.document_id = d.id
        WHERE 1 - (e.vector <=> $1::vector) > $2
      `;
            const params = [JSON.stringify(queryEmbedding.embedding), threshold];
            let paramIndex = 3;
            // Add source type filter if provided
            if (options.sourceTypes && options.sourceTypes.length > 0) {
                sql += ` AND d.source_type = ANY($${paramIndex})`;
                params.push(options.sourceTypes);
                paramIndex++;
            }
            sql += `
        ORDER BY similarity DESC
        LIMIT $${paramIndex}
      `;
            params.push(limit);
            const result = await this.pool.query(sql, params);
            return result.rows.map((row) => ({
                chunkId: row.chunk_id,
                documentId: row.document_id,
                chunkText: row.chunk_text,
                chunkIndex: row.chunk_index,
                similarity: parseFloat(row.similarity),
                documentTitle: row.document_title,
                sourceUrl: row.source_url,
                sourceType: row.source_type,
                metadata: {
                    ...(options.includeMetadata ? row.document_metadata : {}),
                    ...(options.includeMetadata ? row.chunk_metadata : {}),
                },
            }));
        }
        catch (error) {
            console.error('[VectorSearch] Search error:', error);
            throw error;
        }
    }
    /**
     * Search with query expansion (generates multiple query variations)
     */
    async searchWithExpansion(query, expansions, options = {}) {
        const allQueries = [query, ...expansions];
        const allResults = [];
        const seenChunks = new Set();
        for (const q of allQueries) {
            const results = await this.search(q, {
                ...options,
                limit: Math.ceil((options.limit || 10) / allQueries.length),
            });
            // Deduplicate results
            for (const result of results) {
                if (!seenChunks.has(result.chunkId)) {
                    allResults.push(result);
                    seenChunks.add(result.chunkId);
                }
            }
        }
        // Re-sort by similarity and apply limit
        allResults.sort((a, b) => b.similarity - a.similarity);
        return allResults.slice(0, options.limit || 10);
    }
    /**
     * Find similar documents to a given document
     */
    async findSimilarDocuments(documentId, options = {}) {
        try {
            // Get average embedding for the document
            const result = await this.pool.query(`SELECT AVG(vector) as avg_vector
         FROM embeddings
         WHERE document_id = $1`, [documentId]);
            if (result.rows.length === 0) {
                return [];
            }
            const avgVector = result.rows[0].avg_vector;
            // Search using average vector
            let sql = `
        SELECT
          e.id as chunk_id,
          e.document_id,
          e.chunk_text,
          e.chunk_index,
          1 - (e.vector <=> $1::vector) as similarity,
          d.title as document_title,
          d.source_url,
          d.source_type,
          d.metadata as document_metadata,
          e.metadata as chunk_metadata
        FROM embeddings e
        JOIN knowledge_documents d ON e.document_id = d.id
        WHERE e.document_id != $2
        ORDER BY similarity DESC
        LIMIT $3
      `;
            const searchResult = await this.pool.query(sql, [
                avgVector,
                documentId,
                options.limit || 10,
            ]);
            return searchResult.rows.map((row) => ({
                chunkId: row.chunk_id,
                documentId: row.document_id,
                chunkText: row.chunk_text,
                chunkIndex: row.chunk_index,
                similarity: parseFloat(row.similarity),
                documentTitle: row.document_title,
                sourceUrl: row.source_url,
                sourceType: row.source_type,
                metadata: {
                    ...(options.includeMetadata ? row.document_metadata : {}),
                    ...(options.includeMetadata ? row.chunk_metadata : {}),
                },
            }));
        }
        catch (error) {
            console.error('[VectorSearch] Similar documents error:', error);
            throw error;
        }
    }
    /**
     * Hybrid search combining vector similarity and keyword matching
     */
    async hybridSearch(query, options = {}) {
        const limit = options.limit || 10;
        const threshold = options.similarityThreshold || this.defaultSimilarityThreshold;
        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddingService.generateEmbedding(query);
            // Perform hybrid search using both vector similarity and text search
            const sql = `
        WITH vector_scores AS (
          SELECT
            e.id as chunk_id,
            e.document_id,
            e.chunk_text,
            e.chunk_index,
            (1 - (e.vector <=> $1::vector)) as vec_score,
            d.title as document_title,
            d.source_url,
            d.source_type,
            d.metadata as document_metadata,
            e.metadata as chunk_metadata
          FROM embeddings e
          JOIN knowledge_documents d ON e.document_id = d.id
          WHERE 1 - (e.vector <=> $1::vector) > $2
        ),
        keyword_scores AS (
          SELECT
            e.id as chunk_id,
            CASE
              WHEN LOWER(e.chunk_text) LIKE LOWER($3) THEN 0.3
              ELSE 0.0
            END as keyword_score
          FROM embeddings e
        )
        SELECT
          v.*,
          COALESCE(k.keyword_score, 0) as keyword_score,
          (v.vec_score * 0.7 + COALESCE(k.keyword_score, 0) * 0.3) as combined_score
        FROM vector_scores v
        LEFT JOIN keyword_scores k ON v.chunk_id = k.chunk_id
        ORDER BY combined_score DESC
        LIMIT $4
      `;
            const result = await this.pool.query(sql, [
                JSON.stringify(queryEmbedding.embedding),
                threshold,
                `%${query}%`,
                limit,
            ]);
            return result.rows.map((row) => ({
                chunkId: row.chunk_id,
                documentId: row.document_id,
                chunkText: row.chunk_text,
                chunkIndex: row.chunk_index,
                similarity: parseFloat(row.combined_score),
                documentTitle: row.document_title,
                sourceUrl: row.source_url,
                sourceType: row.source_type,
                metadata: {
                    ...(options.includeMetadata ? row.document_metadata : {}),
                    ...(options.includeMetadata ? row.chunk_metadata : {}),
                    vectorScore: parseFloat(row.vec_score),
                    keywordScore: parseFloat(row.keyword_score),
                },
            }));
        }
        catch (error) {
            console.error('[VectorSearch] Hybrid search error:', error);
            throw error;
        }
    }
    /**
     * Get search statistics
     */
    async getSearchStats() {
        const stats = await this.pool.query(`
      SELECT
        COUNT(*) as total_embeddings,
        COUNT(DISTINCT document_id) as total_documents
      FROM embeddings
    `);
        const totalEmbeddings = parseInt(stats.rows[0].total_embeddings);
        const totalDocuments = parseInt(stats.rows[0].total_documents);
        return {
            totalEmbeddings,
            avgChunksPerDocument: totalDocuments > 0 ? totalEmbeddings / totalDocuments : 0,
            embeddingDimension: this.embeddingService.getDimension(),
        };
    }
    /**
     * Update similarity threshold
     */
    setSimilarityThreshold(threshold) {
        if (threshold < 0 || threshold > 1) {
            throw new Error('Similarity threshold must be between 0 and 1');
        }
        this.defaultSimilarityThreshold = threshold;
    }
    /**
     * Get current similarity threshold
     */
    getSimilarityThreshold() {
        return this.defaultSimilarityThreshold;
    }
}
exports.VectorSearchService = VectorSearchService;
//# sourceMappingURL=VectorSearchService.js.map