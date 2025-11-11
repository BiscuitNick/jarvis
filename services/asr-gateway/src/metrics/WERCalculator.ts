/**
 * Word Error Rate (WER) Calculator
 * Calculates WER for quality assessment of ASR transcriptions
 */

export interface WERResult {
  wer: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceLength: number;
  hypothesisLength: number;
}

export class WERCalculator {
  private werHistory: Map<string, WERResult[]> = new Map(); // providerName -> WER results
  private globalWER: number = 0;
  private totalCalculations: number = 0;

  /**
   * Calculate Word Error Rate between reference and hypothesis
   * Uses Levenshtein distance at word level
   */
  calculate(reference: string, hypothesis: string): WERResult {
    // Normalize and tokenize
    const refWords = this.normalizeAndTokenize(reference);
    const hypWords = this.normalizeAndTokenize(hypothesis);

    // Calculate edit distance
    const { distance, operations } = this.levenshteinDistance(refWords, hypWords);

    // Count operation types
    const { substitutions, deletions, insertions } = this.countOperations(operations);

    // Calculate WER
    const wer = refWords.length === 0 ? 0 : distance / refWords.length;

    return {
      wer,
      substitutions,
      deletions,
      insertions,
      referenceLength: refWords.length,
      hypothesisLength: hypWords.length,
    };
  }

  /**
   * Record WER for a provider
   */
  recordWER(providerName: string, werResult: WERResult): void {
    if (!this.werHistory.has(providerName)) {
      this.werHistory.set(providerName, []);
    }

    const history = this.werHistory.get(providerName)!;
    history.push(werResult);

    // Keep only last 100 results per provider
    if (history.length > 100) {
      history.shift();
    }

    // Update global WER
    this.totalCalculations++;
    this.globalWER = (this.globalWER * (this.totalCalculations - 1) + werResult.wer) / this.totalCalculations;
  }

  /**
   * Get average WER for a provider
   */
  getProviderWER(providerName: string): number {
    const history = this.werHistory.get(providerName);
    if (!history || history.length === 0) {
      return 0;
    }

    const sum = history.reduce((acc, result) => acc + result.wer, 0);
    return sum / history.length;
  }

  /**
   * Get WER statistics for a provider
   */
  getProviderStats(providerName: string) {
    const history = this.werHistory.get(providerName);
    if (!history || history.length === 0) {
      return null;
    }

    const wers = history.map(r => r.wer);
    const sorted = [...wers].sort((a, b) => a - b);

    return {
      providerName,
      count: history.length,
      avgWER: this.getProviderWER(providerName),
      minWER: Math.min(...wers),
      maxWER: Math.max(...wers),
      p50: this.calculatePercentile(sorted, 0.5),
      p95: this.calculatePercentile(sorted, 0.95),
      totalSubstitutions: history.reduce((acc, r) => acc + r.substitutions, 0),
      totalDeletions: history.reduce((acc, r) => acc + r.deletions, 0),
      totalInsertions: history.reduce((acc, r) => acc + r.insertions, 0),
    };
  }

  /**
   * Get all provider WER statistics
   */
  getAllProvidersStats() {
    const stats: any[] = [];

    for (const providerName of this.werHistory.keys()) {
      const providerStats = this.getProviderStats(providerName);
      if (providerStats) {
        stats.push(providerStats);
      }
    }

    return stats;
  }

  /**
   * Get global WER statistics
   */
  getGlobalStats() {
    return {
      globalWER: this.globalWER,
      totalCalculations: this.totalCalculations,
      providers: this.getAllProvidersStats(),
    };
  }

  /**
   * Private: Normalize and tokenize text
   */
  private normalizeAndTokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Private: Calculate Levenshtein distance with operation tracking
   */
  private levenshteinDistance(
    ref: string[],
    hyp: string[]
  ): { distance: number; operations: string[] } {
    const m = ref.length;
    const n = hyp.length;

    // Create distance matrix
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    // Create operation matrix
    const ops: string[][] = Array(m + 1)
      .fill('')
      .map(() => Array(n + 1).fill(''));

    // Initialize base cases
    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
      ops[i][0] = 'D'; // Deletion
    }

    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
      ops[0][j] = 'I'; // Insertion
    }

    ops[0][0] = 'M'; // Match

    // Fill the matrices
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (ref[i - 1] === hyp[j - 1]) {
          // Match
          dp[i][j] = dp[i - 1][j - 1];
          ops[i][j] = 'M';
        } else {
          // Substitution
          const subCost = dp[i - 1][j - 1] + 1;
          // Deletion
          const delCost = dp[i - 1][j] + 1;
          // Insertion
          const insCost = dp[i][j - 1] + 1;

          const minCost = Math.min(subCost, delCost, insCost);
          dp[i][j] = minCost;

          if (minCost === subCost) {
            ops[i][j] = 'S'; // Substitution
          } else if (minCost === delCost) {
            ops[i][j] = 'D'; // Deletion
          } else {
            ops[i][j] = 'I'; // Insertion
          }
        }
      }
    }

    // Backtrack to get operations
    const operations: string[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i === 0) {
        operations.push('I');
        j--;
      } else if (j === 0) {
        operations.push('D');
        i--;
      } else {
        operations.push(ops[i][j]);

        if (ops[i][j] === 'M' || ops[i][j] === 'S') {
          i--;
          j--;
        } else if (ops[i][j] === 'D') {
          i--;
        } else {
          j--;
        }
      }
    }

    return {
      distance: dp[m][n],
      operations: operations.reverse(),
    };
  }

  /**
   * Private: Count operation types
   */
  private countOperations(operations: string[]): {
    substitutions: number;
    deletions: number;
    insertions: number;
  } {
    return {
      substitutions: operations.filter(op => op === 'S').length,
      deletions: operations.filter(op => op === 'D').length,
      insertions: operations.filter(op => op === 'I').length,
    };
  }

  /**
   * Private: Calculate percentile
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) {
      return 0;
    }

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Clear all WER data
   */
  clear(): void {
    this.werHistory.clear();
    this.globalWER = 0;
    this.totalCalculations = 0;
  }

  /**
   * Check if WER is within acceptable threshold
   */
  isWERAcceptable(threshold: number = 0.15): boolean {
    return this.globalWER <= threshold;
  }

  /**
   * Get WER report
   */
  getWERReport() {
    return {
      summary: {
        globalWER: this.globalWER.toFixed(3),
        totalCalculations: this.totalCalculations,
        acceptable: this.isWERAcceptable(),
        threshold: '0.15 (15%)',
      },
      providers: this.getAllProvidersStats(),
    };
  }
}
