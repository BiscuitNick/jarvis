"use strict";
/**
 * Document Chunker
 * Splits documents into chunks suitable for embedding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentChunker = void 0;
class DocumentChunker {
    defaultOptions = {
        maxChunkSize: 1000, // ~250 tokens for OpenAI
        overlapSize: 200, // 20% overlap
        preserveParagraphs: true,
    };
    /**
     * Chunk a document into smaller pieces
     */
    chunkDocument(content, options) {
        const opts = { ...this.defaultOptions, ...options };
        const chunks = [];
        // Normalize line endings
        const normalized = content.replace(/\r\n/g, '\n');
        if (opts.preserveParagraphs) {
            // Split by paragraphs first
            const paragraphs = this.splitIntoParagraphs(normalized);
            chunks.push(...this.chunkParagraphs(paragraphs, opts));
        }
        else {
            // Simple sliding window chunking
            chunks.push(...this.slidingWindowChunk(normalized, opts));
        }
        return chunks;
    }
    /**
     * Split text into paragraphs
     */
    splitIntoParagraphs(text) {
        // Split by double newlines or markdown headers
        const paragraphs = text
            .split(/\n\n+|(?=^#{1,6} )/m)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        return paragraphs;
    }
    /**
     * Chunk paragraphs while trying to keep them intact
     */
    chunkParagraphs(paragraphs, options) {
        const chunks = [];
        let currentChunk = '';
        let currentOffset = 0;
        let chunkStartOffset = 0;
        for (const paragraph of paragraphs) {
            // If paragraph alone is larger than max chunk size, split it
            if (paragraph.length > options.maxChunkSize) {
                // Save current chunk if exists
                if (currentChunk.length > 0) {
                    chunks.push(this.createChunk(currentChunk, chunks.length, chunkStartOffset));
                    currentChunk = '';
                }
                // Split large paragraph
                const subChunks = this.slidingWindowChunk(paragraph, options);
                subChunks.forEach((subChunk) => {
                    chunks.push({
                        ...subChunk,
                        index: chunks.length,
                        metadata: {
                            ...subChunk.metadata,
                            startOffset: currentOffset + subChunk.metadata.startOffset,
                            endOffset: currentOffset + subChunk.metadata.endOffset,
                        },
                    });
                });
                currentOffset += paragraph.length + 2; // +2 for paragraph separator
                chunkStartOffset = currentOffset;
                continue;
            }
            // Check if adding this paragraph would exceed max chunk size
            const potentialLength = currentChunk.length + paragraph.length + 2; // +2 for newlines
            if (potentialLength > options.maxChunkSize && currentChunk.length > 0) {
                // Save current chunk
                chunks.push(this.createChunk(currentChunk, chunks.length, chunkStartOffset));
                // Start new chunk with overlap
                const overlapText = this.getOverlapText(currentChunk, options.overlapSize);
                currentChunk = overlapText + (overlapText ? '\n\n' : '') + paragraph;
                chunkStartOffset = currentOffset - overlapText.length;
            }
            else {
                // Add to current chunk
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
            currentOffset += paragraph.length + 2;
        }
        // Add final chunk
        if (currentChunk.length > 0) {
            chunks.push(this.createChunk(currentChunk, chunks.length, chunkStartOffset));
        }
        return chunks;
    }
    /**
     * Simple sliding window chunking
     */
    slidingWindowChunk(text, options) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + options.maxChunkSize, text.length);
            let chunkText = text.substring(start, end);
            // Try to break at sentence or word boundary if not at the end
            if (end < text.length) {
                const lastSentence = chunkText.lastIndexOf('. ');
                const lastNewline = chunkText.lastIndexOf('\n');
                const lastSpace = chunkText.lastIndexOf(' ');
                const breakPoint = Math.max(lastSentence, lastNewline, lastSpace);
                if (breakPoint > options.maxChunkSize * 0.5) {
                    // Only break if we're at least 50% through the chunk
                    chunkText = chunkText.substring(0, breakPoint + 1).trim();
                }
            }
            chunks.push({
                text: chunkText,
                index: chunks.length,
                metadata: {
                    startOffset: start,
                    endOffset: start + chunkText.length,
                    characterCount: chunkText.length,
                },
            });
            // Move start position with overlap
            start += chunkText.length - options.overlapSize;
            if (start < 0)
                start = 0;
        }
        return chunks;
    }
    /**
     * Get overlap text from end of chunk
     */
    getOverlapText(text, overlapSize) {
        if (text.length <= overlapSize) {
            return text;
        }
        // Try to get complete sentences for overlap
        const overlapText = text.substring(text.length - overlapSize);
        const firstSentence = overlapText.indexOf('. ');
        if (firstSentence !== -1 && firstSentence < overlapSize * 0.5) {
            return overlapText.substring(firstSentence + 2); // Skip ". "
        }
        return overlapText;
    }
    /**
     * Create chunk object
     */
    createChunk(text, index, startOffset) {
        return {
            text: text.trim(),
            index,
            metadata: {
                startOffset,
                endOffset: startOffset + text.length,
                characterCount: text.length,
            },
        };
    }
    /**
     * Estimate token count (rough approximation: 1 token ≈ 4 characters)
     */
    estimateTokenCount(text) {
        return Math.ceil(text.length / 4);
    }
}
exports.DocumentChunker = DocumentChunker;
//# sourceMappingURL=DocumentChunker.js.map