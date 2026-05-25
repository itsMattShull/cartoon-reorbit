#!/usr/bin/env bash
# =============================================================================
# restore-db.sh — Restore a PostgreSQL backup from Google Drive
# =============================================================================
# Usage:
#   ./scripts/restore-db.sh                        # list available backups
#   ./scripts/restore-db.sh <filename-or-timestamp> # restore a specific backup
#
# The script will prompt for confirmation before touching the database.
# =============================================================================

set -euo pipefail

SECRETS_FILE="${SECRETS_FILE:-/etc/cartoon-reorbit-backup.env}"
if [[ -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$SECRETS_FILE"; set +a
fi

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_DRIVE_REMOTE:?BACKUP_DRIVE_REMOTE is not set (e.g. gdrive)}"
: "${BACKUP_DRIVE_FOLDER:?BACKUP_DRIVE_FOLDER is not set (e.g. cartoon-reorbit-backups)}"

# Parse DATABASE_URL
DB_URL_NOSCHEME="${DATABASE_URL#*://}"
DB_USER="$(echo "$DB_URL_NOSCHEME" | grep -oP '^[^:@]+(?=[:@])')"
DB_PASS="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=:)[^@]+(?=@)' || echo '')"
DB_HOST_PORT="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=@)[^/]+')"
DB_HOST="$(echo "$DB_HOST_PORT" | cut -d: -f1)"
DB_PORT="$(echo "$DB_HOST_PORT" | grep -oP '(?<=:)\d+' || echo '5432')"
DB_NAME="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=/)[^?]+')"

REMOTE_PATH="${BACKUP_DRIVE_REMOTE}:${BACKUP_DRIVE_FOLDER}"

# ---------------------------------------------------------------------------
# List mode: no argument provided
# ---------------------------------------------------------------------------
if [[ $# -eq 0 ]]; then
  echo "Available backups in ${REMOTE_PATH}/"
  echo ""
  rclone ls "${REMOTE_PATH}/" \
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
SOURCE="${REMOTE_PATH}/${TARGET}"

echo ""
echo "⚠️  WARNING: This will overwrite the database '${DB_NAME}' on ${DB_HOST}."
echo "Source: ${SOURCE}"
echo ""
read -r -p "Type the database name to confirm: " CONFIRM
if [[ "$CONFIRM" != "$DB_NAME" ]]; then
  echo "Aborted — name did not match."
  exit 1
fi

echo "Downloading and restoring..."
rclone cat "${SOURCE}" \
  | gunzip \
  | PGPASSWORD="$DB_PASS" psql \
      --host="$DB_HOST" \
      --port="$DB_PORT" \
      --username="$DB_USER" \
      --dbname="$DB_NAME" \
      --no-password

echo ""
echo "✅ Restore complete from ${SOURCE}"
