import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ingress-service',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis Ingress Service',
    version: '1.0.0',
    description: 'Handles audio chunks and session control',
  });
});

// WebSocket audio ingestion endpoint (placeholder)
app.post('/audio/ingest', (req, res) => {
  res.json({ message: 'Audio ingestion endpoint - WebSocket implementation pending' });
});

// Session management
app.post('/session/create', (req, res) => {
  const sessionId = `session_${Date.now()}`;
  res.json({ sessionId, status: 'created' });
});

app.listen(PORT, () => {
  console.log(`[ingress-service] Running on port ${PORT}`);
  console.log(`[ingress-service] Health check: http://localhost:${PORT}/healthz`);
});
