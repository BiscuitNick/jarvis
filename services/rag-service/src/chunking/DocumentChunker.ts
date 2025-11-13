/**
 * Document Chunker
 * Splits documents into chunks suitable for embedding
 */

export interface ChunkOptions {
  maxChunkSize?: number; // Maximum characters per chunk
  overlapSize?: number; // Number of characters to overlap between chunks
  preserveParagraphs?: boolean; // Try to keep paragraphs intact
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

export class DocumentChunker {
  private defaultOptions: Required<ChunkOptions> = {
    maxChunkSize: 1000, // ~250 tokens for OpenAI
    overlapSize: 200, // 20% overlap
    preserveParagraphs: true,
  };

  /**
   * Chunk a document into smaller pieces
   */
  chunkDocument(content: string, options?: ChunkOptions): DocumentChunk[] {
    const opts = { ...this.defaultOptions, ...options };
    const chunks: DocumentChunk[] = [];

    // Normalize line endings
    const normalized = content.replace(/\r\n/g, '\n');

    // For large documents (>10KB), use simple sliding window to avoid memory issues
    if (normalized.length > 10000) {
      console.log(`[DocumentChunker] Large document detected (${normalized.length} chars), using simple chunking`);
      chunks.push(...this.slidingWindowChunk(normalized, opts));
    } else if (opts.preserveParagraphs) {
      // Split by paragraphs first
      const paragraphs = this.splitIntoParagraphs(normalized);
      chunks.push(...this.chunkParagraphs(paragraphs, opts));
    } else {
      // Simple sliding window chunking
      chunks.push(...this.slidingWindowChunk(normalized, opts));
    }

    return chunks;
  }

  /**
   * Split text into paragraphs
   */
  private splitIntoParagraphs(text: string): string[] {
    // For very large documents, use simpler splitting to avoid regex catastrophic backtracking
    if (text.length > 10000) {
      // Simple split by double newlines only
      const paragraphs = text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      return paragraphs;
    }

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
  private chunkParagraphs(
    paragraphs: string[],
    options: Required<ChunkOptions>
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
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
      } else {
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
  private slidingWindowChunk(
    text: string,
    options: Required<ChunkOptions>
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let start = 0;

    console.log(`[DocumentChunker] Starting sliding window chunking for ${text.length} chars`);

    while (start < text.length) {
      const end = Math.min(start + options.maxChunkSize, text.length);
      let actualEnd = end;

      // Try to break at sentence or word boundary if not at the end
      if (end < text.length) {
        // Look for break points in a smaller window to avoid searching entire chunk
        const searchStart = Math.max(end - 200, start + options.maxChunkSize * 0.5);
        const searchText = text.substring(searchStart, end);

        const lastSentence = searchText.lastIndexOf('. ');
        const lastNewline = searchText.lastIndexOf('\n');
        const lastSpace = searchText.lastIndexOf(' ');

        const breakPoint = Math.max(lastSentence, lastNewline, lastSpace);

        if (breakPoint > 0) {
          actualEnd = searchStart + breakPoint + 1;
        }
      }

      const chunkText = text.substring(start, actualEnd).trim();

      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          index: chunks.length,
          metadata: {
            startOffset: start,
            endOffset: actualEnd,
            characterCount: chunkText.length,
          },
        });
      }

      // Move start position with overlap
      start = actualEnd - Math.min(options.overlapSize, actualEnd - start);

      // Prevent infinite loop
      if (start <= chunks.length * 10 && chunks.length > 0) {
        start = actualEnd;
      }
    }

    console.log(`[DocumentChunker] Created ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Get overlap text from end of chunk
   */
  private getOverlapText(text: string, overlapSize: number): string {
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
  private createChunk(text: string, index: number, startOffset: number): DocumentChunk {
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
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
