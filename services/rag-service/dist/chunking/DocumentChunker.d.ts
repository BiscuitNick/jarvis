/**
 * Document Chunker
 * Splits documents into chunks suitable for embedding
 */
export interface ChunkOptions {
    maxChunkSize?: number;
    overlapSize?: number;
    preserveParagraphs?: boolean;
}
export interface DocumentChunk {
    text: string;
    index: number;
    metadata: {
        startOffset: number;
        endOffset: number;
        characterCount: number;
    };
}
export declare class DocumentChunker {
    private defaultOptions;
    /**
     * Chunk a document into smaller pieces
     */
    chunkDocument(content: string, options?: ChunkOptions): DocumentChunk[];
    /**
     * Split text into paragraphs
     */
    private splitIntoParagraphs;
    /**
     * Chunk paragraphs while trying to keep them intact
     */
    private chunkParagraphs;
    /**
     * Simple sliding window chunking
     */
    private slidingWindowChunk;
    /**
     * Get overlap text from end of chunk
     */
    private getOverlapText;
    /**
     * Create chunk object
     */
    private createChunk;
    /**
     * Estimate token count (rough approximation: 1 token ≈ 4 characters)
     */
    estimateTokenCount(text: string): number;
}
//# sourceMappingURL=DocumentChunker.d.ts.map