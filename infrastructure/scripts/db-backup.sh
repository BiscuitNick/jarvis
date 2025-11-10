#!/bin/bash
set -e

# Database backup script for Jarvis
# Creates a SQL dump of the PostgreSQL database

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../docker/.env"
BACKUP_DIR="${BACKUP_DIR:-/opt/jarvis/backups}"
LOG_DIR="${LOG_DIR:-/opt/jarvis/logs}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# Source environment variables if .env exists
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-jarvis}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/jarvis-$TIMESTAMP.sql"

echo "[backup] Starting database backup..."
echo "[backup] Database: $POSTGRES_DB"
echo "[backup] Backup file: $BACKUP_FILE"

# Export password for pg_dump
export PGPASSWORD="$POSTGRES_PASSWORD"

# Run pg_dump using docker-compose exec
cd "$SCRIPT_DIR/../docker"

if docker-compose -f docker-compose.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE" 2>> "$LOG_DIR/db-backup.log"; then
  echo "[backup] Backup created successfully: $BACKUP_FILE"

  # Get file size
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[backup] Backup size: $SIZE"

  # Prune old backups
  echo "[backup] Pruning backups older than $RETENTION_DAYS days..."
  find "$BACKUP_DIR" -name "jarvis-*.sql" -type f -mtime +$RETENTION_DAYS -delete

  REMAINING=$(ls -1 "$BACKUP_DIR"/jarvis-*.sql 2>/dev/null | wc -l)
  echo "[backup] Remaining backups: $REMAINING"
  echo "[backup] Backup completed successfully"

  exit 0
else
  echo "[backup] ERROR: Backup failed"
  exit 1
fi
