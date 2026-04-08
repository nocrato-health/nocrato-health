#!/usr/bin/env bash
#
# setup-test-db.sh — cria o banco nocrato_health_test (se não existir)
# e aplica todas as migrations. Idempotente: rodar várias vezes é seguro.
#
# Pré-requisitos:
#   - docker-compose dev rodando (nocrato_postgres up)
#   - .env.test existente na raiz do monorepo com E2E_THROTTLE_BYPASS_SECRET
#
# Uso:
#   pnpm test:e2e:setup
#   # ou diretamente:
#   bash scripts/setup-test-db.sh

set -euo pipefail

CONTAINER=nocrato_postgres
DB_USER=nocrato
DB_NAME=nocrato_health_test

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "❌ Container '${CONTAINER}' não está rodando."
  echo "   Suba com: docker compose -f docker/docker-compose.dev.yml up -d"
  exit 1
fi

if ! docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  echo "📦 Criando banco ${DB_NAME}..."
  docker exec "${CONTAINER}" createdb -U "${DB_USER}" "${DB_NAME}"
else
  echo "✅ Banco ${DB_NAME} já existe."
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -f "${ROOT_DIR}/.env.test" ]; then
  echo "❌ ${ROOT_DIR}/.env.test não encontrado."
  echo "   Copie de .env.test.example e gere o secret:"
  echo "     cp .env.test.example .env.test"
  echo "     echo \"E2E_THROTTLE_BYPASS_SECRET=\$(openssl rand -hex 16)\" >> .env.test"
  exit 1
fi

echo "🔄 Aplicando migrations em ${DB_NAME}..."
pnpm --filter @nocrato/api migrate:test

echo "✅ Banco de teste pronto."
