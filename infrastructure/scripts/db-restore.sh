#!/bin/bash
set -e

# Database restore script for Jarvis
# Restores a PostgreSQL database from a SQL dump file

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../docker/.env"

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.sql>"
  echo "Example: $0 /opt/jarvis/backups/jarvis-20250110-120000.sql"
  exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Source environment variables if .env exists
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-jarvis}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

echo "[restore] Starting database restore..."
echo "[restore] Database: $POSTGRES_DB"
echo "[restore] Backup file: $BACKUP_FILE"

# Export password for psql
export PGPASSWORD="$POSTGRES_PASSWORD"

# Confirm restore operation
read -p "WARNING: This will overwrite the current database. Are you sure? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "[restore] Restore cancelled"
  exit 0
fi

# Run psql to restore using docker-compose exec
cd "$SCRIPT_DIR/../docker"

echo "[restore] Restoring database..."
if cat "$BACKUP_FILE" | docker-compose -f docker-compose.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
  echo "[restore] Database restored successfully from: $BACKUP_FILE"
  exit 0
else
  echo "[restore] ERROR: Database restore failed"
  exit 1
fi
