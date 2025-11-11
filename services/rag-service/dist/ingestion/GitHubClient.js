"use strict";
/**
 * GitHub Client
 * Fetches and processes content from GitHub repositories
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const rest_1 = require("@octokit/rest");
class GitHubClient {
    octokit;
    rateLimitRemaining = 5000;
    rateLimitReset = 0;
    constructor(token) {
        this.octokit = new rest_1.Octokit({
            auth: token || process.env.GITHUB_TOKEN,
        });
    }
    /**
     * Fetch repository content
     */
    async fetchRepositoryContent(config) {
        const documents = [];
        const branch = config.branch || 'main';
        try {
            // Check rate limit before making requests
            await this.checkRateLimit();
            // If specific paths are provided, fetch only those
            if (config.paths && config.paths.length > 0) {
                for (const path of config.paths) {
                    const docs = await this.fetchPath(config.owner, config.repo, path, branch);
                    documents.push(...docs);
                }
            }
            else {
                // Fetch common documentation files
                const defaultPaths = ['README.md', 'docs/', 'CONTRIBUTING.md', 'CHANGELOG.md'];
                for (const path of defaultPaths) {
                    try {
                        const docs = await this.fetchPath(config.owner, config.repo, path, branch);
                        documents.push(...docs);
                    }
                    catch (error) {
                        // Path might not exist, continue with others
                        console.log(`[GitHubClient] Path ${path} not found, skipping`);
                    }
                }
            }
            return documents;
        }
        catch (error) {
            console.error('[GitHubClient] Error fetching repository content:', error);
            throw error;
        }
    }
    /**
     * Fetch content from a specific path (file or directory)
     */
    async fetchPath(owner, repo, path, ref) {
        const documents = [];
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path,
                ref,
            });
            this.updateRateLimit(response.headers);
            if (Array.isArray(response.data)) {
                // Directory - recursively fetch files
                for (const item of response.data) {
                    if (item.type === 'file' && this.shouldIncludeFile(item.name)) {
                        const fileDocs = await this.fetchPath(owner, repo, item.path, ref);
                        documents.push(...fileDocs);
                    }
                    else if (item.type === 'dir') {
                        // Recursively fetch directory contents
                        const dirDocs = await this.fetchPath(owner, repo, item.path, ref);
                        documents.push(...dirDocs);
                    }
                }
            }
            else if (response.data.type === 'file') {
                // Single file
                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
                documents.push({
                    path: response.data.path,
                    content,
                    url: response.data.html_url || response.data.url,
                    type: this.getFileType(response.data.path),
                    sha: response.data.sha,
                });
            }
            return documents;
        }
        catch (error) {
            if (error.status === 404) {
                console.log(`[GitHubClient] Path not found: ${path}`);
                return [];
            }
            throw error;
        }
    }
    /**
     * Fetch repository issues
     */
    async fetchIssues(owner, repo, limit = 100) {
        try {
            await this.checkRateLimit();
            const response = await this.octokit.issues.listForRepo({
                owner,
                repo,
                state: 'all',
                per_page: Math.min(limit, 100),
            });
            this.updateRateLimit(response.headers);
            return response.data.map((issue) => ({
                path: `issues/${issue.number}`,
                content: `# ${issue.title}\n\n${issue.body || ''}`,
                url: issue.html_url,
                type: 'issue',
                sha: String(issue.id),
            }));
        }
        catch (error) {
            console.error('[GitHubClient] Error fetching issues:', error);
            throw error;
        }
    }
    /**
     * Check rate limit before making requests
     */
    async checkRateLimit() {
        if (this.rateLimitRemaining < 10) {
            const now = Date.now();
            if (now < this.rateLimitReset) {
                const waitTime = this.rateLimitReset - now;
                console.warn(`[GitHubClient] Rate limit low, waiting ${waitTime}ms`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
        }
        // Refresh rate limit status
        try {
            const response = await this.octokit.rateLimit.get();
            this.rateLimitRemaining = response.data.rate.remaining;
            this.rateLimitReset = response.data.rate.reset * 1000;
        }
        catch (error) {
            console.error('[GitHubClient] Error checking rate limit:', error);
        }
    }
    /**
     * Update rate limit from response headers
     */
    updateRateLimit(headers) {
        if (headers['x-ratelimit-remaining']) {
            this.rateLimitRemaining = parseInt(headers['x-ratelimit-remaining'], 10);
        }
        if (headers['x-ratelimit-reset']) {
            this.rateLimitReset = parseInt(headers['x-ratelimit-reset'], 10) * 1000;
        }
    }
    /**
     * Determine if a file should be included based on its name
     */
    shouldIncludeFile(filename) {
        const includedExtensions = ['.md', '.txt', '.rst', '.json', '.yaml', '.yml'];
        const excludedPatterns = [
            'node_modules',
            'package-lock.json',
            '.git',
            'dist',
            'build',
            '.env',
        ];
        // Check if file matches excluded patterns
        if (excludedPatterns.some((pattern) => filename.includes(pattern))) {
            return false;
        }
        // Check if file has an included extension
        return includedExtensions.some((ext) => filename.endsWith(ext));
    }
    /**
     * Get file type based on extension
     */
    getFileType(path) {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'md':
                return 'markdown';
            case 'txt':
                return 'text';
            case 'json':
                return 'json';
            case 'yaml':
            case 'yml':
                return 'yaml';
            case 'rst':
                return 'restructuredtext';
            default:
                return 'unknown';
        }
    }
    /**
     * Get rate limit status
     */
    getRateLimitStatus() {
        return {
            remaining: this.rateLimitRemaining,
            reset: new Date(this.rateLimitReset),
        };
    }
}
exports.GitHubClient = GitHubClient;
//# sourceMappingURL=GitHubClient.js.map