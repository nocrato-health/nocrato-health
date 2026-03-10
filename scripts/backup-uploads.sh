#!/usr/bin/env bash
# backup-uploads.sh — sincroniza uploads para Cloudflare R2 (nocrato-uploads-backup)
# Roda via cron às 03:00 diariamente. Log em /var/log/nocrato-backup.log
set -euo pipefail

SRC="/opt/nocrato-health-v2/uploads/"
R2_DST="r2:nocrato-uploads-backup"
LOG="/var/log/nocrato-backup.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Iniciando backup: $SRC → $R2_DST" >> "$LOG"
rclone sync "$SRC" "$R2_DST" --log-file="$LOG" --log-level INFO
echo "[$DATE] Backup concluído." >> "$LOG"
