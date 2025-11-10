#!/bin/bash
set -e

# SSL Certificate Setup Script using Certbot
# This script obtains SSL certificates for your domain using Let's Encrypt

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if domain is provided
if [ -z "$1" ]; then
    log_error "Usage: $0 <domain-name> <email>"
    log_error "Example: $0 jarvis.example.com admin@example.com"
    exit 1
fi

DOMAIN_NAME="$1"
EMAIL="${2:-admin@$DOMAIN_NAME}"
DOCKER_COMPOSE_FILE="infrastructure/docker/docker-compose.yml"

log_info "Setting up SSL certificates for: $DOMAIN_NAME"
log_info "Contact email: $EMAIL"

# Ensure nginx is running with HTTP-only config first
log_info "Switching to HTTP-only nginx configuration..."
cp infrastructure/nginx/conf.d/http-only.conf.example infrastructure/nginx/conf.d/default.conf

# Restart nginx with HTTP-only config
log_info "Restarting nginx..."
docker-compose -f "$DOCKER_COMPOSE_FILE" restart nginx

# Wait for nginx to be ready
sleep 5

# Obtain SSL certificate
log_info "Requesting SSL certificate from Let's Encrypt..."
docker-compose -f "$DOCKER_COMPOSE_FILE" run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN_NAME"

if [ $? -eq 0 ]; then
    log_info "SSL certificate obtained successfully!"

    # Update nginx config with correct domain
    log_info "Updating nginx configuration with SSL..."
    sed -i "s/your-domain.com/$DOMAIN_NAME/g" infrastructure/nginx/conf.d/default.conf

    # Reload nginx
    log_info "Reloading nginx with SSL configuration..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec nginx nginx -s reload

    # Setup auto-renewal cron job
    log_info "Setting up SSL certificate auto-renewal..."
    (crontab -l 2>/dev/null || true; echo "0 3 * * * cd /opt/jarvis && docker-compose -f $DOCKER_COMPOSE_FILE run --rm certbot renew --quiet && docker-compose -f $DOCKER_COMPOSE_FILE exec nginx nginx -s reload") | crontab -

    log_info "✅ SSL setup completed successfully!"
    log_info "Your site is now available at: https://$DOMAIN_NAME"
else
    log_error "Failed to obtain SSL certificate"
    log_error "Please check:"
    log_error "1. Domain DNS is pointing to this server"
    log_error "2. Port 80 is accessible from the internet"
    log_error "3. nginx is running and serving /.well-known/acme-challenge/"
    exit 1
fi
