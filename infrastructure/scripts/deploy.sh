#!/bin/bash
set -e

# Jarvis Deployment Script
# This script deploys the Jarvis application to AWS Lightsail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_PATH="${DEPLOYMENT_PATH:-/opt/jarvis}"
DOCKER_COMPOSE_FILE="infrastructure/docker/docker-compose.yml"
ENV_FILE="infrastructure/docker/.env"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        log_info "Please copy infrastructure/docker/.env.example to infrastructure/docker/.env and configure it"
        exit 1
    fi

    log_info "All requirements met"
}

backup_current() {
    log_info "Creating backup of current deployment..."

    if [ -d "$DEPLOYMENT_PATH" ]; then
        BACKUP_DIR="$DEPLOYMENT_PATH/../jarvis-backup-$(date +%Y%m%d-%H%M%S)"
        cp -r "$DEPLOYMENT_PATH" "$BACKUP_DIR"
        log_info "Backup created at: $BACKUP_DIR"
    else
        log_warn "No existing deployment found to backup"
    fi
}

stop_services() {
    log_info "Stopping running services..."

    cd "$DEPLOYMENT_PATH"
    docker-compose -f "$DOCKER_COMPOSE_FILE" down --timeout 30 || {
        log_warn "Failed to stop some services gracefully"
    }
}

pull_changes() {
    log_info "Pulling latest changes..."

    cd "$DEPLOYMENT_PATH"

    if [ -d ".git" ]; then
        git fetch origin
        git pull origin main
    else
        log_error "Not a git repository"
        exit 1
    fi
}

build_services() {
    log_info "Building service containers..."

    cd "$DEPLOYMENT_PATH"
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --parallel
}

start_services() {
    log_info "Starting services..."

    cd "$DEPLOYMENT_PATH"
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

    log_info "Waiting for services to be ready..."
    sleep 30
}

health_check() {
    log_info "Running health checks..."

    cd "$DEPLOYMENT_PATH"

    # Check if containers are running
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Exit"; then
        log_error "Some services failed to start"
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs --tail=50
        return 1
    fi

    # Check health endpoint
    if curl -f http://localhost/health > /dev/null 2>&1; then
        log_info "Health check passed"
        return 0
    else
        log_error "Health check failed"
        return 1
    fi
}

cleanup() {
    log_info "Cleaning up old images..."
    docker image prune -f
}

rollback() {
    log_error "Deployment failed! Rolling back..."

    cd "$DEPLOYMENT_PATH"
    git checkout HEAD~1
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --build

    log_info "Rollback completed"
}

# Main deployment flow
main() {
    log_info "Starting Jarvis deployment..."

    check_requirements
    backup_current
    stop_services
    pull_changes
    build_services
    start_services

    if health_check; then
        cleanup
        log_info "✅ Deployment completed successfully!"
    else
        rollback
        log_error "❌ Deployment failed and rolled back"
        exit 1
    fi
}

# Run main function
main "$@"
