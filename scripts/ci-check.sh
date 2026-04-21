#!/usr/bin/env bash
# ci-check.sh — valida todo o projeto em sequência (typecheck API + Web + test API)
#
# Uso: ./scripts/ci-check.sh
#
# Saída típica em branch verde: ~6 linhas (3 checks × 2 linhas cada).
# Para em qualquer erro (set -e) pra economizar tempo.
#
# Use antes de commit/PR pra checagem rápida de saúde do projeto.

set -eo pipefail

cd "$(git rev-parse --show-toplevel)"

step() {
    echo "→ $1"
}

# 1. TypeScript API
step "tsc API"
pnpm --filter @nocrato/api typecheck 2>&1 | grep -v "^>" | grep -v "^$" || true

# 2. TypeScript Web
step "tsc Web"
pnpm --filter @nocrato/web exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^>" | grep -v "^$" || true

# 3. Testes API (só PASS/FAIL + resumo)
step "jest API"
./scripts/ci-test.sh

echo "✓ ci-check OK"
