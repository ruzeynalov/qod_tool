#!/bin/bash
# QOD PostgreSQL backup script
# Usage: ./backup.sh [backup_dir] [retention_days]

set -euo pipefail

BACKUP_DIR="${1:-/var/backups/qod}"
RETENTION_DAYS="${2:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/qod_${TIMESTAMP}.sql.gz"

DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-qod}"
DB_NAME="${PGDATABASE:-qod}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting backup of ${DB_NAME}..."

pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  --no-owner --no-privileges --clean --if-exists | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup saved to ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Rotate old backups
DELETED=$(find "${BACKUP_DIR}" -name "qod_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date)] Removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date)] Backup complete"
