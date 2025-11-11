/**
 * Citation Service
 * Manages source references and citation formatting
 */
import { SearchResult } from '../search/VectorSearchService';
export interface Citation {
    id: string;
    title: string;
    url: string;
    sourceType: string;
    relevance: number;
    excerpt?: string;
}
export interface CitedResponse {
    response: string;
    citations: Citation[];
    citationText: string;
}
export declare class CitationService {
    /**
     * Create citations from search results
     */
    createCitations(searchResults: SearchResult[], includeExcerpts?: boolean): Citation[];
    /**
     * Format citations as text
     */
    formatCitations(citations: Citation[], format?: 'numbered' | 'markdown' | 'plain'): string;
    /**
     * Inject citations into response
     */
    injectCitations(response: string, searchResults: SearchResult[], options?: {
        format?: 'numbered' | 'markdown' | 'plain';
        includeExcerpts?: boolean;
        maxCitations?: number;
    }): CitedResponse;
    /**
     * Inject inline citation markers into response
     * Attempts to match relevant parts of the response to citations
     */
    private injectInlineCitations;
    /**
     * Truncate excerpt to specified length
     */
    private truncateExcerpt;
    /**
     * Validate that response is grounded in sources
     * Returns confidence score (0-1)
     */
    validateGrounding(response: string, searchResults: SearchResult[]): number;
    /**
     * Extract key quotes from search results
     */
    extractKeyQuotes(searchResults: SearchResult[], maxQuotes?: number): string[];
}
//# sourceMappingURL=CitationService.d.ts.map