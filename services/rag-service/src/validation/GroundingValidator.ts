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

export class GroundingValidator {
  private minConfidenceThreshold: number = 0.6;

  /**
   * Validate that a response is grounded in sources
   */
  validate(response: string, sources: SearchResult[]): GroundingValidationResult {
    if (sources.length === 0) {
      return {
        isGrounded: false,
        confidence: 0,
        metrics: {
          wordOverlap: 0,
          sentenceCoverage: 0,
          sourceRelevance: 0,
          factualConsistency: 0,
        },
        recommendations: ['No sources provided - response cannot be grounded'],
      };
    }

    // Calculate grounding metrics
    const wordOverlap = this.calculateWordOverlap(response, sources);
    const sentenceCoverage = this.calculateSentenceCoverage(response, sources);
    const sourceRelevance = this.calculateSourceRelevance(sources);
    const factualConsistency = this.estimateFactualConsistency(response, sources);

    // Overall confidence is weighted average
    const confidence =
      wordOverlap * 0.3 +
      sentenceCoverage * 0.3 +
      sourceRelevance * 0.2 +
      factualConsistency * 0.2;

    const isGrounded = confidence >= this.minConfidenceThreshold;

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      wordOverlap,
      sentenceCoverage,
      sourceRelevance,
      factualConsistency,
      confidence,
    });

    return {
      isGrounded,
      confidence,
      metrics: {
        wordOverlap,
        sentenceCoverage,
        sourceRelevance,
        factualConsistency,
      },
      recommendations,
    };
  }

  /**
   * Calculate word overlap between response and sources
   */
  private calculateWordOverlap(response: string, sources: SearchResult[]): number {
    const responseWords = this.extractSignificantWords(response);
    const sourceWords = new Set<string>();

    for (const source of sources) {
      const words = this.extractSignificantWords(source.chunkText);
      words.forEach((word) => sourceWords.add(word));
    }

    let overlap = 0;
    for (const word of responseWords) {
      if (sourceWords.has(word)) {
        overlap++;
      }
    }

    return responseWords.length > 0 ? overlap / responseWords.length : 0;
  }

  /**
   * Calculate sentence coverage (how many response sentences have support in sources)
   */
  private calculateSentenceCoverage(response: string, sources: SearchResult[]): number {
    const responseSentences = this.extractSentences(response);
    if (responseSentences.length === 0) return 0;

    const sourceText = sources.map((s) => s.chunkText.toLowerCase()).join(' ');

    let coveredSentences = 0;
    for (const sentence of responseSentences) {
      const sentenceWords = this.extractSignificantWords(sentence);

      // Check if majority of sentence words appear in sources
      let matchedWords = 0;
      for (const word of sentenceWords) {
        if (sourceText.includes(word)) {
          matchedWords++;
        }
      }

      if (sentenceWords.length > 0 && matchedWords / sentenceWords.length > 0.5) {
        coveredSentences++;
      }
    }

    return coveredSentences / responseSentences.length;
  }

  /**
   * Calculate average relevance of sources
   */
  private calculateSourceRelevance(sources: SearchResult[]): number {
    if (sources.length === 0) return 0;

    const avgSimilarity = sources.reduce((sum, s) => sum + s.similarity, 0) / sources.length;
    return avgSimilarity;
  }

  /**
   * Estimate factual consistency (simple heuristic-based)
   */
  private estimateFactualConsistency(response: string, sources: SearchResult[]): number {
    // Check for potential hallucination indicators
    const hallucinations = [
      /I (think|believe|assume|guess)/i,
      /probably|possibly|maybe|perhaps/i,
      /according to me|in my opinion/i,
    ];

    let penalty = 0;
    for (const pattern of hallucinations) {
      if (pattern.test(response)) {
        penalty += 0.2;
      }
    }

    // Check for specific factual claims (numbers, dates, names)
    const facts = response.match(/\d+(\.\d+)?%?|\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
    const sourceText = sources.map((s) => s.chunkText).join(' ');

    let verifiedFacts = 0;
    for (const fact of facts) {
      if (sourceText.includes(fact)) {
        verifiedFacts++;
      }
    }

    const factVerification = facts.length > 0 ? verifiedFacts / facts.length : 0.5;

    return Math.max(0, factVerification - penalty);
  }

  /**
   * Extract significant words (filter stop words, short words)
   */
  private extractSignificantWords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Extract sentences from text
   */
  private extractSentences(text: string): string[] {
    return text
      .match(/[^.!?]+[.!?]+/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 10) || [];
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(metrics: {
    wordOverlap: number;
    sentenceCoverage: number;
    sourceRelevance: number;
    factualConsistency: number;
    confidence: number;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.confidence < this.minConfidenceThreshold) {
      recommendations.push(`Overall grounding confidence (${(metrics.confidence * 100).toFixed(1)}%) is below threshold`);
    }

    if (metrics.wordOverlap < 0.3) {
      recommendations.push('Low word overlap with sources - response may contain unsupported information');
    }

    if (metrics.sentenceCoverage < 0.5) {
      recommendations.push('Many sentences lack support in sources - consider staying closer to source material');
    }

    if (metrics.sourceRelevance < 0.7) {
      recommendations.push('Retrieved sources have low relevance - consider improving search query or expanding knowledge base');
    }

    if (metrics.factualConsistency < 0.5) {
      recommendations.push('Potential factual inconsistencies detected - verify claims against sources');
    }

    if (recommendations.length === 0) {
      recommendations.push('Response appears well-grounded in sources');
    }

    return recommendations;
  }

  /**
   * Set minimum confidence threshold
   */
  setMinConfidenceThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }
    this.minConfidenceThreshold = threshold;
  }

  /**
   * Get minimum confidence threshold
   */
  getMinConfidenceThreshold(): number {
    return this.minConfidenceThreshold;
  }
}
