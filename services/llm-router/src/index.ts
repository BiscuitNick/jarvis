import express from 'express';
import { getPool, connectWithRetry, closePool } from './db/pool';
import { ProviderManager } from './ProviderManager';
import { RAGClient } from './rag-client';
import { buildSystemPrompt, injectCitations, validateGrounding } from './intent';
import { CompletionRequest, IntentType } from './types';

const app = express();
const PORT = process.env.PORT || 8080;

let isDraining = false;
let providerManager: ProviderManager;
let ragClient: RAGClient;

app.use(express.json());

// Health check endpoint
app.get('/healthz', async (req, res) => {
  if (isDraining) {
    return res.status(503).json({
      status: 'draining',
      service: 'llm-router',
      timestamp: new Date().toISOString(),
    });
  }

  let dbStatus = 'down';
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbStatus = 'up';
  } catch (error) {
    console.error('[llm-router] Health check DB error:', error);
  }

  // Check RAG service health
  let ragStatus = 'down';
  try {
    const isHealthy = await ragClient.healthCheck();
    ragStatus = isHealthy ? 'up' : 'down';
  } catch (error) {
    console.error('[llm-router] RAG health check error:', error);
  }

  const statusCode = dbStatus === 'up' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'up' ? 'healthy' : 'unhealthy',
    service: 'llm-router',
    db: dbStatus,
    rag: ragStatus,
    providers: providerManager.getHealthStatus(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis LLM Router',
    version: '1.0.0',
    description: 'Routes to frontier models (OpenAI, Anthropic, Gemini) with RAG integration',
    providers: providerManager.getHealthStatus(),
  });
});

// LLM completion endpoint
app.post('/complete', async (req, res) => {
  try {
    const { messages, temperature, maxTokens, intent: userIntent } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    // Get the user's query (last message)
    const userQuery = messages[messages.length - 1]?.content || '';

    // Use provided intent or default to conversational (caller should classify)
    let intent = userIntent || IntentType.CASUAL;
    console.log(`[llm-router] Intent: ${intent} (${userIntent ? 'provided' : 'defaulted'})`);

    let context;

    // For critical intents, retrieve context from RAG
    if (intent === IntentType.CRITICAL) {
      console.log('[llm-router] Retrieving context from RAG service...');
      context = await ragClient.retrieve(userQuery, 5);
      console.log(`[llm-router] Retrieved ${context.documents.length} documents`);

      // Fallback: If no documents found, switch to conversational mode
      if (!context.documents || context.documents.length === 0) {
        console.log('[llm-router] No RAG documents found, falling back to conversational mode');
        intent = IntentType.CASUAL;
        context = undefined;
      }
    }

    // Build system prompt based on intent and context
    const systemPrompt = buildSystemPrompt(intent, context);

    // Prepare request
    const request: CompletionRequest = {
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 1000,
      stream: false,
      intent,
      context,
    };

    // Complete with provider manager (automatic fallback)
    const startTime = Date.now();
    const response = await providerManager.complete(request);
    const latency = Date.now() - startTime;

    // Validate grounding for critical intents
    let groundingValidation;
    if (intent === IntentType.CRITICAL && context) {
      groundingValidation = validateGrounding(response.content, context);
      console.log(
        `[llm-router] Grounding validation: ${groundingValidation.isGrounded} (confidence: ${groundingValidation.confidence.toFixed(2)})`
      );
    }

    // Inject citations for critical intents
    let finalContent = response.content;
    if (intent === IntentType.CRITICAL && context) {
      finalContent = injectCitations(response.content, context);
    }

    res.json({
      content: finalContent,
      provider: response.provider,
      model: response.model,
      intent,
      latency,
      usage: response.usage,
      grounding: groundingValidation,
      sources: context?.documents.map((d) => ({
        url: d.source,
        title: d.metadata?.title || d.source,
        excerpt: d.content.substring(0, 200) + (d.content.length > 200 ? '...' : ''),
        relevance: d.relevance
      })) || [],
    });
  } catch (error: any) {
    console.error('[llm-router] Completion error:', error);
    res.status(500).json({
      error: 'LLM completion failed',
      message: error.message,
    });
  }
});

// Streaming completion endpoint
app.post('/complete/stream', async (req, res) => {
  try {
    const { messages, temperature, maxTokens, intent: userIntent } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get the user's query
    const userQuery = messages[messages.length - 1]?.content || '';

    // Use provided intent or default to conversational (caller should classify)
    let intent = userIntent || IntentType.CASUAL;
    console.log(`[llm-router] Stream intent: ${intent} (${userIntent ? 'provided' : 'defaulted'})`);

    let context: any = undefined;

    // For critical intents, retrieve context
    if (intent === IntentType.CRITICAL) {
      console.log('[llm-router] Retrieving context for stream...');
      context = await ragClient.retrieve(userQuery, 5);
      console.log(`[llm-router] Retrieved ${context.documents.length} documents`);

      // Fallback: If no documents found, switch to conversational mode
      if (!context.documents || context.documents.length === 0) {
        console.log('[llm-router] No RAG documents found, falling back to conversational mode');
        intent = IntentType.CASUAL;
        context = undefined;
      }
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(intent, context);

    // Prepare request
    const request: CompletionRequest = {
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 1000,
      stream: true,
      intent,
      context,
    };

    const startTime = Date.now();
    let firstChunkTime: number | null = null;
    let fullResponse = '';

    // Stream completion with provider manager
    await providerManager.streamComplete(request, (chunk) => {
      if (firstChunkTime === null && chunk.content) {
        firstChunkTime = Date.now();
        const timeToFirstToken = firstChunkTime - startTime;
        console.log(`[llm-router] Time to first token: ${timeToFirstToken}ms`);
      }

      if (chunk.content) {
        fullResponse += chunk.content;
      }

      // Send SSE event
      const event = {
        content: chunk.content,
        done: chunk.done,
        provider: chunk.provider,
        model: chunk.model,
      };

      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // If done, send sources and grounding info
      if (chunk.done) {
        const latency = Date.now() - startTime;

        // Validate grounding
        let groundingValidation;
        if (intent === IntentType.CRITICAL && context) {
          groundingValidation = validateGrounding(fullResponse, context);
        }

        // Send final metadata
        const metadata = {
          done: true,
          latency,
          intent,
          sources: context?.documents.map((d: any) => ({
            url: d.source,
            title: d.metadata?.title || d.source,
            excerpt: d.content.substring(0, 200) + (d.content.length > 200 ? '...' : ''),
            relevance: d.relevance
          })) || [],
          grounding: groundingValidation,
          citations:
            intent === IntentType.CRITICAL && context
              ? context.documents.filter((d: any) => d.relevance > 0.5).map((d: any) => d.source)
              : [],
        };

        res.write(`data: ${JSON.stringify(metadata)}\n\n`);
        res.end();
      }
    });
  } catch (error: any) {
    console.error('[llm-router] Stream error:', error);
    res.write(
      `data: ${JSON.stringify({ error: 'Stream failed', message: error.message })}\n\n`
    );
    res.end();
  }
});

// Provider health status endpoint
app.get('/providers/health', (req, res) => {
  res.json({
    providers: providerManager.getHealthStatus(),
    timestamp: new Date().toISOString(),
  });
});

// Intent classification test endpoint (deprecated - use ingress-service LLM classification)
app.post('/classify', (req, res) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Intent classification should be done by the ingress-service using LLM-based classification',
    suggestion: 'Call POST /api/chat/message instead',
  });
});

let server: any;

async function start() {
  try {
    // Connect to database with retry
    await connectWithRetry();

    // Initialize provider manager
    providerManager = new ProviderManager();

    // Initialize RAG client
    ragClient = new RAGClient();

    server = app.listen(PORT, () => {
      console.log(`[llm-router] Running on port ${PORT}`);
      console.log(`[llm-router] Health check: http://localhost:${PORT}/healthz`);
      console.log(`[llm-router] Providers: ${providerManager.getHealthStatus().map((p) => p.name).join(', ')}`);
    });
  } catch (error) {
    console.error('[llm-router] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[llm-router] Received ${signal}, starting graceful shutdown...`);
  isDraining = true;

  const shutdownTimeout = setTimeout(() => {
    console.error('[llm-router] Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    if (server) {
      server.close(() => {
        console.log('[llm-router] HTTP server closed');
      });
    }

    // Cleanup provider manager
    if (providerManager) {
      providerManager.destroy();
    }

    await closePool();
    clearTimeout(shutdownTimeout);
    console.log('[llm-router] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[llm-router] Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
