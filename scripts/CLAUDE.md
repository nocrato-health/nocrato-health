# scripts/ — CLI wrappers para economizar contexto

## O que este diretório faz

Scripts shell que filtram e comprimem output de comandos comuns antes que cheguem ao Claude.
Inspirados no conceito do RTK (rtk-ai/rtk) — mas nativos ao projeto, sem dependência externa.

**Objetivo**: reduzir ruído em sessões longas sem perder capacidade de debug. Todos os scripts
são opt-in — os comandos originais continuam disponíveis.

## Scripts

| Script | Propósito | Output típico |
|---|---|---|
| `ci-test.sh` | Roda testes da API com filtro agressivo | 3 linhas (green) / stack trace (red) |
| `ci-check.sh` | Typecheck API + Web + testes API em sequência | ~7 linhas |
| `db-status.sh` | Contagem por tabela + última migration aplicada | ~18 linhas |

## Quando usar

- **Smoke check** (está verde?) → use o wrapper
- **Debug** (por que quebrou?) → use o comando cru (`pnpm test`, `pnpm typecheck`, etc.)

## Princípio

Filtragem agressiva por default, capacidade completa disponível explicitamente. Nunca substituir
comandos — sempre ADICIONAR opções.

## O que NÃO pertence aqui

- Scripts de build/deploy (pertence a `docker/` ou CI/CD)
- Scripts de migration (pertence a `apps/api/src/database/migrations/`)
- Scripts que modificam código-fonte ou dados em prod

## Como estender

Adicionar novo script `scripts/NOME.sh`:

1. Shebang `#!/usr/bin/env bash` + `set -eo pipefail` (ou `-uo` se lidar com args)
2. Cabeçalho com: propósito, uso, output esperado, fallback pra debug
3. `chmod +x scripts/NOME.sh`
4. Adicionar linha na tabela de "Comandos preferidos" no `CLAUDE.md` raiz
5. Adicionar linha na tabela deste arquivo
