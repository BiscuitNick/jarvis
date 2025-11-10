#!/bin/bash
set -e

# Update system packages
apt-get update
apt-get upgrade -y

# Install essential packages
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
    ufw

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu

# Install Docker Compose
DOCKER_COMPOSE_VERSION="2.24.0"
curl -L "https://github.com/docker/compose/releases/download/v$${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Configure UFW firewall
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw allow 3478/tcp # WebRTC/TURN
ufw allow 3478/udp # WebRTC/TURN

# Install and configure fail2ban for SSH protection
systemctl enable fail2ban
systemctl start fail2ban

# Create application directory
mkdir -p /opt/${project_name}
chown -R ubuntu:ubuntu /opt/${project_name}

# Install CloudWatch agent (optional for monitoring)
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i -E ./amazon-cloudwatch-agent.deb
rm amazon-cloudwatch-agent.deb

# Setup log rotation for Docker
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

# Create deployment user script directory
mkdir -p /opt/${project_name}/scripts
mkdir -p /opt/${project_name}/logs

# Set up system monitoring
cat > /opt/${project_name}/scripts/system-health.sh <<'EOF'
#!/bin/bash
# Simple system health check script
echo "=== System Health Check ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Memory: $(free -h | grep Mem)"
echo "Disk: $(df -h / | tail -1)"
echo "Docker Status: $(systemctl is-active docker)"
echo "Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

chmod +x /opt/${project_name}/scripts/system-health.sh

# Setup cron job for health checks
(crontab -l 2>/dev/null || true; echo "*/5 * * * * /opt/${project_name}/scripts/system-health.sh >> /opt/${project_name}/logs/health.log 2>&1") | crontab -

# Reboot flag
echo "Lightsail instance initialized at $(date)" > /opt/${project_name}/init-complete.txt

echo "User data script completed successfully"
