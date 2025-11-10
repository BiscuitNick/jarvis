# ⚠️ ALTERNATIVE INFRASTRUCTURE - NOT CURRENTLY USED

**This directory contains an ALTERNATIVE infrastructure approach using AWS ECS/Fargate that is NOT currently being used.**

## Current Active Infrastructure

**👉 See [`infrastructure/README.md`](../../infrastructure/README.md)** for the **ACTIVE** Lightsail + Docker Compose setup (~$20/month).

---

## Why This Exists

This AWS CDK infrastructure was created as an **alternative deployment option** for running Jarvis on ECS Fargate instead of Lightsail. It provides:

- **Higher scalability** - Auto-scaling, multi-AZ deployment
- **Enterprise features** - VPC networking, advanced monitoring
- **AWS integration** - Better integration with other AWS services

However, for the MVP/demo, we chose **Lightsail** (in `infrastructure/`) because:

✅ **Lower cost** - ~$20/month vs ~$27-38/month
✅ **Simpler setup** - Single Terraform deployment vs CDK stacks
✅ **Faster deployment** - Docker Compose vs ECS task definitions
✅ **Better for demos** - Easy to start/stop, clear cost control

---

## When To Use This CDK Approach

Consider switching to this ECS/Fargate infrastructure when:

1. **Scaling beyond 10 users** - Need auto-scaling and load balancing
2. **Multi-region deployment** - Global user base requirements
3. **Enterprise requirements** - Compliance, advanced networking, VPC peering
4. **AWS-native workloads** - Heavy integration with other AWS services
5. **Production HA** - Need 99.99% uptime SLA

---

## Architecture Comparison

| Feature | **Lightsail (ACTIVE)** | **ECS/Fargate (THIS DIRECTORY)** |
|---------|------------------------|-----------------------------------|
| **Cost** | ~$20/month | ~$27-38/month (MVP), $150-300/month (prod) |
| **Deployment** | Terraform + Docker Compose | AWS CDK |
| **Scaling** | Manual | Auto-scaling |
| **Networking** | Single instance | VPC, ALB, multi-AZ |
| **Database** | Containerized PostgreSQL | RDS or containerized |
| **Monitoring** | Prometheus/Grafana | CloudWatch Container Insights |
| **Setup Time** | ~15 minutes | ~30 minutes |
| **Best For** | Demo, MVP, <10 users | Production, enterprise, auto-scaling |

---

## How To Use This (If You Choose To)

### Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with credentials
- AWS CDK CLI: `npm install -g aws-cdk`
- Set environment variables:
  ```bash
  export CDK_DEFAULT_ACCOUNT="your-account-id"
  export CDK_DEFAULT_REGION="us-east-1"
  ```

### Setup

```bash
cd infra/cdk
npm install
cdk bootstrap  # First time only
```

### Deploy ECS Infrastructure

```bash
npm run build
cdk deploy Jarvis-ECS-dev
```

### Get Service URL

```bash
aws cloudformation describe-stacks \
  --stack-name Jarvis-ECS-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ServiceUrl`].OutputValue' \
  --output text
```

### Destroy Infrastructure

```bash
cdk destroy Jarvis-ECS-dev
```

---

## Cost Breakdown (If Using ECS)

### MVP Configuration (~$27-38/month)

| Component | Cost |
|-----------|------|
| Application Load Balancer | ~$16/month |
| ECS Fargate (0.25 vCPU, 512 MB, 1 task) | ~$9/month |
| CloudWatch Logs (7-day retention) | ~$1/month |
| Data Transfer | ~$1-5/month |
| **TOTAL** | **~$27-38/month** |

### Stop Service to Save Money

```bash
# Stop tasks (keeps ALB, ~$16/month)
aws ecs update-service \
  --cluster jarvis-dev-cluster \
  --service jarvis-dev-service \
  --desired-count 0

# Start tasks
aws ecs update-service \
  --cluster jarvis-dev-cluster \
  --service jarvis-dev-service \
  --desired-count 1
```

---

## Files in This Directory

- **`bin/jarvis.ts`** - CDK app entry point
- **`lib/vpc-stack.ts`** - Custom VPC with public/private subnets
- **`lib/ecs-stack.ts`** - ECS Fargate service with ALB
- **`cdk.json`** - CDK configuration and environment settings
- **`package.json`** - Node.js dependencies

---

## Migration Path: Lightsail → ECS

If you decide to migrate from Lightsail to ECS:

1. **Export data from Lightsail PostgreSQL**
   ```bash
   docker-compose exec postgres pg_dump -U postgres jarvis > backup.sql
   ```

2. **Deploy ECS infrastructure**
   ```bash
   cd infra/cdk
   cdk deploy Jarvis-ECS-dev
   ```

3. **Build and push Docker images to ECR**
   ```bash
   aws ecr create-repository --repository-name jarvis-app
   docker build -t jarvis-app .
   docker tag jarvis-app:latest <account>.dkr.ecr.us-east-1.amazonaws.com/jarvis-app:latest
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
   docker push <account>.dkr.ecr.us-east-1.amazonaws.com/jarvis-app:latest
   ```

4. **Import data to RDS or ECS-hosted PostgreSQL**
   ```bash
   psql -h <rds-endpoint> -U postgres jarvis < backup.sql
   ```

5. **Update DNS to point to new ALB**
   ```bash
   # Get ALB DNS
   aws cloudformation describe-stacks \
     --stack-name Jarvis-ECS-dev \
     --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue'
   ```

6. **Tear down Lightsail**
   ```bash
   cd infrastructure/terraform
   terraform destroy
   ```

---

## For More Details

See the original ECS documentation preserved in:
- **[README-DEFAULT-VPC.md](./README-DEFAULT-VPC.md)** - Detailed ECS/Fargate configuration guide
- **[lib/ecs-stack.ts](./lib/ecs-stack.ts)** - ECS stack implementation
- **[lib/vpc-stack.ts](./lib/vpc-stack.ts)** - VPC stack implementation

---

## 👉 Remember: For Current Deployment, Use [`infrastructure/`](../../infrastructure/)

This directory is kept for:
- **Future scaling** - When you need to move beyond Lightsail
- **Alternative deployment** - If you prefer ECS over Docker Compose
- **Reference** - Example AWS CDK infrastructure patterns

**Active development uses Lightsail in `infrastructure/` directory.**
