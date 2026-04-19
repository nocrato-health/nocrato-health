#!/bin/bash
# nocrato-hook: session-start (SessionStart)
# Injeta contexto essencial na primeira mensagem da sessão.
# Lembra o Claude dos skills disponíveis e do protocolo ativo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Build context message
read -r -d '' CONTEXT <<'CONTEXT_END' || true
<session-context>
Skills ativos neste projeto (invocar via Skill tool quando o gatilho corresponder):

**Pré-implementação:** /brainstorm (design colaborativo), /plan (plano TDD detalhado), /assumptions (validar premissas), /test-cases (CTs de epic)
**Durante implementação:** /tdd (Red-Green-Refactor), /seed (capturar ideia tangencial)
**Pós-implementação:** /definition-of-done, /health-check, /code-review, /verify-sec-fix (se SEC-NN)
**Finalização:** /finish-branch (merge/PR/discard), /compact (resumo de continuação)
**Utilidade:** /intel-refresh (snapshot quantitativo), /writing-skills (criar/editar skills)

**Protocolo ativo:** Consultar CLAUDE.md seção "Ciclo de vida" antes de qualquer entrega.
**Regra de evidência:** Nunca afirmar que algo funciona sem rodar o comando e ver o output. Evidence before claims.
</session-context>
CONTEXT_END

# Escape for JSON
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

ESCAPED=$(escape_for_json "$CONTEXT")

printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$ESCAPED"

exit 0
