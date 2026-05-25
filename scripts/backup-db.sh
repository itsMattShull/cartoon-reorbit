#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — PostgreSQL → Google Drive backup (low resource, no disk writes)
# =============================================================================
# Pipes pg_dump directly through gzip into Google Drive via rclone rcat.
# Nothing is written to the server's disk. Schedule via system cron (not PM2)
# so it uses zero memory when idle.
#
# Required env vars (or set them in /etc/cartoon-reorbit-backup.env):
#   DATABASE_URL           postgresql://user:pass@host:port/dbname
#   BACKUP_DRIVE_REMOTE    gdrive          (name of your rclone remote)
#   BACKUP_DRIVE_FOLDER    cartoon-reorbit-backups  (Google Drive folder path)
#
# Optional env vars:
#   BACKUP_LOG_FILE        /var/log/cartoon-reorbit-backup.log
#   RCLONE_CONFIG          /root/.config/rclone/rclone.conf  (default location)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Load a secrets file if present (keeps creds out of the crontab line)
# ---------------------------------------------------------------------------
SECRETS_FILE="${SECRETS_FILE:-/etc/cartoon-reorbit-backup.env}"
if [[ -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$SECRETS_FILE"; set +a
fi

# ---------------------------------------------------------------------------
# Validate required variables
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_DRIVE_REMOTE:?BACKUP_DRIVE_REMOTE is not set (e.g. gdrive)}"
: "${BACKUP_DRIVE_FOLDER:?BACKUP_DRIVE_FOLDER is not set (e.g. cartoon-reorbit-backups)}"

# ---------------------------------------------------------------------------
# Config with sensible defaults
# ---------------------------------------------------------------------------
LOG_FILE="${BACKUP_LOG_FILE:-/var/log/cartoon-reorbit-backup.log}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DEST_FILE="db-${TIMESTAMP}.sql.gz"
DEST_PATH="${BACKUP_DRIVE_REMOTE}:${BACKUP_DRIVE_FOLDER}/${DEST_FILE}"

# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

log "=== Backup started ==="
log "Target: ${DEST_PATH}"

# ---------------------------------------------------------------------------
# Parse DATABASE_URL → pg_dump friendly args
# e.g. postgresql://orbit_user:pass@localhost:5432/orbitdb
# ---------------------------------------------------------------------------
DB_URL_NOSCHEME="${DATABASE_URL#*://}"
DB_USER="$(echo "$DB_URL_NOSCHEME" | grep -oP '^[^:@]+(?=[:@])')"
DB_PASS="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=:)[^@]+(?=@)' || echo '')"
DB_HOST_PORT="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=@)[^/]+')"
DB_HOST="$(echo "$DB_HOST_PORT" | cut -d: -f1)"
DB_PORT="$(echo "$DB_HOST_PORT" | grep -oP '(?<=:)\d+' || echo '5432')"
DB_NAME="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=/)[^?]+')"

log "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME} (user: ${DB_USER})"

# ---------------------------------------------------------------------------
# Dump → compress → upload in a single pipe (no disk write)
# rclone rcat reads from stdin and streams directly to Google Drive
# ---------------------------------------------------------------------------
PGPASSWORD="$DB_PASS" pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip --best \
  | rclone rcat "${DEST_PATH}" \
      --drive-chunk-size 32M \
      --no-check-certificate

log "Upload complete: ${DEST_PATH}"

# ---------------------------------------------------------------------------
# Trim old log file so it doesn't grow forever (keep last ~1000 lines)
# ---------------------------------------------------------------------------
if [[ -f "$LOG_FILE" ]]; then
  tail -n 1000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

log "=== Backup finished ==="
