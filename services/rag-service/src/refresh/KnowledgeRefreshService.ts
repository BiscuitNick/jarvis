/**
 * Knowledge Refresh Service
 * Automatically refreshes knowledge base with latest content
 */

import { Pool } from 'pg';
import { DocumentIngestionService } from '../ingestion/DocumentIngestionService';
import { GitHubRepoConfig } from '../ingestion/GitHubClient';

export interface RefreshConfig {
  repositories: GitHubRepoConfig[];
  intervalMinutes: number;
}

export interface RefreshResult {
  timestamp: Date;
  repositoriesProcessed: number;
  documentsUpdated: number;
  errors: string[];
  duration: number;
}

export class KnowledgeRefreshService {
  private ingestionService: DocumentIngestionService;
  private pool: Pool;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  private lastRefresh: Date | null = null;
  private refreshHistory: RefreshResult[] = [];
  private config: RefreshConfig;

  constructor(pool: Pool, ingestionService: DocumentIngestionService, config: RefreshConfig) {
    this.pool = pool;
    this.ingestionService = ingestionService;
    this.config = config;
  }

  /**
   * Start automatic knowledge refresh
   */
  start(): void {
    if (this.refreshInterval) {
      console.log('[KnowledgeRefresh] Already running');
      return;
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    console.log(`[KnowledgeRefresh] Starting automatic refresh every ${this.config.intervalMinutes} minutes`);

    // Run initial refresh
    this.refresh();

    // Schedule periodic refreshes
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, intervalMs);
  }

  /**
   * Stop automatic knowledge refresh
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('[KnowledgeRefresh] Stopped');
    }
  }

  /**
   * Manually trigger a refresh
   */
  async refresh(): Promise<RefreshResult> {
    if (this.isRefreshing) {
      console.log('[KnowledgeRefresh] Refresh already in progress, skipping');
      throw new Error('Refresh already in progress');
    }

    this.isRefreshing = true;
    const startTime = Date.now();

    const result: RefreshResult = {
      timestamp: new Date(),
      repositoriesProcessed: 0,
      documentsUpdated: 0,
      errors: [],
      duration: 0,
    };

    try {
      console.log(`[KnowledgeRefresh] Starting refresh of ${this.config.repositories.length} repositories...`);

      for (const repoConfig of this.config.repositories) {
        try {
          const stats = await this.ingestionService.ingestGitHubRepository(repoConfig);

          result.repositoriesProcessed++;
          result.documentsUpdated += stats.documentsProcessed;

          if (stats.errors.length > 0) {
            result.errors.push(...stats.errors);
          }

          console.log(`[KnowledgeRefresh] Processed ${repoConfig.owner}/${repoConfig.repo}: ${stats.documentsProcessed} docs, ${stats.chunksCreated} chunks`);
        } catch (error) {
          const errorMsg = `Failed to refresh ${repoConfig.owner}/${repoConfig.repo}: ${error}`;
          console.error(`[KnowledgeRefresh] ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }

      result.duration = Date.now() - startTime;
      this.lastRefresh = result.timestamp;

      // Store result in history (keep last 100)
      this.refreshHistory.push(result);
      if (this.refreshHistory.length > 100) {
        this.refreshHistory.shift();
      }

      console.log(`[KnowledgeRefresh] Complete: ${result.repositoriesProcessed} repos, ${result.documentsUpdated} docs updated in ${result.duration}ms`);

      // Record refresh in database
      await this.recordRefresh(result);

      return result;
    } catch (error) {
      result.errors.push(`Refresh failed: ${error}`);
      result.duration = Date.now() - startTime;
      console.error('[KnowledgeRefresh] Error:', error);
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Record refresh in database for tracking
   */
  private async recordRefresh(result: RefreshResult): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO logs (session_id, request_type, request_data, response_data, latency_ms, status)
         VALUES (NULL, 'knowledge_refresh', $1, $2, $3, $4)`,
        [
          JSON.stringify({
            repositories: this.config.repositories.length,
            timestamp: result.timestamp,
          }),
          JSON.stringify({
            repositoriesProcessed: result.repositoriesProcessed,
            documentsUpdated: result.documentsUpdated,
            errors: result.errors,
          }),
          result.duration,
          result.errors.length > 0 ? 'partial_success' : 'success',
        ]
      );
    } catch (error) {
      console.error('[KnowledgeRefresh] Error recording refresh:', error);
    }
  }

  /**
   * Get refresh status
   */
  getStatus() {
    return {
      isRunning: this.refreshInterval !== null,
      isRefreshing: this.isRefreshing,
      lastRefresh: this.lastRefresh,
      intervalMinutes: this.config.intervalMinutes,
      repositoriesCount: this.config.repositories.length,
      nextRefresh: this.lastRefresh && this.refreshInterval
        ? new Date(this.lastRefresh.getTime() + this.config.intervalMinutes * 60 * 1000)
        : null,
    };
  }

  /**
   * Get refresh history
   */
  getHistory(limit: number = 10): RefreshResult[] {
    return this.refreshHistory.slice(-limit).reverse();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RefreshConfig>): void {
    if (config.repositories) {
      this.config.repositories = config.repositories;
    }

    if (config.intervalMinutes) {
      this.config.intervalMinutes = config.intervalMinutes;

      // Restart if currently running
      if (this.refreshInterval) {
        this.stop();
        this.start();
      }
    }
  }

  /**
   * Add repository to refresh list
   */
  addRepository(repoConfig: GitHubRepoConfig): void {
    const exists = this.config.repositories.some(
      (r) => r.owner === repoConfig.owner && r.repo === repoConfig.repo
    );

    if (!exists) {
      this.config.repositories.push(repoConfig);
      console.log(`[KnowledgeRefresh] Added repository: ${repoConfig.owner}/${repoConfig.repo}`);
    }
  }

  /**
   * Remove repository from refresh list
   */
  removeRepository(owner: string, repo: string): void {
    this.config.repositories = this.config.repositories.filter(
      (r) => !(r.owner === owner && r.repo === repo)
    );
    console.log(`[KnowledgeRefresh] Removed repository: ${owner}/${repo}`);
  }

  /**
   * Get configured repositories
   */
  getRepositories(): GitHubRepoConfig[] {
    return [...this.config.repositories];
  }
}
