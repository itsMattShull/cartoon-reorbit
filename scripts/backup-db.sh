#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — PostgreSQL → S3 backup (low resource, no temp files on disk)
# =============================================================================
# Pipes pg_dump directly through gzip into S3 so nothing is written locally.
# Schedule via system cron (not PM2) so it uses zero memory when idle.
#
# Required env vars (or set them in /etc/cartoon-reorbit-backup.env):
#   DATABASE_URL          postgresql://user:pass@host:port/dbname
#   BACKUP_S3_BUCKET      my-backups-bucket
#   AWS_ACCESS_KEY_ID     (IAM backup user key)
#   AWS_SECRET_ACCESS_KEY (IAM backup user secret)
#   AWS_DEFAULT_REGION    us-east-1   (or wherever your bucket lives)
#
# Optional env vars:
#   BACKUP_S3_PREFIX      backups/cartoon-reorbit  (default shown)
#   BACKUP_RETAIN_DAYS    30                        (days of local log retention)
#   BACKUP_LOG_FILE       /var/log/cartoon-reorbit-backup.log
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
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is not set}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is not set}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is not set}"
: "${AWS_DEFAULT_REGION:?AWS_DEFAULT_REGION is not set}"

# ---------------------------------------------------------------------------
# Config with sensible defaults
# ---------------------------------------------------------------------------
S3_PREFIX="${BACKUP_S3_PREFIX:-backups/cartoon-reorbit}"
LOG_FILE="${BACKUP_LOG_FILE:-/var/log/cartoon-reorbit-backup.log}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
S3_KEY="${S3_PREFIX}/db-${TIMESTAMP}.sql.gz"
S3_URI="s3://${BACKUP_S3_BUCKET}/${S3_KEY}"

# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

log "=== Backup started ==="
log "Target: ${S3_URI}"

# ---------------------------------------------------------------------------
# Parse DATABASE_URL → pg_dump friendly args
# e.g. postgresql://orbit_user:pass@localhost:5432/orbitdb
# ---------------------------------------------------------------------------
DB_URL="${DATABASE_URL}"
DB_PROTO="$(echo "$DB_URL" | grep -oP '^[^:]+(?=://)')"
DB_URL_NOSCHEME="${DB_URL#*://}"

DB_USER="$(echo "$DB_URL_NOSCHEME" | grep -oP '^[^:@]+(?=[:@])')"
DB_PASS="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=:)[^@]+(?=@)' || echo '')"
DB_HOST_PORT="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=@)[^/]+')"
DB_HOST="$(echo "$DB_HOST_PORT" | cut -d: -f1)"
DB_PORT="$(echo "$DB_HOST_PORT" | grep -oP '(?<=:)\d+' || echo '5432')"
DB_NAME="$(echo "$DB_URL_NOSCHEME" | grep -oP '(?<=/)[^?]+')"

log "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME} (user: ${DB_USER})"

# ---------------------------------------------------------------------------
# Dump → compress → upload in a single pipe (no disk write)
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
  | aws s3 cp - "$S3_URI" \
      --storage-class STANDARD_IA \
      --no-progress

log "Upload complete: ${S3_URI}"

# ---------------------------------------------------------------------------
# Trim old log file so it doesn't grow forever (keep last ~1000 lines)
# ---------------------------------------------------------------------------
if [[ -f "$LOG_FILE" ]]; then
  tail -n 1000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

log "=== Backup finished ==="
