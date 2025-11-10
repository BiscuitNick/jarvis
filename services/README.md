# Jarvis Backend Services

Node.js/TypeScript microservices for the Jarvis real-time voice assistant.

**Deployment:** Lightsail + Docker Compose | **Location:** See [`infrastructure/README.md`](../infrastructure/README.md)

---

## Architecture

All services run as containerized microservices orchestrated by Docker Compose on a single AWS Lightsail instance.

```
┌─────────────────────────────────────────────────────────────┐
│                    Jarvis Backend Services                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Ingress    │  │ ASR Gateway  │  │  LLM Router  │     │
│  │   Service    │─▶│   Service    │─▶│   Service    │     │
│  │   :3000      │  │   :3001      │  │   :3003      │     │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘     │
│         │                                     │              │
│         ▼                                     ▼              │
│  ┌──────────────┐                    ┌──────────────┐      │
│  │ TTS Service  │◀───────────────────│ RAG Service  │      │
│  │   :3004      │                    │   :3002      │      │
│  └──────────────┘                    └──────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           │                                     │
           ▼                                     ▼
    ┌──────────────┐                    ┌──────────────┐
    │    Redis     │                    │  PostgreSQL  │
    │    :6379     │                    │  + pgvector  │
    └──────────────┘                    │    :5432     │
                                        └──────────────┘
```

---

## Services

All services are containerized and run on internal Docker network ports. Nginx reverse proxy handles external traffic on ports 80/443.

### 1. Ingress Service (`ingress-service`)
**Internal Port:** 3000
**Purpose:** WebRTC audio streaming and session management

**Endpoints:**
- `GET /healthz` - Health check
- `POST /audio/ingest` - Audio ingestion (WebSocket)
- `POST /session/create` - Create new session

**Dependencies:** Redis (session state), PostgreSQL (user data)

---

### 2. ASR Gateway (`asr-gateway`)
**Internal Port:** 3001
**Purpose:** Speech-to-text via cloud providers (Deepgram, Google, Azure)

**Endpoints:**
- `GET /healthz` - Health check
- `POST /transcribe` - Transcribe audio
- `POST /transcribe/stream` - Streaming transcription

**Dependencies:** None (calls external ASR APIs)

---

### 3. LLM Router (`llm-router`)
**Internal Port:** 3003
**Purpose:** Routes to frontier models (OpenAI GPT-4o, Anthropic Claude)

**Endpoints:**
- `GET /healthz` - Health check
- `POST /complete` - LLM completion
- `POST /complete/stream` - Streaming completion

**Dependencies:** RAG Service (for context retrieval)

---

### 4. RAG Service (`rag-service`)
**Internal Port:** 3002
**Purpose:** Knowledge indexing and semantic search with citations

**Endpoints:**
- `GET /healthz` - Health check
- `POST /search` - Vector similarity search
- `POST /index` - Index documents

**Dependencies:** PostgreSQL with pgvector extension

---

### 5. TTS Service (`tts-service`)
**Internal Port:** 3004
**Purpose:** Text-to-speech synthesis via cloud providers

**Endpoints:**
- `GET /healthz` - Health check
- `POST /synthesize` - Synthesize speech
- `POST /synthesize/stream` - Streaming TTS

**Dependencies:** Redis (audio caching)

---

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for local testing)
- PostgreSQL with pgvector (via Docker)
- Redis (via Docker)

### Install Dependencies

```bash
cd services
npm install
```

### Run Locally (Development)

```bash
# Start supporting services (PostgreSQL + Redis)
cd ../infrastructure/docker
docker-compose up -d postgres redis

# Run services in development mode (in separate terminals)
cd ../../services
npm run dev --workspace=ingress-service
npm run dev --workspace=asr-gateway
npm run dev --workspace=llm-router
npm run dev --workspace=rag-service
npm run dev --workspace=tts-service

# Or run a single service
cd ingress-service
npm run dev
```

### Build TypeScript

```bash
# Build all services
npm run build

# Build single service
cd ingress-service
npm run build
```

### Test Health Endpoints

```bash
# Test all services
curl http://localhost:3000/healthz  # Ingress
curl http://localhost:3001/healthz  # ASR Gateway
curl http://localhost:3002/healthz  # RAG Service
curl http://localhost:3003/healthz  # LLM Router
curl http://localhost:3004/healthz  # TTS Service
```

---

## Docker Deployment

### Build Docker Images Locally

```bash
# Build all services
./scripts/build-all.sh

# Build single service
./scripts/build-service.sh ingress-service
```

### Run with Docker Compose

All services are defined in `infrastructure/docker/docker-compose.yml`:

```bash
cd infrastructure/docker
docker-compose up -d
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ingress-service
```

---

## Project Structure

```
services/
├── package.json                 # Root package with workspaces
├── tsconfig.base.json           # Shared TypeScript config
├── scripts/                     # Build and deployment scripts
│   ├── build-all.sh            # Build all Docker images
│   └── build-service.sh        # Build single service
│
├── ingress-service/
│   ├── src/
│   │   └── index.ts            # Express server with WebSocket
│   ├── Dockerfile              # Multi-stage build
│   ├── package.json
│   └── tsconfig.json
│
├── asr-gateway/
│   ├── src/
│   │   └── index.ts            # ASR integration
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── llm-router/
│   ├── src/
│   │   └── index.ts            # LLM routing logic
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── rag-service/
│   ├── src/
│   │   └── index.ts            # Vector search with pgvector
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
└── tts-service/
    ├── src/
    │   └── index.ts            # TTS synthesis
    ├── Dockerfile
    ├── package.json
    └── tsconfig.json
```

---

## Development Workflow

### 1. Make Changes

```bash
cd ingress-service
# Edit src/index.ts
```

### 2. Test Locally

```bash
npm run dev
# Test at http://localhost:3000
```

### 3. Build and Test Docker Image

```bash
npm run build
docker build -t jarvis/ingress-service:latest .
docker run -p 3000:3000 jarvis/ingress-service:latest
curl http://localhost:3000/healthz
```

### 4. Deploy to Lightsail

```bash
# SSH into Lightsail instance
ssh -i lightsail-key.pem ubuntu@<instance-ip>

# Pull latest code
cd /opt/jarvis
git pull

# Rebuild and restart services
cd infrastructure/docker
docker-compose build ingress-service
docker-compose up -d ingress-service
```

---

## Environment Variables

Each service supports the following environment variables (configured in `infrastructure/docker/.env`):

```bash
# Common
NODE_ENV=production          # Environment mode
LOG_LEVEL=info              # Logging level

# Service-specific
DEEPGRAM_API_KEY=xxx        # For asr-gateway
OPENAI_API_KEY=xxx          # For llm-router
ANTHROPIC_API_KEY=xxx       # For llm-router
DATABASE_URL=postgresql://postgres:password@postgres:5432/jarvis  # For rag-service
REDIS_URL=redis://redis:6379  # For ingress-service, tts-service
```

---

## Monitoring

### Docker Compose Logs

```bash
# View all service logs
docker-compose logs -f

# View specific service
docker-compose logs -f ingress-service

# View last 100 lines
docker-compose logs --tail=100 ingress-service
```

### Prometheus + Grafana

Monitoring stack is included in Docker Compose:

- **Prometheus:** http://\<instance-ip\>:9090
- **Grafana:** http://\<instance-ip\>:3001

### Health Checks

```bash
# Check all services via Nginx
curl http://<instance-ip>/api/ingress/healthz
curl http://<instance-ip>/api/asr/healthz
curl http://<instance-ip>/api/llm/healthz
curl http://<instance-ip>/api/rag/healthz
curl http://<instance-ip>/api/tts/healthz
```

### Lightsail CloudWatch Metrics

- AWS Console → Lightsail → Instances → Metrics
- View CPU, network, disk I/O

---

## CI/CD

GitHub Actions workflow deploys to Lightsail on push to `main`:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Lightsail

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        run: |
          ssh ubuntu@${{ secrets.LIGHTSAIL_IP }} \
            'cd /opt/jarvis && \
             git pull && \
             cd infrastructure/docker && \
             docker-compose build && \
             docker-compose up -d'
```

---

## Troubleshooting

### Build Fails

```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Docker Build Fails

```bash
# Check Dockerfile syntax
docker build --no-cache -t test .

# Check logs
docker logs <container-id>
```

### Service Not Responding

```bash
# Check if service is running
docker-compose ps

# Check logs
docker-compose logs ingress-service

# Restart service
docker-compose restart ingress-service
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U postgres -d jarvis

# Check pgvector extension
docker-compose exec postgres psql -U postgres -d jarvis -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping
```

---

## Performance Optimization

- **Multi-stage Docker builds** - Reduces image size (~500MB → ~150MB)
- **Connection pooling** - Reuse database connections (pg Pool)
- **Redis caching** - Cache TTS audio, session state
- **Streaming responses** - Reduce latency for LLM and TTS
- **Health check endpoints** - Fast response times (<50ms)

---

## Next Steps

1. **Implement WebRTC/WebSocket** in `ingress-service` (Task 5)
2. **Add ASR providers** (Deepgram, Google, Azure) to `asr-gateway` (Task 4)
3. **Integrate LLMs** (OpenAI, Anthropic) in `llm-router` (Task 6)
4. **Complete RAG indexing** and vector search in `rag-service` (Task 7)
5. **Add TTS providers** (Google, ElevenLabs) to `tts-service` (Task 4)
6. **Implement authentication** and rate limiting (Task 10)
7. **Add comprehensive logging** with Winston (Task 10)

See [Task Master](./.taskmaster/) for full task list.

---

## Deployment Architecture

For complete infrastructure details, see:

- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - Full project architecture
- **[infrastructure/README.md](../infrastructure/README.md)** - Lightsail deployment guide
- **[infrastructure/docker/README.md](../infrastructure/docker/README.md)** - Docker Compose setup

---

**Questions?** Check the main [ARCHITECTURE.md](../ARCHITECTURE.md) for overall system design.
