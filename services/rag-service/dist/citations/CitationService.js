"use strict";
/**
 * Citation Service
 * Manages source references and citation formatting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CitationService = void 0;
class CitationService {
    /**
     * Create citations from search results
     */
    createCitations(searchResults, includeExcerpts = true) {
        // Group by document to avoid duplicate citations
        const citationMap = new Map();
        for (const result of searchResults) {
            if (!citationMap.has(result.documentId)) {
                citationMap.set(result.documentId, {
                    id: result.documentId,
                    title: result.documentTitle,
                    url: result.sourceUrl,
                    sourceType: result.sourceType,
                    relevance: result.similarity,
                    excerpt: includeExcerpts ? this.truncateExcerpt(result.chunkText, 150) : undefined,
                });
            }
            else {
                // Update relevance with highest similarity score
                const existing = citationMap.get(result.documentId);
                if (result.similarity > existing.relevance) {
                    existing.relevance = result.similarity;
                    if (includeExcerpts) {
                        existing.excerpt = this.truncateExcerpt(result.chunkText, 150);
                    }
                }
            }
        }
        // Sort by relevance
        return Array.from(citationMap.values()).sort((a, b) => b.relevance - a.relevance);
    }
    /**
     * Format citations as text
     */
    formatCitations(citations, format = 'numbered') {
        if (citations.length === 0) {
            return '';
        }
        let formatted = '\n\n**Sources:**\n';
        citations.forEach((citation, index) => {
            switch (format) {
                case 'numbered':
                    formatted += `${index + 1}. [${citation.title}](${citation.url})`;
                    break;
                case 'markdown':
                    formatted += `- [${citation.title}](${citation.url})`;
                    break;
                case 'plain':
                    formatted += `${citation.title}: ${citation.url}`;
                    break;
            }
            if (citation.excerpt) {
                formatted += `\n   > ${citation.excerpt}`;
            }
            formatted += '\n';
        });
        return formatted;
    }
    /**
     * Inject citations into response
     */
    injectCitations(response, searchResults, options = {}) {
        const maxCitations = options.maxCitations || 5;
        const format = options.format || 'numbered';
        const includeExcerpts = options.includeExcerpts !== false;
        // Create and limit citations
        const allCitations = this.createCitations(searchResults, includeExcerpts);
        const citations = allCitations.slice(0, maxCitations);
        // Format citations
        const citationText = this.formatCitations(citations, format);
        // Inject inline citations if using numbered format
        let citedResponse = response;
        if (format === 'numbered') {
            citedResponse = this.injectInlineCitations(response, searchResults, citations);
        }
        return {
            response: citedResponse,
            citations,
            citationText,
        };
    }
    /**
     * Inject inline citation markers into response
     * Attempts to match relevant parts of the response to citations
     */
    injectInlineCitations(response, searchResults, citations) {
        // This is a simplified implementation
        // In production, you might use NLP to better match response segments to sources
        let citedResponse = response;
        // Create a map of document IDs to citation numbers
        const citationNumbers = new Map();
        citations.forEach((citation, index) => {
            citationNumbers.set(citation.id, index + 1);
        });
        // For each search result, try to find relevant text in the response
        const processedPositions = new Set();
        for (const result of searchResults) {
            const citationNum = citationNumbers.get(result.documentId);
            if (!citationNum)
                continue;
            // Extract key phrases from the chunk (simple approach: take first sentence)
            const sentences = result.chunkText.match(/[^.!?]+[.!?]+/g) || [];
            if (sentences.length === 0 || !sentences[0])
                continue;
            const keyPhrase = sentences[0].trim().slice(0, 50);
            // Look for similar text in response
            const words = keyPhrase.split(' ').slice(0, 5).join(' ');
            const regex = new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const match = regex.exec(citedResponse);
            if (match && !processedPositions.has(match.index)) {
                // Insert citation marker after the matched text
                const insertPos = match.index + match[0].length;
                const citation = ` [${citationNum}]`;
                citedResponse =
                    citedResponse.slice(0, insertPos) + citation + citedResponse.slice(insertPos);
                processedPositions.add(insertPos);
            }
        }
        return citedResponse;
    }
    /**
     * Truncate excerpt to specified length
     */
    truncateExcerpt(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        // Try to truncate at sentence boundary
        const truncated = text.slice(0, maxLength);
        const lastSentence = truncated.lastIndexOf('.');
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSentence > maxLength * 0.7) {
            return truncated.slice(0, lastSentence + 1);
        }
        else if (lastSpace > maxLength * 0.7) {
            return truncated.slice(0, lastSpace) + '...';
        }
        return truncated + '...';
    }
    /**
     * Validate that response is grounded in sources
     * Returns confidence score (0-1)
     */
    validateGrounding(response, searchResults) {
        if (searchResults.length === 0) {
            return 0;
        }
        // Simple approach: check overlap between response and source chunks
        const responseWords = new Set(response.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        let totalOverlap = 0;
        let totalSourceWords = 0;
        for (const result of searchResults) {
            const sourceWords = result.chunkText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            totalSourceWords += sourceWords.length;
            for (const word of sourceWords) {
                if (responseWords.has(word)) {
                    totalOverlap++;
                }
            }
        }
        // Calculate overlap ratio weighted by similarity scores
        const avgSimilarity = searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length;
        const overlapRatio = totalSourceWords > 0 ? totalOverlap / totalSourceWords : 0;
        return (overlapRatio * 0.6 + avgSimilarity * 0.4);
    }
    /**
     * Extract key quotes from search results
     */
    extractKeyQuotes(searchResults, maxQuotes = 3) {
        const quotes = [];
        for (const result of searchResults.slice(0, maxQuotes * 2)) {
            // Extract sentences from chunk
            const sentences = result.chunkText.match(/[^.!?]+[.!?]+/g) || [];
            for (const sentence of sentences) {
                const trimmed = sentence.trim();
                if (trimmed.length > 50 && trimmed.length < 200) {
                    quotes.push(trimmed);
                    if (quotes.length >= maxQuotes) {
                        return quotes;
                    }
                }
            }
        }
        return quotes;
    }
}
exports.CitationService = CitationService;
//# sourceMappingURL=CitationService.js.map