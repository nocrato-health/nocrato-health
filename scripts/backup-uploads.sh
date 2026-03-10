#!/usr/bin/env bash
# backup-uploads.sh — copia incremental dos uploads para /opt/backups/nocrato-uploads/
# Roda via cron às 03:00 diariamente. Log em /var/log/nocrato-backup.log
set -euo pipefail

SRC="/opt/nocrato-health-v2/uploads/"
DST="/opt/backups/nocrato-uploads/"
LOG="/var/log/nocrato-backup.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$DST"

echo "[$DATE] Iniciando backup: $SRC → $DST" >> "$LOG"
rsync -a --delete "$SRC" "$DST" >> "$LOG" 2>&1
echo "[$DATE] Backup concluído." >> "$LOG"
