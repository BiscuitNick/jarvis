#!/bin/bash
set -e

# Lightsail Initial Setup Script
# Run this script on a fresh Lightsail instance to prepare it for Jarvis deployment

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root or with sudo"
    exit 1
fi

log_info "Starting Lightsail instance setup for Jarvis..."

# Update system
log_info "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install essential packages
log_info "Installing essential packages..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    unzip \
    wget \
    htop \
    vim \
    fail2ban \
    ufw \
    jq

# Install Docker
log_info "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker ubuntu
    rm get-docker.sh
    log_info "Docker installed successfully"
else
    log_warn "Docker already installed"
fi

# Install Docker Compose
log_info "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_VERSION="2.24.0"
    curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    log_info "Docker Compose installed successfully"
else
    log_warn "Docker Compose already installed"
fi

# Configure UFW firewall
log_info "Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw allow 3478/tcp # WebRTC/TURN
ufw allow 3478/udp # WebRTC/TURN

# Configure fail2ban
log_info "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Create application directory
log_info "Creating application directory..."
DEPLOYMENT_PATH="/opt/jarvis"
mkdir -p "$DEPLOYMENT_PATH"
chown -R ubuntu:ubuntu "$DEPLOYMENT_PATH"

# Setup log rotation for Docker
log_info "Configuring Docker log rotation..."
cat > /etc/logrotate.d/docker-container <<EOF
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    missingok
    delaycompress
    copytruncate
    size 10M
}
EOF

# Enable Docker service
systemctl enable docker
systemctl start docker

# Create scripts directory
mkdir -p "$DEPLOYMENT_PATH/scripts"
mkdir -p "$DEPLOYMENT_PATH/logs"

# Setup system health check script
log_info "Setting up health check script..."
cat > "$DEPLOYMENT_PATH/scripts/system-health.sh" <<'EOF'
#!/bin/bash
echo "=== System Health Check ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Memory: $(free -h | grep Mem)"
echo "Disk: $(df -h / | tail -1)"
echo "Docker Status: $(systemctl is-active docker)"
echo "Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

chmod +x "$DEPLOYMENT_PATH/scripts/system-health.sh"

# Setup cron job for health checks
log_info "Setting up health check cron job..."
(crontab -u ubuntu -l 2>/dev/null || true; echo "*/5 * * * * $DEPLOYMENT_PATH/scripts/system-health.sh >> $DEPLOYMENT_PATH/logs/health.log 2>&1") | crontab -u ubuntu -

# Setup log cleanup cron job
log_info "Setting up log cleanup cron job..."
(crontab -u ubuntu -l 2>/dev/null || true; echo "0 2 * * * find $DEPLOYMENT_PATH/logs -type f -mtime +7 -delete") | crontab -u ubuntu -

# Setup database TTL cleanup cron job (daily at 3:15 AM)
log_info "Setting up database TTL cleanup cron job..."
(crontab -u ubuntu -l 2>/dev/null || true; echo "15 3 * * * $DEPLOYMENT_PATH/infrastructure/scripts/run-db-ttl-cleanup.sh >> $DEPLOYMENT_PATH/logs/db-maintenance.log 2>&1") | crontab -u ubuntu -

# Setup database backup cron job (daily at 4:00 AM)
log_info "Setting up database backup cron job..."
mkdir -p /opt/jarvis/backups
(crontab -u ubuntu -l 2>/dev/null || true; echo "0 4 * * * $DEPLOYMENT_PATH/infrastructure/scripts/db-backup.sh >> $DEPLOYMENT_PATH/logs/db-backup.log 2>&1") | crontab -u ubuntu -

# Install AWS CLI (optional)
log_info "Installing AWS CLI..."
if ! command -v aws &> /dev/null; then
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip -q awscliv2.zip
    ./aws/install
    rm -rf aws awscliv2.zip
    log_info "AWS CLI installed successfully"
else
    log_warn "AWS CLI already installed"
fi

# Create initialization completion marker
echo "Lightsail instance initialized at $(date)" > "$DEPLOYMENT_PATH/init-complete.txt"

log_info "✅ Lightsail setup completed successfully!"
log_info ""
log_info "Next steps:"
log_info "1. Clone your repository to $DEPLOYMENT_PATH"
log_info "2. Configure environment variables in infrastructure/docker/.env"
log_info "3. Run the deployment script: cd $DEPLOYMENT_PATH && ./infrastructure/scripts/deploy.sh"
log_info ""
log_info "Note: Logout and login again for Docker group permissions to take effect"
