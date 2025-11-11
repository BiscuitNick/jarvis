# Jarvis Ingress Service

The Ingress Service is the main entry point for the Jarvis voice assistant system. It handles WebRTC audio streaming, session management, and authentication for all client connections.

## Features

### 1. WebRTC Audio Streaming
- **MediaSoup Integration**: Uses mediasoup for real-time WebRTC media streaming
- **Audio Data Channels**: Receives audio chunks via WebRTC data channels
- **Codec Support**: Opus audio codec with optimized settings for voice
- **NAT Traversal**: Built-in STUN/TURN support for connectivity

### 2. Session Management
- **Session Lifecycle**: Create, update, and manage voice assistant sessions
- **State Persistence**: Sessions stored in PostgreSQL with Redis caching
- **Context Management**: Maintains conversation context and user preferences
- **Automatic Cleanup**: Expired sessions are automatically cleaned up

### 3. Authentication
- **Device Tokens**: JWT-based authentication with device identifiers
- **Token Refresh**: Automatic token refresh mechanism
- **Rate Limiting**: Per-user and per-endpoint rate limiting
- **Security**: Secure token storage and validation

### 4. Dual Protocol Support
- **REST API**: HTTP/JSON endpoints for session and WebRTC control
- **gRPC API**: High-performance gRPC endpoints for real-time operations

### 5. Observability
- **Structured Logging**: JSON logging with correlation IDs using Pino
- **Prometheus Metrics**: Comprehensive metrics for monitoring
- **Health Checks**: Database and service health monitoring
- **Distributed Tracing**: Request tracking across services

## Architecture

```
┌─────────────┐
│   Client    │
│   (iOS)     │
└──────┬──────┘
       │
       │ WebRTC + gRPC/REST
       │
┌──────▼──────────────────────┐
│    Ingress Service          │
│  ┌────────────────────────┐ │
│  │  WebRTC Media Server   │ │
│  │    (mediasoup)         │ │
│  └───────┬────────────────┘ │
│          │                   │
│  ┌───────▼────────────────┐ │
│  │  Session Manager       │ │
│  └───────┬────────────────┘ │
│          │                   │
│  ┌───────▼────────────────┐ │
│  │  Auth & Rate Limiting  │ │
│  └────────────────────────┘ │
└─────────┬───────────────────┘
          │
    ┌─────┴─────┬──────────┐
    │           │          │
    ▼           ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Postgres│ │ Redis  │ │  ASR   │
│        │ │        │ │Gateway │
└────────┘ └────────┘ └────────┘
```

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register
Register or authenticate a device with a device identifier.

**Request:**
```json
{
  "deviceIdentifier": "unique-device-id"
}
```

**Response:**
```json
{
  "userId": "uuid",
  "deviceToken": "device-token",
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "expiresIn": "7d"
}
```

#### POST /api/auth/refresh
Refresh an access token using a refresh token.

**Request:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

**Response:**
```json
{
  "accessToken": "new-jwt-access-token",
  "expiresIn": "7d"
}
```

#### POST /api/auth/revoke
Revoke a device token (logout). Requires authentication.

**Response:**
```json
{
  "success": true,
  "message": "Device token revoked"
}
```

### Session Endpoints (Require Authentication)

#### POST /api/session/create
Create a new voice assistant session.

**Request:**
```json
{
  "audioConfig": {
    "sampleRate": 16000,
    "channels": 1,
    "bitDepth": 16,
    "codec": "opus"
  },
  "voiceConfig": {
    "voiceId": "default",
    "speed": 1.0,
    "pitch": 1.0,
    "language": "en-US"
  },
  "metadata": {
    "clientVersion": "1.0.0"
  }
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "status": "pending",
  "expiresAt": "2024-01-01T00:00:00.000Z"
}
```

#### GET /api/session/:sessionId
Get session status and details.

**Response:**
```json
{
  "sessionId": "uuid",
  "status": "active",
  "contextData": {...},
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "expiresAt": "2024-01-01T01:00:00.000Z"
}
```

#### DELETE /api/session/:sessionId
End a session and clean up resources.

**Response:**
```json
{
  "success": true,
  "message": "Session ended successfully"
}
```

### WebRTC Endpoints (Require Authentication)

#### GET /api/webrtc/capabilities
Get router RTP capabilities for WebRTC negotiation.

**Response:**
```json
{
  "capabilities": {
    "codecs": [...],
    "headerExtensions": [...]
  }
}
```

#### POST /api/webrtc/transport/create
Create a WebRTC transport for a session.

**Request:**
```json
{
  "sessionId": "uuid"
}
```

**Response:**
```json
{
  "transportOptions": {
    "id": "transport-id",
    "iceParameters": {...},
    "iceCandidates": [...],
    "dtlsParameters": {...}
  }
}
```

#### POST /api/webrtc/transport/connect
Connect a WebRTC transport with DTLS parameters.

**Request:**
```json
{
  "sessionId": "uuid",
  "dtlsParameters": {...}
}
```

**Response:**
```json
{
  "success": true
}
```

#### POST /api/webrtc/producer/create
Create an audio producer for streaming.

**Request:**
```json
{
  "sessionId": "uuid",
  "kind": "audio",
  "rtpParameters": {...}
}
```

**Response:**
```json
{
  "producerId": "producer-id"
}
```

## gRPC Service

The service also exposes a gRPC API defined in `proto/session.proto`:

- `StartSession`: Start a new session
- `StopSession`: Stop an active session
- `GetSessionStatus`: Get session status
- `UpdateSessionConfig`: Update session configuration
- `ListSessions`: List user sessions

## Environment Variables

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing
- `POSTGRES_PASSWORD`: Database password (from .env)

### Optional
- `PORT`: HTTP server port (default: 3000)
- `GRPC_PORT`: gRPC server port (default: 50051)
- `LOG_LEVEL`: Logging level (default: info)
- `NODE_ENV`: Environment (development/production)

### Database Connection Pool
- `PGPOOL_MAX_INGRESS`: Max connections (default: 5)
- `PG_CONN_TIMEOUT_MS`: Connection timeout (default: 2000)
- `PG_IDLE_TIMEOUT_MS`: Idle timeout (default: 10000)
- `PG_CONNECT_RETRIES`: Retry attempts (default: 3)

### JWT Configuration
- `JWT_EXPIRES_IN`: Access token expiry (default: 7d)
- `REFRESH_TOKEN_EXPIRES_IN`: Refresh token expiry (default: 30d)

### WebRTC/MediaSoup
- `RTC_MIN_PORT`: Minimum RTC port (default: 10000)
- `RTC_MAX_PORT`: Maximum RTC port (default: 10100)
- `MEDIASOUP_LISTEN_IP`: Listen IP (default: 0.0.0.0)
- `MEDIASOUP_ANNOUNCED_IP`: Announced IP for NAT (optional)

### Integration
- `REDIS_URL`: Redis connection string
- `ASR_GATEWAY_URL`: ASR Gateway service URL

## Metrics

The service exposes Prometheus metrics at `/metrics`:

### HTTP Metrics
- `http_request_duration_seconds`: HTTP request latency
- Request count by method, route, and status code

### Session Metrics
- `ingress_sessions_total`: Total sessions created
- `ingress_sessions_active`: Currently active sessions

### WebRTC Metrics
- `ingress_webrtc_connections_total`: Total WebRTC connections
- `ingress_webrtc_connections_active`: Active connections
- `ingress_audio_chunks_received_total`: Audio chunks received
- `ingress_audio_bytes_received_total`: Audio bytes received

### Authentication Metrics
- `ingress_auth_attempts_total`: Authentication attempts by status

### Error Metrics
- `ingress_errors_total`: Total errors by type and endpoint

## Development

### Build
```bash
npm install
npm run build
```

### Run Locally
```bash
npm run dev
```

### Docker Build
```bash
docker build -t jarvis-ingress .
```

### Testing
```bash
# Run with Docker Compose
cd infrastructure/docker
docker-compose up ingress
```

## Production Deployment

### Docker Compose
The service is configured in `infrastructure/docker/docker-compose.yml` with:
- Health checks
- Graceful shutdown (30s grace period)
- Resource limits
- Auto-restart policies
- Network isolation

### Ports
- **3000**: HTTP API
- **50051**: gRPC
- **3478**: TURN/STUN (TCP/UDP)
- **10000-10100**: WebRTC media (UDP)

### Scaling Notes
- Single instance per host (WebRTC requires session affinity)
- For multi-instance: use Lightsail Load Balancer with sticky sessions
- Monitor with cAdvisor or Prometheus
- Logs available in JSON format for aggregation

## Security

- JWT-based authentication with refresh tokens
- Rate limiting on all endpoints
- CORS protection
- Input validation
- Secure headers
- Database connection pooling
- Non-root container user

## Troubleshooting

### WebRTC Connection Issues
- Check `MEDIASOUP_ANNOUNCED_IP` is set correctly for NAT
- Verify UDP ports 10000-10100 are open
- Ensure STUN/TURN ports (3478) are accessible

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is healthy
- Review connection pool settings

### High Memory Usage
- MediaSoup workers consume memory per session
- Monitor `ingress_sessions_active` metric
- Consider scaling horizontally for >10 concurrent users

## License

Part of the Jarvis voice assistant project.
