#!/bin/bash
set -e

# Database migration runner for Jarvis project
# Applies versioned SQL migrations to the PostgreSQL database

echo "[migrations] Starting database migrations..."

# Read environment variables
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="${POSTGRES_DB:-jarvis}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# Export password for psql
export PGPASSWORD="$POSTGRES_PASSWORD"

# Wait for database to be ready
echo "[migrations] Waiting for database to be ready..."
max_attempts=30
attempt=0
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "[migrations] ERROR: Database not ready after $max_attempts attempts"
    exit 1
  fi
  echo "[migrations] Waiting for database... (attempt $attempt/$max_attempts)"
  sleep 2
done

echo "[migrations] Database is ready"

# Create schema_migrations table if it doesn't exist
echo "[migrations] Creating schema_migrations table if not exists..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
EOF

# Acquire advisory lock to prevent concurrent migrations
echo "[migrations] Acquiring advisory lock..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_advisory_lock(48151623);" > /dev/null

# Function to release lock and exit
cleanup() {
  echo "[migrations] Releasing advisory lock..."
  psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_advisory_unlock(48151623);" > /dev/null
}
trap cleanup EXIT

# Process migrations
migrations_dir="/migrations"
applied=0
total=0

if [ ! -d "$migrations_dir" ] || [ -z "$(ls -A $migrations_dir/*.sql 2>/dev/null)" ]; then
  echo "[migrations] No migration files found in $migrations_dir"
  echo "[migrations] Migration check complete (0 applied, 0 total)"
  exit 0
fi

for migration_file in "$migrations_dir"/*.sql; do
  if [ ! -f "$migration_file" ]; then
    continue
  fi

  total=$((total + 1))
  filename=$(basename "$migration_file")

  # Extract version number from filename (e.g., 001__description.sql -> 1)
  version=$(echo "$filename" | sed -E 's/^0*([0-9]+)__.*/\1/')
  name=$(echo "$filename" | sed -E 's/^[0-9]+__(.*)\.sql$/\1/')

  # Check if migration has already been applied
  already_applied=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM schema_migrations WHERE version = $version;" | tr -d ' ')

  if [ "$already_applied" -gt 0 ]; then
    echo "[migrations] Skipping migration $version ($name) - already applied"
    continue
  fi

  echo "[migrations] Applying migration $version: $name"

  # Apply migration
  if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$migration_file"; then
    # Record migration in schema_migrations table
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOF
INSERT INTO schema_migrations (version, name) VALUES ($version, '$name');
EOF
    echo "[migrations] Successfully applied migration $version"
    applied=$((applied + 1))
  else
    echo "[migrations] ERROR: Failed to apply migration $version ($name)"
    exit 1
  fi
done

# Verify migration count
db_count=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM schema_migrations;" | tr -d ' ')

echo "[migrations] Migration summary:"
echo "[migrations]   Applied this run: $applied"
echo "[migrations]   Total in database: $db_count"
echo "[migrations]   Total files: $total"

if [ "$db_count" -ne "$total" ]; then
  echo "[migrations] WARNING: Mismatch between migration files ($total) and database records ($db_count)"
fi

echo "[migrations] Migration process complete"
exit 0
