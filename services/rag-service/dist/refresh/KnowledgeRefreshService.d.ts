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
export declare class KnowledgeRefreshService {
    private ingestionService;
    private pool;
    private refreshInterval;
    private isRefreshing;
    private lastRefresh;
    private refreshHistory;
    private config;
    constructor(pool: Pool, ingestionService: DocumentIngestionService, config: RefreshConfig);
    /**
     * Start automatic knowledge refresh
     */
    start(): void;
    /**
     * Stop automatic knowledge refresh
     */
    stop(): void;
    /**
     * Manually trigger a refresh
     */
    refresh(): Promise<RefreshResult>;
    /**
     * Record refresh in database for tracking
     */
    private recordRefresh;
    /**
     * Get refresh status
     */
    getStatus(): {
        isRunning: boolean;
        isRefreshing: boolean;
        lastRefresh: Date | null;
        intervalMinutes: number;
        repositoriesCount: number;
        nextRefresh: Date | null;
    };
    /**
     * Get refresh history
     */
    getHistory(limit?: number): RefreshResult[];
    /**
     * Update configuration
     */
    updateConfig(config: Partial<RefreshConfig>): void;
    /**
     * Add repository to refresh list
     */
    addRepository(repoConfig: GitHubRepoConfig): void;
    /**
     * Remove repository from refresh list
     */
    removeRepository(owner: string, repo: string): void;
    /**
     * Get configured repositories
     */
    getRepositories(): GitHubRepoConfig[];
}
//# sourceMappingURL=KnowledgeRefreshService.d.ts.map