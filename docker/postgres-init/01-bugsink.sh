#!/bin/bash
#
# 01-bugsink.sh — cria o banco e o usuário do Bugsink no Postgres existente.
#
# Executado automaticamente pelo entrypoint do postgres:16-alpine APENAS quando o
# volume de dados está vazio (primeira subida do container). Para ambientes que já
# têm o volume populado (dev/prod atual), rodar os comandos manualmente — ver
# docker/CLAUDE.md seção "Adicionar DB do Bugsink a um Postgres existente".
#
# Variáveis esperadas no ambiente do Postgres (passadas via compose):
#   POSTGRES_USER        — superuser já criado pelo entrypoint (ex: 'nocrato')
#   BUGSINK_DB_PASSWORD  — senha do user bugsink, vinda do .env
#
set -euo pipefail

if [ -z "${BUGSINK_DB_PASSWORD:-}" ]; then
  echo "❌ BUGSINK_DB_PASSWORD não definido — abortando init do Bugsink."
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<EOSQL
  CREATE USER bugsink WITH ENCRYPTED PASSWORD '${BUGSINK_DB_PASSWORD}';
  CREATE DATABASE bugsink OWNER bugsink;
  GRANT ALL PRIVILEGES ON DATABASE bugsink TO bugsink;
EOSQL

echo "✅ Banco bugsink criado com user bugsink."
