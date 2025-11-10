import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'tts-service',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Jarvis TTS Service',
    version: '1.0.0',
    description: 'Streams cloud neural TTS audio',
  });
});

// Text-to-speech endpoint (placeholder)
app.post('/synthesize', (req, res) => {
  res.json({
    message: 'TTS synthesis endpoint',
    providers: ['google', 'azure', 'elevenlabs'],
    status: 'implementation pending',
  });
});

// Streaming TTS endpoint (placeholder)
app.post('/synthesize/stream', (req, res) => {
  res.json({ message: 'Streaming TTS endpoint - implementation pending' });
});

app.listen(PORT, () => {
  console.log(`[tts-service] Running on port ${PORT}`);
  console.log(`[tts-service] Health check: http://localhost:${PORT}/healthz`);
});
