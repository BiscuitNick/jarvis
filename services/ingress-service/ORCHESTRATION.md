# Real-Time Pipeline Orchestration

This document describes the implementation of Task 9: Real-time coordination and streaming orchestration for the Jarvis voice assistant.

## Overview

The orchestration layer coordinates real-time data flow between all services to achieve <500ms end-to-end latency:

```
iOS Client → Ingress → ASR Gateway → LLM Router → RAG Service → TTS Service → Client
```

## Architecture Components

### 1. PipelineOrchestrator

**Location:** `src/orchestration/PipelineOrchestrator.ts`

The central coordinator that manages the entire voice interaction pipeline.

**Key Features:**
- Manages WebSocket connections to ASR Gateway
- Streams LLM responses with RAG integration
- Coordinates TTS synthesis and audio playback
- Handles pipeline lifecycle (start, process, interrupt, end)
- Integrates circuit breakers for graceful degradation

**API:**
```typescript
// Start a new pipeline
const pipeline = await orchestrator.startPipeline(sessionId, userId, callbacks);

// Process audio chunk
await orchestrator.processAudioChunk(pipelineId, audioData);

// Interrupt pipeline (user barge-in)
await orchestrator.interruptPipeline(pipelineId);

// End pipeline
await orchestrator.endPipeline(pipelineId);
```

### 2. PipelineState

**Location:** `src/orchestration/PipelineState.ts`

Tracks the state of a pipeline through its lifecycle.

**Pipeline Stages:**
- `IDLE` - Initial state
- `AUDIO_CAPTURE` - Receiving audio from client
- `ASR_PROCESSING` - Transcribing speech
- `LLM_PROCESSING` - Generating response
- `RAG_RETRIEVAL` - Retrieving context
- `TTS_SYNTHESIS` - Generating speech
- `AUDIO_PLAYBACK` - Streaming audio to client
- `COMPLETED` - Successfully finished
- `ERROR` - Failed with error
- `INTERRUPTED` - User interrupted

**Metrics Tracked:**
- Stage-by-stage latency
- First token latency (target: <500ms)
- Total end-to-end latency (target: <2000ms)
- ASR partial count
- LLM token count
- TTS chunk count

### 3. InterruptionHandler

**Location:** `src/orchestration/InterruptionHandler.ts`

Manages barge-in scenarios where the user starts speaking while the assistant is responding.

**Features:**
- Voice Activity Detection (VAD) with <150ms reaction time
- Manual interruption support
- Cooldown periods to prevent false positives
- Interruption analytics and metrics

**Configuration:**
```typescript
{
  vadThreshold: 0.7,        // Confidence threshold (0-1)
  vadDurationMs: 150,       // Minimum duration to trigger
  cooldownMs: 1000          // Cooldown after interruption
}
```

### 4. LatencyMonitor

**Location:** `src/orchestration/LatencyMonitor.ts`

Monitors and tracks latency across the entire pipeline with distributed tracing.

**Thresholds:**
- First Token: 500ms (critical SLA)
- Audio to ASR: 50ms
- ASR to LLM: 100ms
- LLM First Token: 300ms
- LLM to TTS: 50ms
- TTS to Client: 100ms
- End-to-End: 2000ms

**Metrics:**
- Prometheus histograms for latency tracking
- Violation counters for SLA breaches
- Real-time alerting for threshold violations

### 5. CircuitBreaker

**Location:** `src/orchestration/CircuitBreaker.ts`

Implements circuit breaker pattern for graceful degradation when services fail.

**States:**
- `CLOSED` - Normal operation
- `OPEN` - Service failing, requests rejected
- `HALF_OPEN` - Testing if service recovered

**Configuration:**
```typescript
{
  failureThreshold: 5,      // Failures before opening
  successThreshold: 2,      // Successes to close again
  timeout: 30000,           // Time before retry (ms)
  rollingWindow: 60000      // Window for failure counting (ms)
}
```

**Fallback Strategies:**
- LLM Router: Return cached or error message
- TTS Service: Skip audio synthesis, return text only
- ASR Gateway: (No fallback - critical service)

### 6. StreamingHandler

**Location:** `src/routes/streaming.ts`

WebSocket handler for bidirectional real-time streaming.

**Protocol:**

Client connects to: `ws://ingress:3000/stream?token=<jwt>&sessionId=<optional>`

**Control Messages (JSON):**
```json
// Start pipeline
{ "type": "start" }

// Send VAD signal
{ "type": "vad", "confidence": 0.85, "duration": 200 }

// Interrupt
{ "type": "interrupt" }

// Stop
{ "type": "stop" }

// Ping/Pong
{ "type": "ping" }
```

**Server Messages:**
```json
// Partial transcript
{ "type": "transcript", "isFinal": false, "transcript": "Hello", "timestamp": 1234567890 }

// Final transcript
{ "type": "transcript", "isFinal": true, "transcript": "Hello world", "timestamp": 1234567890 }

// LLM response chunk
{ "type": "llm-response", "chunk": "I heard ", "timestamp": 1234567890 }

// Pipeline complete
{ "type": "complete", "metrics": {...}, "sources": [...], "timestamp": 1234567890 }

// Error
{ "type": "error", "error": "Service unavailable", "timestamp": 1234567890 }
```

**Binary Data:**
- Client → Server: Raw PCM audio chunks (16kHz, mono, 16-bit)
- Server → Client: Synthesized audio from TTS

## API Endpoints

### REST API

#### Start Pipeline
```http
POST /api/orchestration/start
Content-Type: application/json

{
  "sessionId": "session-123",
  "userId": "user-456"
}
```

#### Get Pipeline Status
```http
GET /api/orchestration/pipeline/:pipelineId
```

#### Interrupt Pipeline
```http
POST /api/orchestration/interrupt/:pipelineId
```

#### End Pipeline
```http
POST /api/orchestration/end/:pipelineId
```

#### Get Active Pipelines
```http
GET /api/orchestration/pipelines
```

#### Latency Statistics
```http
GET /api/orchestration/latency/stats
```

#### Interruption Statistics
```http
GET /api/orchestration/interruptions/:sessionId
```

#### Health Check
```http
GET /api/orchestration/health
```

### WebSocket API

Connect to: `ws://ingress:3000/stream?token=<jwt>`

See StreamingHandler protocol above for message formats.

## Configuration

Environment variables for the ingress service:

```bash
# Service URLs
ASR_GATEWAY_URL=http://asr-gateway:3001
LLM_ROUTER_URL=http://llm-router:3003
RAG_SERVICE_URL=http://rag-service:3002
TTS_SERVICE_URL=http://tts-service:3004

# Latency thresholds (ms)
FIRST_TOKEN_LATENCY_MS=500
END_TO_END_LATENCY_MS=2000
MAX_LATENCY_MS=10000

# Interruption handling
VAD_THRESHOLD=0.7
VAD_DURATION_MS=150
INTERRUPTION_COOLDOWN_MS=1000
```

## Monitoring

### Prometheus Metrics

**Pipeline Latency:**
```
jarvis_pipeline_latency_seconds{session_id, status}
```

**First Token Latency:**
```
jarvis_first_token_latency_seconds{session_id}
```

**Stage Latency:**
```
jarvis_stage_latency_seconds{stage, session_id}
```

**Latency Violations:**
```
jarvis_latency_violations_total{stage, session_id}
```

**Active Pipelines:**
```
jarvis_active_pipelines
```

**HTTP Request Duration:**
```
http_request_duration_seconds{method, route, status_code, service}
```

### Logging

All logs include correlation IDs for distributed tracing:

```json
{
  "level": "info",
  "pipelineId": "pipeline-123",
  "sessionId": "session-456",
  "stage": "llm_processing",
  "latency": 345,
  "msg": "LLM response received"
}
```

## Performance Targets

| Metric | Target | Description |
|--------|--------|-------------|
| First Token Latency | <500ms | Time until first response token |
| End-to-End Latency | <2s | Complete interaction cycle |
| Audio to ASR | <50ms | Audio forwarding delay |
| ASR to LLM | <100ms | Transcript processing |
| LLM First Token | <300ms | LLM response start |
| LLM to TTS | <50ms | TTS initiation |
| TTS to Client | <100ms | Audio streaming start |
| Interruption Reaction | <150ms | Barge-in detection |

## Error Handling

### Circuit Breaker Behavior

**LLM Router Fails:**
- Returns fallback message: "I'm experiencing technical difficulties..."
- Circuit opens after 5 failures
- Retries after 30 seconds

**TTS Service Fails:**
- Skips audio synthesis
- Returns text-only response
- Circuit opens after 5 failures

**ASR Gateway Fails:**
- Pipeline fails immediately (no fallback)
- WebSocket reconnection attempted
- Error reported to client

### Graceful Degradation

1. **Service Unavailable:** Circuit breaker triggers fallback
2. **Timeout:** Request aborted, error returned
3. **Network Error:** Automatic retry with exponential backoff
4. **Resource Exhaustion:** Rate limiting applied

## Testing

### Unit Tests
```bash
cd services/ingress-service
npm test
```

### Integration Tests
```bash
# Test WebSocket streaming
node test/integration/streaming-test.js

# Test interruption handling
node test/integration/interruption-test.js

# Load testing
npm run load-test
```

### Manual Testing

**Test WebSocket Connection:**
```bash
wscat -c "ws://localhost:3000/stream?token=<jwt>"

# Send control message
> {"type":"start"}

# Send binary audio (from file)
> --binary audio.pcm
```

## Development

### Adding New Pipeline Stages

1. Add stage to `PipelineStage` enum in `PipelineState.ts`
2. Implement stage logic in `PipelineOrchestrator.ts`
3. Add latency tracking in `LatencyMonitor.ts`
4. Update metrics and logging

### Adding Circuit Breakers

```typescript
const breaker = circuitBreakers.getBreaker('my-service', {
  failureThreshold: 5,
  timeout: 30000,
});

const result = await breaker.execute(
  async () => {
    // Primary operation
  },
  async () => {
    // Fallback operation (optional)
  }
);
```

## Deployment

### Docker Compose

Orchestration is automatically enabled when starting services:

```bash
cd infrastructure/docker
docker-compose up -d ingress
```

### Health Checks

```bash
# Check ingress health
curl http://localhost:3000/healthz

# Check orchestration health
curl http://localhost:3000/api/orchestration/health

# Check circuit breakers
curl http://localhost:3000/api/orchestration/latency/stats
```

## Troubleshooting

### High Latency

1. Check Prometheus metrics for bottleneck stage
2. Review latency violations in logs
3. Check circuit breaker status
4. Verify network connectivity between services

### Interruptions Not Working

1. Verify VAD_THRESHOLD and VAD_DURATION_MS settings
2. Check cooldown period (INTERRUPTION_COOLDOWN_MS)
3. Review interruption statistics endpoint
4. Test with manual interrupt endpoint

### Circuit Breakers Opening

1. Check downstream service health
2. Review service logs for errors
3. Adjust failure threshold if needed
4. Verify timeout settings

## Future Enhancements

1. **Adaptive Latency Tuning:** Automatically adjust thresholds based on observed performance
2. **Caching Layer:** Cache frequent queries and responses
3. **Request Prioritization:** Priority queue for concurrent requests
4. **Multi-Model Routing:** Route to different LLMs based on intent
5. **Advanced Analytics:** ML-based anomaly detection

## References

- [Task Master Task 9](/.taskmaster/tasks/task-9.md)
- [Pipeline Architecture](./docs/architecture.md)
- [Latency Optimization Guide](./docs/latency-optimization.md)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
