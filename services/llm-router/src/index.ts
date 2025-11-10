import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'llm-router',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis LLM Router',
    version: '1.0.0',
    description: 'Routes to frontier models (OpenAI, Anthropic)',
  });
});

// LLM completion endpoint (placeholder)
app.post('/complete', (req, res) => {
  res.json({
    message: 'LLM completion endpoint',
    providers: ['openai', 'anthropic', 'gemini'],
    status: 'implementation pending',
  });
});

// Streaming completion endpoint (placeholder)
app.post('/complete/stream', (req, res) => {
  res.json({ message: 'Streaming LLM endpoint - implementation pending' });
});

app.listen(PORT, () => {
  console.log(`[llm-router] Running on port ${PORT}`);
  console.log(`[llm-router] Health check: http://localhost:${PORT}/healthz`);
});
