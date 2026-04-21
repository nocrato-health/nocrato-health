#!/usr/bin/env bash
# ci-test.sh — roda testes da API com output mínimo (PASS/FAIL + resumo)
#
# Uso:
#   ./scripts/ci-test.sh                # todos os testes
#   ./scripts/ci-test.sh -- --testPathPattern=foo   # args extras passam pro jest
#
# Saída típica em branch verde: ~3 linhas (Test Suites, Tests, Time).
# Em caso de falha, mostra PASS/FAIL por suite + stack trace das falhas.
#
# Para debug detalhado use: pnpm --filter @nocrato/api test

set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Extra args passados pro jest (ex: --testPathPattern)
JEST_ARGS=()
if [[ "${1:-}" == "--" ]]; then
    shift
    JEST_ARGS=("$@")
fi

# Pipe pra awk: strip ANSI, filtrar ruído do Nest logger, manter só sinais relevantes
#
# Estratégia:
#  - PASS: omitido (resumo final já diz total)
#  - FAIL: sempre mostrado
#  - ● (descrição de teste que falhou): capturar até linha em branco
#  - Test Suites:/Tests:/Time: sempre mostrado
pnpm --filter @nocrato/api test --silent "${JEST_ARGS[@]}" 2>&1 | \
  sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' | \
  awk '
    # Filtrar logs ruidosos do Nest (RetryOnError, DEBUG, etc.)
    /\[Nest\] .*(WARN|DEBUG|LOG|ERROR) / { next }

    # Falhas — sempre mostradas com contexto
    /^FAIL / { print; next }

    # Descrição de teste que falhou: capturar até próxima linha em branco
    /^  ● / { capturing=1 }
    capturing && /^$/ { capturing=0; print; next }
    capturing { print; next }

    # Resumo final
    /^Test Suites:/ { print; next }
    /^Tests:/ { print; next }
    /^Time:/ { print; next }
  '

# Propaga o exit code do pnpm (pipefail)
exit ${PIPESTATUS[0]}
