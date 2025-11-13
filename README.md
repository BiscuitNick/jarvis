# Jarvis - Real-Time Voice AI Assistant

A production-ready, real-time voice assistant platform with retrieval-augmented generation (RAG) capabilities. Jarvis enables natural conversational interactions with frontier LLMs, featuring sub-500ms response times, automatic knowledge base ingestion, and intelligent interruption handling.

## Key Features

### Voice Processing
- **Wake Word Detection** - On-device "Jarvis" activation with <100ms latency
- **Real-Time Streaming** - End-to-end audio pipeline (ASR → LLM → TTS)
- **Intelligent Interruption** - Voice Activity Detection with <150ms reaction time
- **Multi-Modal Recognition** - Privacy, standard, and professional modes
- **Low Latency** - First token <500ms, end-to-end <2000ms

### Knowledge & Context
- **Retrieval-Augmented Generation (RAG)** - Automatic GitHub repository ingestion and semantic search
- **Citation Grounding** - Responses include source references with validation
- **Conversation History** - Persistent context across sessions
- **Intent Classification** - LLM-based dynamic request routing

### Architecture
- **Microservices** - 5 specialized services with independent scaling
- **WebRTC Streaming** - Low-latency audio transmission
- **gRPC Session Management** - Efficient session control
- **Multi-Provider Support** - Pluggable ASR, LLM, and TTS providers

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ iOS Client (Swift/SwiftUI)                             │
│ • Wake word detection  • VAD  • WebRTC  • gRPC         │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │ Nginx (80/443)      │
        │ SSL/TLS + Routing   │
        └──────────┬──────────┘
                   │
     ┌─────────────┼─────────────┬──────────┬─────────┐
     │             │             │          │         │
┌────▼───┐   ┌────▼───┐   ┌────▼───┐  ┌──▼───┐ ┌───▼──┐
│Ingress │   │ASR     │   │LLM     │  │RAG   │ │TTS   │
│Service │   │Gateway │   │Router  │  │Svc   │ │Svc   │
│:3000   │   │:3001   │   │:3003   │  │:3002 │ │:3004 │
└────┬───┘   └────────┘   └────┬───┘  └──┬───┘ └──┬───┘
     │                          │        │      │
     ├─────────────────────────┘        │      │
     │                                  │      │
     └──────────┬───────────────────────┴──────┴─┐
                │                                │
          ┌─────▼─────────┐        ┌────────────▼──┐
          │PostgreSQL 15  │        │    Redis 7    │
          │+ pgvector     │        │   (cache)     │
          └───────────────┘        └───────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | iOS (Swift/SwiftUI), WebRTC |
| **Backend** | Node.js 18+, TypeScript, Express |
| **Database** | PostgreSQL 15 + pgvector |
| **Cache** | Redis 7 |
| **Infrastructure** | Docker Compose, AWS Lightsail |
| **Monitoring** | Prometheus + Grafana |
| **CI/CD** | GitHub Actions |
| **Protocols** | gRPC, WebSocket, WebRTC |

## Services

### Ingress Service (Port 3000)
**Purpose:** Audio ingestion, session management, and pipeline orchestration

- WebRTC + WebSocket audio streaming
- gRPC session control (start, stop, status)
- Pipeline coordination across all services
- Real-time interruption handling
- JWT authentication
- Prometheus metrics

**Dependencies:** PostgreSQL, Redis

### ASR Gateway (Port 3001)
**Purpose:** Speech-to-text transcription

**Supported Providers:**
- AWS Transcribe (primary)
- Deepgram
- Google Cloud Speech-to-Text
- Azure Speech Services

**Features:**
- Streaming transcription via WebSocket
- Multi-provider abstraction
- Partial and final results

### LLM Router (Port 3003)
**Purpose:** Language model integration and response generation

**Supported Models:**
- OpenAI GPT-4o
- Anthropic Claude

**Features:**
- Intent classification (LLM-based)
- Streaming response generation
- Conversation context awareness
- RAG integration for knowledge augmentation
- Multi-step reasoning support

### RAG Service (Port 3002)
**Purpose:** Knowledge base management and semantic search

**Features:**
- **GitHub Repository Ingestion** - Automatic code/docs indexing
- **Vector Search** - pgvector-powered similarity search
- **Document Chunking** - Semantic text segmentation
- **Citation Injection** - Source references in responses
- **Grounding Validation** - Verify response accuracy
- **Automatic Refresh** - Background knowledge updates

**Endpoints:**
- `POST /search` - Semantic vector search
- `POST /ingest/github` - Ingest GitHub repositories
- `POST /retrieve` - Document retrieval with citations
- `POST /validate` - Validate response grounding
- `POST /refresh` - Refresh knowledge base
- `GET /stats` - Service statistics

### TTS Service (Port 3004)
**Purpose:** Text-to-speech synthesis

**Supported Providers:**
- Google Cloud Text-to-Speech
- ElevenLabs
- Apple native (iOS)

**Features:**
- Streaming audio synthesis
- Voice customization
- Redis caching for performance

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- iOS development: Xcode 15+
- API Keys:
  - OpenAI (required for embeddings + LLM)
  - Anthropic (optional, for Claude)
  - Deepgram or AWS (for ASR)
  - Google Cloud or ElevenLabs (for TTS)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/jarvis.git
cd jarvis
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

Required environment variables:
```bash
# Database
POSTGRES_PASSWORD=your_secure_password
DATABASE_URL=postgresql://postgres:password@postgres:5432/jarvis

# Redis
REDIS_PASSWORD=your_redis_password

# Authentication
JWT_SECRET=your_jwt_secret

# OpenAI (required)
OPENAI_API_KEY=sk-...

# ASR Provider (choose one)
DEEPGRAM_API_KEY=...
# OR
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# TTS Provider (choose one)
GOOGLE_CLOUD_CREDENTIALS=...
# OR configure ElevenLabs in settings

# RAG Configuration
GITHUB_TOKEN=ghp_...  # For private repos
REFRESH_REPOSITORIES=[{"owner":"anthropics","repo":"anthropic-sdk-python","branch":"main"}]
REFRESH_INTERVAL_MINUTES=3
```

3. **Start services with Docker Compose**
```bash
cd infrastructure/docker
docker-compose up -d
```

4. **Verify services are running**
```bash
# Check service health
curl http://localhost:3000/healthz
curl http://localhost:3001/healthz
curl http://localhost:3002/healthz
curl http://localhost:3003/healthz
curl http://localhost:3004/healthz

# View logs
docker-compose logs -f
```

5. **Set up iOS client**
```bash
cd jarvis-ios
open Jarvis.xcodeproj

# Configure in Xcode:
# 1. Update Config.swift with your server URL
# 2. Build and run on device or simulator
```

### Testing the RAG Service

```bash
# Check RAG statistics
curl http://localhost:3002/stats | jq .

# Search the knowledge base
curl -X POST http://localhost:3002/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to use streaming",
    "limit": 5,
    "similarityThreshold": 0.7,
    "includeCitations": true
  }' | jq .

# Ingest a GitHub repository
curl -X POST http://localhost:3002/ingest/github \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "openai",
    "repo": "openai-python",
    "branch": "main",
    "paths": ["README.md", "docs/"]
  }' | jq .

# Trigger knowledge refresh
curl -X POST http://localhost:3002/refresh | jq .
```

See [infrastructure/docker/TEST_RAG.md](infrastructure/docker/TEST_RAG.md) for comprehensive testing instructions.

## Development

### Local Development Setup

1. **Install dependencies**
```bash
# Install all service dependencies
npm install --workspaces

# Or install for specific service
cd services/rag-service
npm install
```

2. **Run services locally**
```bash
# Start PostgreSQL and Redis
docker-compose up postgres redis -d

# Run individual services
cd services/ingress-service
npm run dev

cd services/rag-service
npm run dev
```

3. **Build services**
```bash
# Build all services
npm run build --workspaces

# Build specific service
cd services/llm-router
npm run build
```

### Project Structure

```
jarvis/
├── services/
│   ├── ingress-service/       # Audio ingestion & orchestration
│   ├── asr-gateway/           # Speech-to-text
│   ├── llm-router/            # LLM integration
│   ├── rag-service/           # Knowledge retrieval
│   └── tts-service/           # Text-to-speech
├── jarvis-ios/                # iOS client application
├── infrastructure/
│   ├── docker/                # Docker Compose setup
│   ├── terraform/             # AWS Lightsail provisioning
│   └── scripts/               # Deployment scripts
├── infra/cdk/                 # AWS CDK (alternative deployment)
└── .github/workflows/         # CI/CD pipelines
```

### iOS Development

**Key Components:**
- `ContentView.swift` - Main UI
- `VoiceAssistantViewModel.swift` - Core logic
- `AudioManager.swift` - Audio capture & playback
- `WakeWordDetector.swift` - "Jarvis" activation
- `VoiceActivityDetector.swift` - Interruption detection
- `WebRTCClient.swift` - Audio streaming
- `GRPCClient.swift` - Session management

**Recognition Modes:**
1. **Privacy Mode** - On-device only (offline)
2. **Standard Mode** - Apple cloud recognition
3. **Professional Mode** - WebRTC with 3rd-party STT

## Deployment

### AWS Lightsail (Recommended - ~$20/month)

1. **Provision infrastructure with Terraform**
```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

2. **Configure GitHub Actions secrets**
```
AWS_LIGHTSAIL_HOST
AWS_LIGHTSAIL_SSH_KEY
```

3. **Push to main branch** - GitHub Actions will automatically deploy

### Manual Deployment

```bash
# SSH into server
ssh -i your-key.pem ubuntu@your-server-ip

# Clone and setup
git clone https://github.com/yourusername/jarvis.git
cd jarvis/infrastructure/docker

# Configure environment
cp .env.example .env
# Edit .env

# Start services
docker-compose up -d

# Setup SSL with Let's Encrypt
sudo certbot --nginx -d your-domain.com
```

### ECS/Fargate (Optional - ~$27-38/month)

See [infra/cdk/README.md](infra/cdk/README.md) for AWS ECS deployment with CDK.

## API Reference

### Ingress Service (Port 3000)

#### Start Session
```bash
POST /sessions/start
{
  "deviceToken": "device-12345"
}
```

#### WebSocket Audio Streaming
```javascript
const ws = new WebSocket('ws://localhost:3000/audio');
ws.send(audioBuffer); // PCM 16kHz mono
```

### RAG Service (Port 3002)

See [infrastructure/docker/TEST_RAG.md](infrastructure/docker/TEST_RAG.md) for complete API documentation.

## Monitoring

### Prometheus Metrics
```bash
# Access Prometheus
http://localhost:9090

# Key metrics:
# - http_request_duration_seconds
# - pipeline_latency_milliseconds
# - session_active_count
# - rag_search_duration_seconds
```

### Grafana Dashboards
```bash
# Access Grafana
http://localhost:3001
# Default credentials: admin/admin
```

### Service Logs
```bash
# View all logs
docker-compose logs -f

# Specific service
docker logs jarvis-rag-service --tail 100 -f

# Search for errors
docker-compose logs | grep -i error
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL password | Required |
| `REDIS_PASSWORD` | Redis password | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |
| `GITHUB_TOKEN` | GitHub access token | Optional |
| `REFRESH_REPOSITORIES` | JSON array of repos to index | `[]` |
| `REFRESH_INTERVAL_MINUTES` | RAG refresh interval | `3` |
| `PRIMARY_ASR_PROVIDER` | ASR provider (aws/deepgram) | `aws` |
| `PRIMARY_LLM_PROVIDER` | LLM provider (openai/anthropic) | `openai` |
| `PRIMARY_LLM_MODEL` | LLM model name | `gpt-4o` |
| `EMBEDDING_MODEL` | Embedding model | `text-embedding-ada-002` |
| `VAD_THRESHOLD` | Voice activity threshold | `0.7` |
| `VAD_DURATION_MS` | VAD duration | `150` |
| `FIRST_TOKEN_LATENCY_MS` | First token target | `500` |
| `END_TO_END_LATENCY_MS` | End-to-end target | `2000` |

See `.env.example` for complete configuration options.

## Performance Targets

| Metric | Target | Description |
|--------|--------|-------------|
| First Token Latency | <500ms | Time to first LLM token |
| End-to-End Latency | <2000ms | Complete response cycle |
| VAD Reaction | <150ms | Interruption detection |
| Wake Word Detection | <100ms | "Jarvis" activation |
| Vector Search | <100ms | pgvector similarity query |

## Troubleshooting

### Common Issues

**1. RAG Service - No search results**
```bash
# Check if documents are ingested
curl http://localhost:3002/stats | jq '.ingestion'

# Manually trigger ingestion
curl -X POST http://localhost:3002/ingest/github \
  -H "Content-Type: application/json" \
  -d '{"owner":"anthropics","repo":"anthropic-sdk-python","branch":"main"}'
```

**2. Services won't start**
```bash
# Check logs for errors
docker-compose logs rag-service

# Restart specific service
docker-compose restart rag-service

# Rebuild and restart
docker-compose up -d --build rag-service
```

**3. Database connection errors**
```bash
# Check database health
docker exec jarvis-postgres pg_isready -U postgres

# View database logs
docker logs jarvis-postgres

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

**4. iOS app connection issues**
- Verify server URL in `Config.swift`
- Check network connectivity
- Review Xcode console for errors
- Ensure device token is registered

### Reset RAG Database

To clear all RAG data and start fresh:

```bash
# Clear RAG tables
docker exec jarvis-postgres psql -U postgres -d jarvis -c "
TRUNCATE TABLE embeddings CASCADE;
TRUNCATE TABLE knowledge_documents CASCADE;"

# Verify cleared
curl http://localhost:3002/stats | jq '.ingestion'

# Re-ingest your repository
curl -X POST http://localhost:3002/ingest/github \
  -H "Content-Type: application/json" \
  -d '{"owner":"your-org","repo":"your-repo","branch":"main"}'
```

## Security

- JWT-based authentication for all client requests
- bcrypt password hashing
- Environment variable management for secrets
- SSH key-based server access
- Let's Encrypt SSL/TLS
- UFW firewall configuration
- Rate limiting middleware
- Input validation and sanitization

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Add your license here]

## Acknowledgments

- Built with [Anthropic Claude](https://www.anthropic.com/)
- Vector search powered by [pgvector](https://github.com/pgvector/pgvector)
- WebRTC streaming with [mediasoup](https://mediasoup.org/)
- Task management with [Task Master AI](https://github.com/cyanheads/task-master-ai)

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Current Status:** Production-ready for demo deployments (10 concurrent users), scalable to 50+ with load balancing.
