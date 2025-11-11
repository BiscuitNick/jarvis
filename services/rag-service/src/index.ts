import express from 'express';
import { getPool, connectWithRetry, closePool } from './db/pool';
import { DocumentIngestionService } from './ingestion/DocumentIngestionService';
import { VectorSearchService } from './search/VectorSearchService';
import { EmbeddingService } from './embeddings/EmbeddingService';
import { CitationService } from './citations/CitationService';
import { KnowledgeRefreshService } from './refresh/KnowledgeRefreshService';
import { GroundingValidator } from './validation/GroundingValidator';

const app = express();
const PORT = process.env.PORT || 8080;

let isDraining = false;

// Initialize services
let ingestionService: DocumentIngestionService;
let searchService: VectorSearchService;
let embeddingService: EmbeddingService;
let citationService: CitationService;
let refreshService: KnowledgeRefreshService;
let groundingValidator: GroundingValidator;

app.use(express.json());

// Health check endpoint
app.get('/healthz', async (req, res) => {
  if (isDraining) {
    return res.status(503).json({
      status: 'draining',
      service: 'rag-service',
      timestamp: new Date().toISOString(),
    });
  }

  let dbStatus = 'down';
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbStatus = 'up';
  } catch (error) {
    console.error('[rag-service] Health check DB error:', error);
  }

  const statusCode = dbStatus === 'up' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    service: 'rag-service',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    refresh: refreshService?.getStatus(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis RAG Service',
    version: '2.0.0',
    description: 'Retrieval-Augmented Generation with pgvector, embeddings, and citations',
    features: [
      'GitHub repository ingestion',
      'Document chunking and embedding',
      'Semantic vector search with pgvector',
      'Citation injection and source references',
      'Automatic knowledge refresh',
      'Grounding validation',
    ],
    endpoints: {
      health: '/healthz',
      search: 'POST /search',
      ingest: 'POST /ingest/github',
      refresh: 'POST /refresh',
      validate: 'POST /validate',
      stats: 'GET /stats',
      retrieve: 'POST /retrieve',
    },
  });
});

// Vector search endpoint
app.post('/search', async (req, res) => {
  try {
    const {
      query,
      limit = 10,
      similarityThreshold = 0.7,
      sourceTypes,
      includeCitations = true,
      includeGrounding = false,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Perform search
    const searchResults = await searchService.search(query, {
      limit,
      similarityThreshold,
      sourceTypes,
      includeMetadata: true,
    });

    let response: any = {
      query,
      results: searchResults,
      count: searchResults.length,
    };

    // Add citations if requested
    if (includeCitations) {
      const cited = citationService.injectCitations('', searchResults, {
        maxCitations: 5,
        includeExcerpts: true,
      });
      response.citations = cited.citations;
    }

    // Add grounding validation if requested
    if (includeGrounding && req.body.response) {
      const validation = groundingValidator.validate(req.body.response, searchResults);
      response.grounding = validation;
    }

    res.json(response);
  } catch (error) {
    console.error('[rag-service] Search error:', error);
    res.status(500).json({ error: 'Search failed', message: String(error) });
  }
});

// Hybrid search endpoint (combines vector + keyword)
app.post('/search/hybrid', async (req, res) => {
  try {
    const { query, limit = 10, similarityThreshold = 0.7 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const searchResults = await searchService.hybridSearch(query, {
      limit,
      similarityThreshold,
      includeMetadata: true,
    });

    res.json({
      query,
      results: searchResults,
      count: searchResults.length,
    });
  } catch (error) {
    console.error('[rag-service] Hybrid search error:', error);
    res.status(500).json({ error: 'Hybrid search failed', message: String(error) });
  }
});

// Retrieve with citations endpoint (main RAG endpoint)
app.post('/retrieve', async (req, res) => {
  try {
    const {
      query,
      response,
      limit = 5,
      similarityThreshold = 0.75,
      includeGrounding = true,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Search for relevant documents
    const searchResults = await searchService.search(query, {
      limit,
      similarityThreshold,
      includeMetadata: true,
    });

    // Create citations
    const cited = citationService.injectCitations(response || '', searchResults, {
      maxCitations: 5,
      includeExcerpts: true,
      format: 'numbered',
    });

    // Validate grounding if response provided
    let grounding;
    if (includeGrounding && response) {
      grounding = groundingValidator.validate(response, searchResults);
    }

    res.json({
      query,
      results: searchResults,
      citations: cited.citations,
      citationText: cited.citationText,
      response: cited.response,
      grounding,
    });
  } catch (error) {
    console.error('[rag-service] Retrieve error:', error);
    res.status(500).json({ error: 'Retrieve failed', message: String(error) });
  }
});

// Ingest GitHub repository
app.post('/ingest/github', async (req, res) => {
  try {
    const { owner, repo, branch, paths } = req.body;

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repo are required' });
    }

    const stats = await ingestionService.ingestGitHubRepository({
      owner,
      repo,
      branch,
      paths,
    });

    res.json({
      message: 'Ingestion complete',
      stats,
    });
  } catch (error) {
    console.error('[rag-service] Ingestion error:', error);
    res.status(500).json({ error: 'Ingestion failed', message: String(error) });
  }
});

// Trigger knowledge refresh
app.post('/refresh', async (req, res) => {
  try {
    const result = await refreshService.refresh();

    res.json({
      message: 'Knowledge refresh complete',
      result,
    });
  } catch (error) {
    console.error('[rag-service] Refresh error:', error);

    if (error instanceof Error && error.message === 'Refresh already in progress') {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: 'Refresh failed', message: String(error) });
  }
});

// Get refresh status
app.get('/refresh/status', (req, res) => {
  const status = refreshService.getStatus();
  const history = refreshService.getHistory(5);

  res.json({
    status,
    recentHistory: history,
  });
});

// Validate grounding
app.post('/validate', async (req, res) => {
  try {
    const { response, query, limit = 5 } = req.body;

    if (!response || !query) {
      return res.status(400).json({ error: 'Response and query are required' });
    }

    // Get relevant sources
    const searchResults = await searchService.search(query, { limit });

    // Validate grounding
    const validation = groundingValidator.validate(response, searchResults);

    res.json({
      validation,
      sources: searchResults,
    });
  } catch (error) {
    console.error('[rag-service] Validation error:', error);
    res.status(500).json({ error: 'Validation failed', message: String(error) });
  }
});

// Get statistics
app.get('/stats', async (req, res) => {
  try {
    const searchStats = await searchService.getSearchStats();
    const ingestionStats = await ingestionService.getIngestionStats();
    const refreshStatus = refreshService.getStatus();

    res.json({
      search: searchStats,
      ingestion: ingestionStats,
      refresh: refreshStatus,
    });
  } catch (error) {
    console.error('[rag-service] Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', message: String(error) });
  }
});

let server: any;

async function start() {
  try {
    // Connect to database with retry
    await connectWithRetry();
    const pool = getPool();

    // Initialize services
    embeddingService = new EmbeddingService(
      process.env.OPENAI_API_KEY,
      process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'
    );

    ingestionService = new DocumentIngestionService(
      pool,
      process.env.GITHUB_TOKEN,
      process.env.OPENAI_API_KEY,
      process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'
    );

    searchService = new VectorSearchService(pool, embeddingService);

    citationService = new CitationService();

    groundingValidator = new GroundingValidator();

    // Initialize knowledge refresh service
    const refreshConfig = {
      repositories: JSON.parse(process.env.REFRESH_REPOSITORIES || '[]'),
      intervalMinutes: parseInt(process.env.REFRESH_INTERVAL_MINUTES || '3', 10),
    };

    refreshService = new KnowledgeRefreshService(pool, ingestionService, refreshConfig);

    // Start automatic refresh if configured
    if (refreshConfig.repositories.length > 0) {
      console.log(`[rag-service] Starting knowledge refresh for ${refreshConfig.repositories.length} repositories`);
      refreshService.start();
    } else {
      console.log('[rag-service] No repositories configured for automatic refresh');
    }

    server = app.listen(PORT, () => {
      console.log(`[rag-service] Running on port ${PORT}`);
      console.log(`[rag-service] Health check: http://localhost:${PORT}/healthz`);
      console.log(`[rag-service] Embedding model: ${embeddingService.getModel()}`);
      console.log(`[rag-service] Embedding dimension: ${embeddingService.getDimension()}`);
    });
  } catch (error) {
    console.error('[rag-service] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[rag-service] Received ${signal}, starting graceful shutdown...`);
  isDraining = true;

  const shutdownTimeout = setTimeout(() => {
    console.error('[rag-service] Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Stop knowledge refresh
    if (refreshService) {
      refreshService.stop();
    }

    if (server) {
      server.close(() => {
        console.log('[rag-service] HTTP server closed');
      });
    }

    await closePool();
    clearTimeout(shutdownTimeout);
    console.log('[rag-service] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[rag-service] Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
