/**
 * Grounding Validator
 * Validates that responses are properly grounded in retrieved sources
 */
import { SearchResult } from '../search/VectorSearchService';
export interface GroundingValidationResult {
    isGrounded: boolean;
    confidence: number;
    metrics: {
        wordOverlap: number;
        sentenceCoverage: number;
        sourceRelevance: number;
        factualConsistency: number;
    };
    recommendations: string[];
}
export declare class GroundingValidator {
    private minConfidenceThreshold;
    /**
     * Validate that a response is grounded in sources
     */
    validate(response: string, sources: SearchResult[]): GroundingValidationResult;
    /**
     * Calculate word overlap between response and sources
     */
    private calculateWordOverlap;
    /**
     * Calculate sentence coverage (how many response sentences have support in sources)
     */
    private calculateSentenceCoverage;
    /**
     * Calculate average relevance of sources
     */
    private calculateSourceRelevance;
    /**
     * Estimate factual consistency (simple heuristic-based)
     */
    private estimateFactualConsistency;
    /**
     * Extract significant words (filter stop words, short words)
     */
    private extractSignificantWords;
    /**
     * Extract sentences from text
     */
    private extractSentences;
    /**
     * Generate recommendations based on metrics
     */
    private generateRecommendations;
    /**
     * Set minimum confidence threshold
     */
    setMinConfidenceThreshold(threshold: number): void;
    /**
     * Get minimum confidence threshold
     */
    getMinConfidenceThreshold(): number;
}
//# sourceMappingURL=GroundingValidator.d.ts.map