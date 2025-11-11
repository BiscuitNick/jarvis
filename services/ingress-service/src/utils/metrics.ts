import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({
  register,
  prefix: 'jarvis_ingress_',
});

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Session counters
export const sessionsTotal = new Counter({
  name: 'ingress_sessions_total',
  help: 'Total number of sessions created',
  labelNames: ['status'],
  registers: [register],
});

export const sessionsActive = new Gauge({
  name: 'ingress_sessions_active',
  help: 'Number of currently active sessions',
  registers: [register],
});

// WebRTC connection metrics
export const webrtcConnectionsTotal = new Counter({
  name: 'ingress_webrtc_connections_total',
  help: 'Total number of WebRTC connections',
  labelNames: ['status'],
  registers: [register],
});

export const webrtcConnectionsActive = new Gauge({
  name: 'ingress_webrtc_connections_active',
  help: 'Number of currently active WebRTC connections',
  registers: [register],
});

// Audio metrics
export const audioChunksReceived = new Counter({
  name: 'ingress_audio_chunks_received_total',
  help: 'Total number of audio chunks received',
  labelNames: ['session_id'],
  registers: [register],
});

export const audioBytesReceived = new Counter({
  name: 'ingress_audio_bytes_received_total',
  help: 'Total bytes of audio data received',
  labelNames: ['session_id'],
  registers: [register],
});

// Authentication metrics
export const authAttemptsTotal = new Counter({
  name: 'ingress_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['status', 'method'],
  registers: [register],
});

// Error metrics
export const errorsTotal = new Counter({
  name: 'ingress_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'endpoint'],
  registers: [register],
});
