# Jarvis Architecture

Real-time voice assistant with retrieval-augmented generation (RAG), supporting 10 concurrent users.

---

## 🏗️ Current Infrastructure: **Lightsail + Docker Compose**

**Cost:** ~$20/month | **Location:** [`infrastructure/`](./infrastructure/)

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│ AWS Lightsail Instance ($20/month)                              │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Nginx (Reverse Proxy + SSL)                            │  │
│  │ - Port 80/443 (HTTP/HTTPS)                              │  │
│  │ - Let's Encrypt SSL                                     │  │
│  └──────────────────┬──────────────────────────────────────┘  │
│                      │                                          │
│  ┌──────────────────▼──────────────────────────────────────┐  │
│  │ Docker Compose Network (jarvis-network)                │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │ Ingress  │─▶│   ASR    │─▶│   LLM    │             │  │
│  │  │ :3000    │  │ Gateway  │  │  Router  │             │  │
│  │  └────┬─────┘  │  :3001   │  │  :3003   │             │  │
│  │       │        └──────────┘  └────┬─────┘             │  │
│  │       │                            │                    │  │
│  │       │                            ▼                    │  │
│  │       │         ┌──────────┐  ┌──────────┐             │  │
│  │       │         │   RAG    │  │   TTS    │             │  │
│  │       │         │ Service  │  │ Service  │             │  │
│  │       │         │  :3002   │  │  :3004   │             │  │
│  │       │         └────┬─────┘  └─────┬────┘             │  │
│  │       │              │              │                   │  │
│  │       ▼              ▼              │                   │  │
│  │  ┌──────────────────────────────┐  │                   │  │
│  │  │ PostgreSQL + pgvector        │  │                   │  │
│  │  │ - Users, sessions, knowledge │  │                   │  │
│  │  │ - Vector embeddings (1536d)  │  │                   │  │
│  │  └──────────────────────────────┘  │                   │  │
│  │       │                             │                   │  │
│  │       ▼                             ▼                   │  │
│  │  ┌──────────────────────────────────────┐              │  │
│  │  │ Redis (Session + Cache)              │              │  │
│  │  └──────────────────────────────────────┘              │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Monitoring                                                │  │
│  │ - Prometheus (metrics)                                   │  │
│  │ - Grafana (dashboards)                                   │  │
│  │ - Lightsail CloudWatch (instance metrics)               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

### Stack

- **Compute:** AWS Lightsail single instance ($10-20/month)
- **Orchestration:** Docker Compose
- **Database:** Containerized PostgreSQL 15 + pgvector
- **Cache:** Redis
- **Reverse Proxy:** Nginx + Let's Encrypt SSL
- **Monitoring:** Prometheus + Grafana (containerized)
- **CI/CD:** GitHub Actions → SSH deployment
- **IaC:** Terraform (Lightsail provisioning)

### Deployment Guide

👉 **[infrastructure/README.md](./infrastructure/README.md)** - Complete setup instructions

Quick start:
```bash
cd infrastructure/terraform
terraform init
terraform apply

# SSH into instance
ssh -i lightsail-key.pem ubuntu@<instance-ip>

# Deploy services
cd /opt/jarvis
./infrastructure/scripts/deploy.sh
```

---

## 📦 Backend Services

**Location:** [`services/`](./services/)

All services are Node.js/TypeScript microservices running in Docker containers.

### Service Descriptions

| Service | Port | Purpose | Dependencies |
|---------|------|---------|--------------|
| **Ingress** | 3000 | WebRTC audio streaming, session management | Redis, PostgreSQL |
| **ASR Gateway** | 3001 | Speech-to-text (Deepgram, Google, Azure) | - |
| **RAG Service** | 3002 | Knowledge indexing, semantic search | PostgreSQL (pgvector) |
| **LLM Router** | 3003 | GPT-4o/Claude integration, planning | RAG Service |
| **TTS Service** | 3004 | Text-to-speech synthesis | Redis |

### Request Flow

```
iOS Client
    │
    ▼
[ Nginx :80/443 ]
    │
    ▼
[ Ingress :3000 ] ─────┐
    │                   │ (session state)
    ▼                   ▼
[ ASR :3001 ]      [ Redis ]
    │
    ▼
[ LLM Router :3003 ]
    │
    ├─────────▶ [ RAG :3002 ] ────▶ [ PostgreSQL + pgvector ]
    │
    ▼
[ TTS :3004 ] ────▶ [ Redis cache ]
    │
    ▼
[ Ingress :3000 ]
    │
    ▼
iOS Client
```

---

## 📱 iOS Client

**Location:** `ios/` (to be implemented - Task 8)

- Wake-word detection ("Jarvis")
- Voice Activity Detection (VAD) - <150ms reaction time
- WebRTC audio streaming
- Real-time transcript display
- Source citations UI

---

## 🔄 Alternative Infrastructure: **ECS/Fargate** (NOT USED)

**Cost:** ~$27-38/month | **Location:** [`infra/cdk/`](./infra/cdk/)

An AWS CDK-based infrastructure using ECS Fargate with Application Load Balancer. Provides better auto-scaling and AWS integration, but higher cost and complexity.

**When to use:**
- Scaling beyond 10 users
- Need auto-scaling and high availability
- Enterprise compliance requirements
- Multi-region deployment

See [`infra/cdk/README.md`](./infra/cdk/README.md) for details.

---

## 🗂️ Project Structure

```
jarvis/
├── infrastructure/          ← ACTIVE: Lightsail + Docker Compose
│   ├── terraform/          # Lightsail provisioning
│   ├── docker/             # Docker Compose services
│   ├── nginx/              # Reverse proxy config
│   ├── scripts/            # Deployment automation
│   └── README.md           # 👉 PRIMARY DEPLOYMENT GUIDE
│
├── infra/cdk/              ← ALTERNATIVE: ECS/Fargate (not used)
│   ├── lib/                # CDK stacks
│   ├── bin/                # CDK app
│   └── README.md           # ECS deployment guide
│
├── services/               ← Backend microservices
│   ├── ingress-service/    # WebRTC + session management
│   ├── asr-gateway/        # Speech-to-text
│   ├── rag-service/        # Knowledge + embeddings
│   ├── llm-router/         # LLM integration
│   ├── tts-service/        # Text-to-speech
│   └── README.md           # Service documentation
│
├── ios/                    ← iOS client (Task 8)
│   └── (to be implemented)
│
├── .taskmaster/            # Task management
│   ├── tasks/              # Task definitions
│   └── docs/               # PRD and requirements
│
└── ARCHITECTURE.md         # 👈 This file
```

---

## 💰 Cost Breakdown

### Current Monthly Costs (Lightsail)

| Component | Cost | Notes |
|-----------|------|-------|
| Lightsail instance (medium_3_0) | ~$20 | Single instance, 2 vCPU, 4 GB RAM |
| Static IP | Free | Included with Lightsail |
| Data transfer | Free | 3 TB included |
| **TOTAL** | **~$20/month** | |

### Alternative Costs (ECS - if switched)

| Component | Cost |
|-----------|------|
| Application Load Balancer | ~$16/month |
| ECS Fargate (0.25 vCPU, 512 MB) | ~$9/month |
| CloudWatch Logs | ~$1/month |
| **TOTAL** | **~$27-38/month** |

---

## 🚀 Getting Started

### For Infrastructure Setup

👉 **[infrastructure/README.md](./infrastructure/README.md)**

### For Service Development

👉 **[services/README.md](./services/README.md)**

### For Task Management

View tasks:
```bash
task-master list
task-master next
```

---

## 📊 Performance Requirements

- **Latency:** <500ms end-to-end (first token)
- **Concurrent Users:** 10 (demo scale)
- **Availability:** Best effort (single instance)
- **VAD Reaction Time:** <150ms
- **Word Error Rate (WER):** Track and optimize

---

## 🔐 Security

- ✅ SSH key-based authentication
- ✅ UFW firewall configured
- ✅ SSL/TLS with Let's Encrypt
- ✅ Security headers (nginx)
- ✅ Rate limiting
- ✅ Environment variable encryption
- ✅ GitHub Secrets for CI/CD
- ✅ No hardcoded credentials

---

## 📈 Scaling Path

**Current:** Lightsail single instance (~$20/month)
- 10 concurrent users
- Manual scaling
- Single region

**Next:** Lightsail + Load Balancer (~$40/month)
- 50+ concurrent users
- Multiple Lightsail instances
- Sticky sessions for WebRTC

**Future:** ECS/Fargate (~$150-300/month)
- Auto-scaling
- Multi-AZ deployment
- Enterprise features

---

**Questions?** See documentation in each directory or check [Task Master](./.taskmaster/) for implementation tasks.
