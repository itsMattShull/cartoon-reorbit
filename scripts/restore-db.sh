#!/usr/bin/env bash
# =============================================================================
# restore-db.sh — Restore a PostgreSQL backup from S3
# =============================================================================
# Usage:
#   ./scripts/restore-db.sh                        # list available backups
#   ./scripts/restore-db.sh <s3-key-or-timestamp>  # restore a specific backup
#
# The script will prompt for confirmation before dropping/recreating the DB.
# =============================================================================

set -euo pipefail

SECRETS_FILE="${SECRETS_FILE:-/etc/cartoon-reorbit-backup.env}"
if [[ -f "$SECRETS_FILE" ]]; then
  set -a; source "$SECRETS_FILE"; set +a
fi

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is not set}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is not set}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is not set}"
: "${AWS_DEFAULT_REGION:?AWS_DEFAULT_REGION is not set}"

S3_PREFIX="${BACKUP_S3_PREFIX:-backups/cartoon-reorbit}"

# Parse DATABASE_URL
DB_URL_NOSCHEME="${DATABASE_URL#*://}"
DB_USER="$(echo "$DB_URL_NOSCHEME" | grep -oP '^[^:@]+(?=[:@])')"
DB_PASS="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=:)[^@]+(?=@)' || echo '')"
DB_HOST_PORT="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=@)[^/]+')"
DB_HOST="$(echo "$DB_HOST_PORT" | cut -d: -f1)"
DB_PORT="$(echo "$DB_HOST_PORT" | grep -oP '(?<=:)\d+' || echo '5432')"
DB_NAME="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=/)[^?]+')"

# ---------------------------------------------------------------------------
# List mode: no argument provided
# ---------------------------------------------------------------------------
if [[ $# -eq 0 ]]; then
  echo "Available backups in s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/"
  echo ""
  aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/" \
    | sort -r \
    | head -20 \
    | awk '{print NR". "$NF}'
  echo ""
  echo "Usage: $0 <filename-from-list-above>"
  echo "  e.g. $0 db-2025-05-25T02-00-00Z.sql.gz"
  exit 0
fi

# ---------------------------------------------------------------------------
# Restore mode
# ---------------------------------------------------------------------------
TARGET="$1"

# Allow passing just the timestamp portion or the full filename
if [[ "$TARGET" != *".sql.gz" ]]; then
  TARGET="db-${TARGET}.sql.gz"
fi
S3_KEY="${S3_PREFIX}/${TARGET}"
S3_URI="s3://${BACKUP_S3_BUCKET}/${S3_KEY}"

echo ""
echo "⚠️  WARNING: This will DROP and RECREATE the database '${DB_NAME}' on ${DB_HOST}."
echo "Source: ${S3_URI}"
echo ""
read -r -p "Type the database name to confirm: " CONFIRM
if [[ "$CONFIRM" != "$DB_NAME" ]]; then
  echo "Aborted — name did not match."
  exit 1
fi

echo "Downloading and restoring..."
PGPASSWORD="$DB_PASS" aws s3 cp "$S3_URI" - \
  | gunzip \
  | PGPASSWORD="$DB_PASS" psql \
      --host="$DB_HOST" \
      --port="$DB_PORT" \
      --username="$DB_USER" \
      --dbname="$DB_NAME" \
      --no-password

echo ""
echo "✅ Restore complete from ${S3_URI}"
