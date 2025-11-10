# Jarvis Infrastructure Documentation

This directory contains all infrastructure code, configuration, and deployment scripts for the Jarvis voice assistant platform.

## 📁 Directory Structure

```
infrastructure/
├── terraform/              # Terraform IaC for AWS Lightsail
│   ├── main.tf            # Provider configuration
│   ├── variables.tf       # Input variables
│   ├── lightsail-instance.tf    # Compute instance
│   ├── lightsail-database.tf   # Managed PostgreSQL
│   ├── outputs.tf         # Output values
│   ├── user-data.sh       # Instance initialization script
│   └── terraform.tfvars.example  # Example variables
├── docker/                # Docker Compose configuration
│   ├── docker-compose.yml # Service orchestration
│   ├── .env.example       # Environment variables template
│   └── postgres/
│       └── init.sql       # Database initialization
├── nginx/                 # Nginx reverse proxy config
│   ├── nginx.conf         # Main nginx configuration
│   └── conf.d/
│       ├── default.conf   # HTTPS configuration
│       └── http-only.conf.example  # Initial HTTP config
├── scripts/               # Deployment and setup scripts
│   ├── setup-lightsail.sh # Initial instance setup
│   ├── deploy.sh          # Application deployment
│   └── ssl-setup.sh       # SSL certificate setup
└── github-actions/        # CI/CD workflows (in .github/workflows)
```

## 🚀 Quick Start

### Prerequisites

1. **AWS Account** with access to Lightsail
2. **Domain name** (optional, but recommended for production)
3. **API Keys** for:
   - Deepgram (ASR)
   - OpenAI (LLM & Embeddings)
   - Anthropic Claude (optional)
   - Google Cloud (optional for TTS)
   - Azure Speech (optional)

### Option 1: Terraform Deployment (Recommended)

#### Step 1: Configure Terraform

```bash
cd infrastructure/terraform

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your configuration
vim terraform.tfvars
```

#### Step 2: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Apply infrastructure
terraform apply

# Save outputs
terraform output -json > outputs.json
terraform output -raw ssh_private_key > lightsail-key.pem
chmod 600 lightsail-key.pem
```

#### Step 3: Get Instance IP

```bash
# Get the public IP address
INSTANCE_IP=$(terraform output -raw instance_public_ip)
echo "Instance IP: $INSTANCE_IP"

# SSH into the instance
ssh -i lightsail-key.pem ubuntu@$INSTANCE_IP
```

### Option 2: Manual AWS Console Setup

1. **Create Lightsail Instance**
   - Go to AWS Lightsail console
   - Create instance with Ubuntu 22.04
   - Choose bundle: `small_3_0` ($10/month) or `medium_3_0` ($20/month)
   - Create and download SSH key

2. **Create Static IP**
   - Create static IP
   - Attach to instance

3. **Configure Firewall**
   - Open ports: 22, 80, 443, 3478 (TCP/UDP)

4. **Create Database** (Optional)
   - Create managed PostgreSQL database
   - Version: PostgreSQL 15
   - Bundle: `micro_2_0` ($15/month)
   - Enable public access or configure security groups

## 🔧 Initial Setup

### 1. Connect to Instance

```bash
ssh -i your-key.pem ubuntu@YOUR_INSTANCE_IP
```

### 2. Run Setup Script

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/jarvis/main/infrastructure/scripts/setup-lightsail.sh -o setup.sh
chmod +x setup.sh
sudo ./setup.sh
```

Or if you already have the repo:

```bash
cd /opt/jarvis
sudo ./infrastructure/scripts/setup-lightsail.sh
```

### 3. Clone Repository

```bash
# Logout and login again for Docker permissions
exit
ssh -i your-key.pem ubuntu@YOUR_INSTANCE_IP

# Clone repository
cd /opt
sudo git clone https://github.com/YOUR_ORG/jarvis.git
sudo chown -R ubuntu:ubuntu jarvis
cd jarvis
```

### 4. Configure Environment

```bash
# Copy environment template
cd infrastructure/docker
cp .env.example .env

# Edit with your API keys and configuration
vim .env
```

**Required Environment Variables:**

```bash
# Database
POSTGRES_PASSWORD=your_secure_password
REDIS_PASSWORD=your_redis_password
JWT_SECRET=your_jwt_secret_min_32_chars

# ASR
DEEPGRAM_API_KEY=your_deepgram_key

# LLM & Embeddings
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key  # Optional

# Domain (if using SSL)
DOMAIN_NAME=your-domain.com
SSL_EMAIL=admin@your-domain.com
```

### 5. Deploy Services

```bash
cd /opt/jarvis
./infrastructure/scripts/deploy.sh
```

### 6. Setup SSL (if using domain)

```bash
# Ensure DNS is pointing to your instance IP
# Wait for DNS propagation

cd /opt/jarvis
./infrastructure/scripts/ssl-setup.sh your-domain.com admin@your-domain.com
```

## 🔐 Security Configuration

### Firewall Rules

The setup script automatically configures UFW:

```bash
# View current rules
sudo ufw status

# Custom rule example
sudo ufw allow from YOUR_IP to any port 22
```

### SSH Key Management

```bash
# Disable password authentication
sudo vim /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd
```

### Secrets Management

Store secrets in:
1. GitHub Secrets (for CI/CD)
2. AWS Secrets Manager (production)
3. Environment files with restricted permissions

```bash
# Secure environment file
chmod 600 infrastructure/docker/.env
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints

```bash
# Main health check
curl http://localhost/health

# Individual services
curl http://localhost:3000/health  # Ingress
curl http://localhost:3001/health  # ASR Gateway
curl http://localhost:3002/health  # RAG Service
curl http://localhost:3003/health  # LLM Router
curl http://localhost:3004/health  # TTS Service
```

### View Logs

```bash
# All services
cd /opt/jarvis/infrastructure/docker
docker-compose logs -f

# Specific service
docker-compose logs -f ingress

# System health log
tail -f /opt/jarvis/logs/health.log
```

### Container Status

```bash
# View running containers
docker-compose ps

# Resource usage
docker stats
```

## 🔄 CI/CD Pipeline

### GitHub Actions Setup

1. **Add GitHub Secrets**

Go to your repository Settings → Secrets and add:

```
AWS_ACCESS_KEY_ID          # For Terraform
AWS_SECRET_ACCESS_KEY      # For Terraform
AWS_REGION                 # e.g., us-east-1
DB_MASTER_PASSWORD         # Database password
LIGHTSAIL_SSH_KEY          # Private SSH key content
LIGHTSAIL_HOST             # Instance public IP
LIGHTSAIL_USER             # ubuntu
```

2. **Workflows**

- **Terraform Apply**: Runs on changes to `infrastructure/terraform/**`
- **Deploy to Lightsail**: Runs on push to `main` branch

### Manual Deployment

```bash
# Trigger deployment
git push origin main

# Or use GitHub Actions UI to trigger manually
```

## 🔨 Common Operations

### Update Application

```bash
cd /opt/jarvis
git pull origin main
./infrastructure/scripts/deploy.sh
```

### Restart Services

```bash
cd /opt/jarvis/infrastructure/docker

# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart ingress
```

### Database Backup & Restore

The project includes automated backup scripts with cron scheduling and TTL cleanup for logs and sessions.

#### Automated Daily Backups

Backups are automatically created daily at 4:00 AM via cron (configured during setup):

```bash
# Backup location
/opt/jarvis/backups/jarvis-YYYYMMDD-HHMMSS.sql

# Backup logs
/opt/jarvis/logs/db-backup.log
```

Backups are retained for 7 days by default (configurable via `BACKUP_RETENTION_DAYS` environment variable).

#### Manual Backup

```bash
# Using the backup script (recommended)
cd /opt/jarvis
./infrastructure/scripts/db-backup.sh

# Direct docker-compose method
cd /opt/jarvis/infrastructure/docker
docker-compose exec -T postgres pg_dump -U postgres jarvis > /opt/jarvis/backups/manual-backup-$(date +%Y%m%d-%H%M%S).sql
```

#### Database Restore

```bash
# Using the restore script (recommended)
cd /opt/jarvis
./infrastructure/scripts/db-restore.sh /opt/jarvis/backups/jarvis-20250110-120000.sql

# Direct docker-compose method
cd /opt/jarvis/infrastructure/docker
cat /opt/jarvis/backups/jarvis-20250110-120000.sql | docker-compose exec -T postgres psql -U postgres jarvis
```

**⚠️ Warning:** Restore operations will overwrite the current database. The restore script prompts for confirmation.

#### Testing Backup/Restore

```bash
# 1. Insert a test row
docker-compose exec -T postgres psql -U postgres -d jarvis -c "INSERT INTO users(device_token) VALUES('backup_test_token');"

# 2. Run backup
./infrastructure/scripts/db-backup.sh

# 3. Delete the test row
docker-compose exec -T postgres psql -U postgres -d jarvis -c "DELETE FROM users WHERE device_token='backup_test_token';"

# 4. Restore from backup
./infrastructure/scripts/db-restore.sh /opt/jarvis/backups/jarvis-YYYYMMDD-HHMMSS.sql

# 5. Verify restoration
docker-compose exec -T postgres psql -U postgres -d jarvis -c "SELECT count(*) FROM users WHERE device_token='backup_test_token';"
```

#### TTL Cleanup

Automated TTL cleanup runs daily at 3:15 AM to remove:
- Expired logs (24-hour retention)
- Expired sessions

```bash
# Manual TTL cleanup
cd /opt/jarvis
./infrastructure/scripts/run-db-ttl-cleanup.sh

# View cleanup logs
tail -f /opt/jarvis/logs/db-maintenance.log
```

#### Backup for Managed PostgreSQL

If using Lightsail managed PostgreSQL instead of containerized database:

```bash
# Update TTL cleanup script to use PGHOST/PGPORT
export PGHOST=your-database-endpoint.amazonaws.com
export PGPORT=5432
export POSTGRES_USER=dbadmin
export POSTGRES_PASSWORD=your_password
export POSTGRES_DB=jarvis

# Run cleanup
psql -h $PGHOST -p $PGPORT -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT cleanup_expired_logs();"
psql -h $PGHOST -p $PGPORT -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT cleanup_expired_sessions();"

# Backup
pg_dump -h $PGHOST -p $PGPORT -U $POSTGRES_USER $POSTGRES_DB > backup.sql

# Restore
psql -h $PGHOST -p $PGPORT -U $POSTGRES_USER -d $POSTGRES_DB < backup.sql
```

Add managed database credentials to cron jobs in `setup-lightsail.sh` if using managed PostgreSQL.

### Scale Services

```bash
# Scale a service (if supported)
docker-compose up -d --scale ingress=2
```

### Clean Up Resources

```bash
# Remove old images
docker image prune -f

# Remove unused volumes (careful!)
docker volume prune -f

# Remove everything (careful!)
docker system prune -af
```

## 💰 Cost Optimization

### Estimated Monthly Costs

**Option 1: Managed Database**
- Lightsail instance (small_3_0): $10/month
- Managed PostgreSQL (micro_2_0): $15/month
- Static IP: Free
- **Total: ~$25/month**

**Option 2: Containerized Database**
- Lightsail instance (medium_3_0): $20/month
- Static IP: Free
- **Total: ~$20/month**

### Cost Saving Tips

1. Use containerized PostgreSQL instead of managed database
2. Start with smaller instance, scale up if needed
3. Enable auto-scaling only for production
4. Use Lightsail data transfer allowances efficiently
5. Clean up old Docker images regularly

## 🐛 Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check service status
docker-compose ps

# Verify environment variables
docker-compose config
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew manually
cd /opt/jarvis/infrastructure/docker
docker-compose run --rm certbot renew

# Reload nginx
docker-compose exec nginx nginx -s reload
```

### Database Connection Issues

```bash
# Test database connection
docker-compose exec postgres psql -U postgres -d jarvis

# Check database logs
docker-compose logs postgres
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Check system resources
htop
df -h
free -h

# Check nginx logs
docker-compose logs nginx | grep -i error
```

## 📚 Additional Resources

- [AWS Lightsail Documentation](https://docs.aws.amazon.com/lightsail/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

## 🔧 Development vs Production

### Development Environment

- Use HTTP-only (no SSL)
- Smaller instance size
- Local/containerized database
- Debug logging enabled
- Auto-reload enabled

### Production Environment

- HTTPS with valid SSL certificate
- Larger instance size based on load
- Managed database with backups
- Error-level logging
- Health checks and monitoring
- Auto-scaling configured
- Regular backups

## 📝 Maintenance Schedule

**Daily:**
- Automated health checks (every 5 minutes)
- Log rotation
- Expired session cleanup

**Weekly:**
- Review error logs
- Check disk space
- Update Docker images

**Monthly:**
- Security updates
- SSL certificate renewal (automatic)
- Cost review
- Performance optimization

## 🆘 Support

For issues or questions:
1. Check logs: `docker-compose logs`
2. Review this documentation
3. Check GitHub Issues
4. Contact DevOps team

---

**Last Updated:** 2024
**Version:** 1.0.0
