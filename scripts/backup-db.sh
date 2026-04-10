#!/usr/bin/env bash
# backup-db.sh — pg_dump criptografado com GPG (LGPD fase 0)
#
# Fluxo:
#   1. pg_dump (custom format, comprimido) do container postgres
#   2. Criptografa com GPG (simétrica, AES-256, passphrase do env)
#   3. Armazena em $BACKUP_DIR com timestamp
#   4. Remove backups diários > 7 dias e semanais > 4 semanas
#
# Configurar via cron no host:
#   0 2 * * * /opt/nocrato-health-v2/scripts/backup-db.sh >> /var/log/nocrato-db-backup.log 2>&1
#
# Variáveis obrigatórias (exportar no cron ou no .env do host):
#   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME — credenciais do PostgreSQL
#   BACKUP_GPG_PASSPHRASE — chave simétrica para GPG (nunca a mesma do DOCUMENT_ENCRYPTION_KEY)
#
# Restaurar:
#   gpg --decrypt --batch --passphrase "$BACKUP_GPG_PASSPHRASE" backup.dump.gpg > backup.dump
#   pg_restore -h localhost -U nocrato -d nocrato_health backup.dump

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

BACKUP_DIR="${BACKUP_DIR:-/opt/nocrato-backups/db}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
RETENTION_DAILY=7    # manter backups diários dos últimos 7 dias
RETENTION_WEEKLY=28  # manter 1 backup por semana dos últimos 28 dias (4 semanas)

# Validar variáveis obrigatórias
for var in DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME BACKUP_GPG_PASSPHRASE; do
  if [[ -z "${!var:-}" ]]; then
    echo "$LOG_PREFIX ERRO: variável $var não definida. Abortando." >&2
    exit 1
  fi
done

# ─── Diretórios ──────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

# ─── Dump ────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
DUMP_FILE="$BACKUP_DIR/daily/nocrato_${TIMESTAMP}.dump"
GPG_FILE="${DUMP_FILE}.gpg"

echo "$LOG_PREFIX Iniciando pg_dump..."

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -Fc \
  -Z 6 \
  --no-owner \
  --no-privileges \
  -f "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "$LOG_PREFIX pg_dump concluído: $DUMP_FILE ($DUMP_SIZE)"

# ─── Criptografia GPG ───────────────────────────────────────────────────────

echo "$LOG_PREFIX Criptografando com GPG (AES-256)..."

gpg --symmetric \
  --cipher-algo AES256 \
  --batch \
  --yes \
  --passphrase "$BACKUP_GPG_PASSPHRASE" \
  --output "$GPG_FILE" \
  "$DUMP_FILE"

# Remover dump plaintext imediatamente
rm -f "$DUMP_FILE"

GPG_SIZE=$(du -h "$GPG_FILE" | cut -f1)
echo "$LOG_PREFIX Backup criptografado: $GPG_FILE ($GPG_SIZE)"

# ─── Cópia semanal (domingos) ───────────────────────────────────────────────

DOW=$(date '+%u')  # 1=segunda, 7=domingo
if [[ "$DOW" == "7" ]]; then
  WEEKLY_FILE="$BACKUP_DIR/weekly/nocrato_week_${TIMESTAMP}.dump.gpg"
  cp "$GPG_FILE" "$WEEKLY_FILE"
  echo "$LOG_PREFIX Cópia semanal criada: $WEEKLY_FILE"
fi

# ─── Retenção ────────────────────────────────────────────────────────────────

echo "$LOG_PREFIX Aplicando política de retenção..."

# Diários: remover > RETENTION_DAILY dias
find "$BACKUP_DIR/daily" -name "*.dump.gpg" -mtime +"$RETENTION_DAILY" -delete -print | \
  while read -r f; do echo "$LOG_PREFIX Removido (diário expirado): $f"; done

# Semanais: remover > RETENTION_WEEKLY dias
find "$BACKUP_DIR/weekly" -name "*.dump.gpg" -mtime +"$RETENTION_WEEKLY" -delete -print | \
  while read -r f; do echo "$LOG_PREFIX Removido (semanal expirado): $f"; done

# ─── Fim ─────────────────────────────────────────────────────────────────────

echo "$LOG_PREFIX Backup completo. Retenção: ${RETENTION_DAILY}d diário, ${RETENTION_WEEKLY}d semanal."
