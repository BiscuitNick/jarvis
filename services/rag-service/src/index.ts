import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'rag-service',
    timestamp: new Date().toISOString(),
    database: 'not connected', // Will update when DB is ready
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis RAG Service',
    version: '1.0.0',
    description: 'Postgres + pgvector retrieval with citations',
  });
});

// Vector search endpoint (placeholder)
app.post('/search', (req, res) => {
  res.json({
    message: 'Vector search endpoint',
    status: 'implementation pending',
    note: 'Requires Postgres with pgvector extension',
  });
});

// Index document endpoint (placeholder)
app.post('/index', (req, res) => {
  res.json({ message: 'Document indexing endpoint - implementation pending' });
});

app.listen(PORT, () => {
  console.log(`[rag-service] Running on port ${PORT}`);
  console.log(`[rag-service] Health check: http://localhost:${PORT}/healthz`);
});
