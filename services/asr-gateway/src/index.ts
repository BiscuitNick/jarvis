import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'asr-gateway',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis ASR Gateway',
    version: '1.0.0',
    description: 'Streams to cloud ASR services (Deepgram, Google, Azure)',
  });
});

// ASR transcription endpoint (placeholder)
app.post('/transcribe', (req, res) => {
  res.json({
    message: 'ASR transcription endpoint',
    providers: ['deepgram', 'google', 'azure'],
    status: 'implementation pending',
  });
});

// Streaming endpoint (placeholder)
app.post('/transcribe/stream', (req, res) => {
  res.json({ message: 'Streaming ASR endpoint - implementation pending' });
});

app.listen(PORT, () => {
  console.log(`[asr-gateway] Running on port ${PORT}`);
  console.log(`[asr-gateway] Health check: http://localhost:${PORT}/healthz`);
});
