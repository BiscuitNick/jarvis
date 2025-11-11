/**
 * GitHub Client
 * Fetches and processes content from GitHub repositories
 */
export interface GitHubDocument {
    path: string;
    content: string;
    url: string;
    type: string;
    sha: string;
}
export interface GitHubRepoConfig {
    owner: string;
    repo: string;
    branch?: string;
    paths?: string[];
}
export declare class GitHubClient {
    private octokit;
    private rateLimitRemaining;
    private rateLimitReset;
    constructor(token?: string);
    /**
     * Fetch repository content
     */
    fetchRepositoryContent(config: GitHubRepoConfig): Promise<GitHubDocument[]>;
    /**
     * Fetch content from a specific path (file or directory)
     */
    private fetchPath;
    /**
     * Fetch repository issues
     */
    fetchIssues(owner: string, repo: string, limit?: number): Promise<GitHubDocument[]>;
    /**
     * Check rate limit before making requests
     */
    private checkRateLimit;
    /**
     * Update rate limit from response headers
     */
    private updateRateLimit;
    /**
     * Determine if a file should be included based on its name
     */
    private shouldIncludeFile;
    /**
     * Get file type based on extension
     */
    private getFileType;
    /**
     * Get rate limit status
     */
    getRateLimitStatus(): {
        remaining: number;
        reset: Date;
    };
}
//# sourceMappingURL=GitHubClient.d.ts.map