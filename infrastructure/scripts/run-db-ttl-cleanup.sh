#!/bin/bash
set -e

# TTL cleanup script for Jarvis database
# Runs cleanup functions defined in init.sql for expired sessions and logs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../docker/.env"

# Source environment variables if .env exists
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-jarvis}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

echo "[ttl-cleanup] Starting database TTL cleanup..."
echo "[ttl-cleanup] Database: $POSTGRES_DB"
echo "[ttl-cleanup] User: $POSTGRES_USER"

# Export password for psql
export PGPASSWORD="$POSTGRES_PASSWORD"

# Run cleanup functions using docker-compose exec
cd "$SCRIPT_DIR/../docker"

# Cleanup expired logs
echo "[ttl-cleanup] Cleaning up expired logs..."
if docker-compose -f docker-compose.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT cleanup_expired_logs();" > /dev/null 2>&1; then
  echo "[ttl-cleanup] Expired logs cleaned successfully"
else
  echo "[ttl-cleanup] ERROR: Failed to cleanup expired logs"
  exit 1
fi

# Cleanup expired sessions
echo "[ttl-cleanup] Cleaning up expired sessions..."
if docker-compose -f docker-compose.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT cleanup_expired_sessions();" > /dev/null 2>&1; then
  echo "[ttl-cleanup] Expired sessions cleaned successfully"
else
  echo "[ttl-cleanup] ERROR: Failed to cleanup expired sessions"
  exit 1
fi

echo "[ttl-cleanup] TTL cleanup completed successfully"
exit 0
