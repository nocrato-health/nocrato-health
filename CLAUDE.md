# CLAUDE.md — Nocrato Health V2

Lido automaticamente pelo Claude Code. Define contexto, protocolo e restrições.

---

## O que é este projeto

**Nocrato Health V2** — SaaS multi-tenant para gestão de consultórios médicos. Rebuild do V1 com modelagem correta, MVP para dev solo.

- **Nocrato** (agência) gerencia doutores via portal interno
- Cada **doutor** tem portal isolado (tenant) por slug (ex: `dr-silva`)
- **Pacientes** criados pelo agente WhatsApp, portal read-only com código de acesso
- **Agente WhatsApp** interno (NestJS + Meta Cloud API + gpt-4o-mini) orquestra agendamento e notificações
- **Booking** público protegido por token temporário (24h)

---

## Skills autônomas — Gatilhos obrigatórios

| Skill | Comando | Ativar quando |
|---|---|---|
| Resumo de Continuação | `/compact` | Hook `context-monitor` avisa em 45% (warning) e 30% (critical) **ou** entrega concluída **ou** antes de trabalho novo complexo |
| Definition of Done | `/definition-of-done` | Ao final de **qualquer entrega de código** — antes do commit |
| Health Check | `/health-check` | Após **qualquer entrega de código** — antes do commit |
| Code Review | `/code-review` | **Ao criar ou atualizar qualquer PR** — obrigatório antes do merge |
| Casos de Teste | `/test-cases` | **Ao iniciar epic novo**, antes da primeira US |
| Assumptions | `/assumptions` | Antes de planejar US ambígua, bugfix sem causa raiz clara, migration destrutiva, refactor >3 módulos |
| Plant Seed | `/seed` | Ao surgir ideia tangencial "legal, mas não agora" — captura em `docs/seeds/` sem sair do fluxo |
| Verify Security Fix | `/verify-sec-fix` | Ao terminar implementação de um `SEC-NN` — antes de marcar `done` na auditoria |
| Intel Refresh | `/intel-refresh` | Início de sessão longa, após epic grande, ou antes de doc que cite números |
| Brainstorm | `/brainstorm` | Antes de features complexas (>3 arquivos ou design incerto) — explorar abordagens antes de codar |
| Plan | `/plan` | Após brainstorm aprovado — plano detalhado TDD com file paths e code blocks |
| TDD | `/tdd` | Durante implementação de qualquer feature ou bugfix — Red-Green-Refactor |
| Finish Branch | `/finish-branch` | Quando implementação termina — opções estruturadas pra merge/PR/discard |
| Writing Skills | `/writing-skills` | Ao criar ou editar skills — meta-skill de qualidade |

> **"Qualquer entrega de código"** = US, bugfix, TD, melhoria, refactor, hotfix, config. Se mudou arquivo sob `apps/` ou `docker/`, DoD + Health Check são obrigatórios.

### Hooks ativos (`.claude/hooks/`)

Registrados em `.claude/settings.json` — advisory, nunca bloqueiam execução.

| Hook | Evento | Função |
|---|---|---|
| `statusline-bridge.js` | Statusline | Grava `/tmp/claude-ctx-{session}.json` com métricas de contexto (sem renderizar statusline) |
| `context-monitor.js` | PostToolUse | Lê bridge file e injeta warning quando remaining ≤ 45% (warning) ou ≤ 30% (critical) |
| `prompt-guard.js` | PreToolUse Write/Edit | Scan por padrões de prompt injection em `.claude/**/*.md`, `CLAUDE.md`, `docs/architecture/decisions.md` |
| `validate-commit.sh` | PreToolUse Bash | Valida Conventional Commits em `git commit -m` (advisory) |
| `session-start.sh` | SessionStart | Injeta resumo de skills e protocolo no início de cada sessão |

---

## Docs First

**Toda decisão que altere o design DEVE atualizar a documentação ANTES (ou junto) do código.**

```
1. CLAUDE.md / docs/  → atualizar o doc relevante
2. .claude/agents/    → atualizar agente do domínio, se necessário
3. Código             → implementar
```

Checklist rápido — isso afeta:
- Schema? → `docs/database/schema.sql` + `entity-relationship.md` + `migrations.md`
- Fluxo? → `docs/flows/`
- Arquitetura? → ADR em `docs/architecture/decisions.md`
- Roadmap? → epic correspondente
- Débito técnico? → `docs/tech-debt.md`
- Ideia tangencial sem trigger imediato? → `docs/seeds/` via `/seed` (possibilidade futura, não TD)
- Estado quantitativo (contagens, métricas)? → `docs/intel/` via `/intel-refresh`
- Agente? → `.claude/agents/{agente}.md` (ver também `.claude/agent-prompt-template.md` antes de delegar)

---

## Protocolo de implementação

### Pré-trabalho

| Tipo | Escopo do Explore |
|------|-------------------|
| **User Story** | Epic doc + flow + schema + módulos envolvidos → resumo ~80 linhas |
| **Tech Debt** | TD no `tech-debt.md` + arquivos afetados + testes existentes → resumo ~40 linhas |
| **Bugfix / Hotfix** | Módulo afetado + testes que cobrem a área → resumo ~40 linhas |
| **Melhoria UX** | Componente + rotas afetadas → resumo ~40 linhas |
| **Refactor** | Módulo completo → resumo ~60 linhas |
| **Migration / Schema** | `schema.sql` + tabelas envolvidas → resumo ~30 linhas |
| **Config / Env / Lib update** | Arquivo afetado; sem Explore |
| **Docs only** | Sem Explore; sem agentes de implementação |

Regras adicionais:
- **Primeira US de epic novo:** acionar `/test-cases` antes de começar
- **US ambígua, migration destrutiva, bugfix sem causa raiz, refactor >3 módulos:** acionar `/assumptions` antes de planejar
- **Feature complexa (>3 arquivos ou design incerto):** acionar `/brainstorm` antes de codar — explorar abordagens com o usuário
- **Após brainstorm aprovado ou epic com >5 tasks:** acionar `/plan` — plano detalhado TDD com file paths e code blocks
- **Trabalho relacionado a SEC-NN:** acionar `/verify-sec-fix` após implementar, antes de marcar done
- Consultar agente em `.claude/agents/` para o domínio
- Consultar `.claude/agent-prompt-template.md` antes de acionar subagentes

### Branches

Push direto na main é proibido. Padrões:

| Tipo | Branch |
|------|--------|
| User Story | `feat/epic-N-us-X-descricao` |
| Tech Debt | `fix/td-NN-descricao` |
| Bugfix | `fix/descricao` |
| Hotfix (prod) | `hotfix/descricao` |
| Refactor | `refactor/descricao` |
| Migration | `feat/migration-descricao` |
| Docs | `docs/descricao` |
| Infra | `infra/descricao` |
| Lib update | `chore/update-lib-name` |

### Ciclo de vida

```
0. Explore agent       → pré-carrega contexto
0a. /assumptions       → se US ambígua, migration destrutiva ou bugfix sem causa raiz (ver tabela)
0b. /test-cases        → se primeira US de epic novo
0c. /brainstorm        → se feature complexa (>3 arquivos ou design incerto)
0d. /plan              → se brainstorm aprovado ou epic com múltiplas tasks
1. Branch              → git checkout -b <tipo>/descricao
2. Implementar         → agents em worktrees com /tdd (Red-Green-Refactor obrigatório)
3. Tech-lead revisa    → aprova qualidade, padrões, segurança
4. QA testa            → agent (backend) ou Playwright (frontend)
5. /verify-sec-fix     → se trabalho fechou item SEC-NN (antes do DoD)
6. /definition-of-done + /health-check
7. /finish-branch      → opções estruturadas: commit+PR, merge local, manter, descartar
8. /code-review        → obrigatório em todo PR
9. Merge + atualizar docs afetadas
9a. doc-verifier       → se mudou schema, migration, flow ou endpoint (valida docs vs código)
```

**Hooks automáticos** (não precisam de ação manual — disparam sozinhos):
- `session-start`: injeta resumo de skills e protocolo no início de cada sessão
- `context-monitor`: injeta warning em 45% e critical em 30% → você decide quando rodar `/compact`
- `prompt-guard`: alerta se conteúdo suspeito for escrito em docs protegidos
- `validate-commit`: advisory se commit message não seguir Conventional Commits

### Escala de rigor por tipo

| Tipo | Brainstorm | Plan | Explore | TDD | Worktrees | Tech-lead | QA | DoD+HC | /code-review | doc-verifier |
|------|-----------|------|---------|-----|-----------|-----------|-----|--------|--------------|--------------|
| User Story | se complexa | se >5 tasks | completo | sim | sim | sim | sim | sim | sim | se schema/flow |
| Tech Debt | — | — | focado | sim | sim (>3 arq) | sim | sim | sim | sim | se schema/flow |
| Bugfix (causa clara) | — | — | focado | sim | sim | sim | sim | sim | sim | — |
| Bugfix (causa incerta) | — | — | focado + `debugger` | sim | sim | sim | sim | sim | sim | — |
| Bugfix frontend | — | — | focado | sim | sim | sim | Playwright | sim | sim | — |
| Hotfix (prod) | — | — | focado | sim | sim | sim | sim | sim | sim | — |
| Melhoria UX | se design incerto | — | focado | sim | sim | sim | Playwright | sim | sim | — |
| Refactor | se >3 módulos | sim | completo | sim | sim | sim | sim | sim | sim | se renomeou |
| Migration / Schema | se destrutiva | — | focado | — | sim | sim (dba+tl) | — | sim | sim | **sim** |
| Config / Env | — | — | — | — | — | rev. rápida | — | sim | sim | — |
| Lib update | — | — | — | sim | se breaking | sim | regressão | sim | sim | — |
| Docs only | — | — | — | — | — | — | — | — | — | **sim** |
| **Fechamento de epic** | — | — | — | — | — | — | — | — | — | **sim** (audit) |

### Worktrees

Agents que escrevem código rodam em worktree isolado (`isolation: "worktree"`).
**Exceção:** mudanças em ≤3 arquivos sem risco de conflito paralelo podem rodar inline.
Tech-lead e security sempre rodam no contexto principal (só leem).

### Aprovação multi-agente

| Entrega | Pipeline de agentes |
|---------|---------------------|
| Backend (NestJS) | `/tdd` → `backend` → `tech-lead` → `qa` |
| Migration / Schema | `dba` → `tech-lead` |
| Frontend (React) | `frontend` → `designer` → `qa` (Playwright) |
| End-to-end | `backend` + `frontend` → `tech-lead` → `qa` |
| Docker / infra | `devops` → `tech-lead` |
| Decisão arquitetural | `/brainstorm` → `architect` → ADR em `decisions.md` |
| Feature complexa | `/brainstorm` → `/plan` → subagents por task → `tech-lead` → `qa` |
| Bug não-trivial | `debugger` (método científico 5 fases) → fix via agent de domínio |
| Auditoria de docs vs código | `doc-verifier` (read-only) |

> **Antes de delegar a qualquer agent**: consultar `.claude/agent-prompt-template.md` para checklist de base-da-worktree, escopo, restrições e formato do relatório esperado.

### Tech Debt workflow

TDs seguem o mesmo ciclo de vida, com ajustes:

1. **Ler o TD** em `docs/tech-debt.md` — entender causa, impacto e fix proposto
2. **Branch**: `fix/td-NN-descricao`
3. **Implementar** o fix (worktree se >3 arquivos)
4. **Atualizar `docs/tech-debt.md`**: mover para seção "Resolvidos" com commit ref
5. **Testes**: garantir que testes existentes passam + adicionar testes se o TD tinha gap
6. DoD + HC + commit + PR + /code-review

TDs podem ser agrupados em batch quando são relacionados (ex: cluster de timezone TD-01/12/14/27).

### Quando usar `debugger` vs agent de domínio direto

| Situação | Usar |
|----------|------|
| Stack trace claro, causa óbvia (typo, null, import errado) | `backend` ou `frontend` direto |
| Erro reproduzível mas causa incerta, múltiplos suspeitos | `debugger` → diagnóstico → depois `backend`/`frontend` para o fix |
| Teste flaky, comportamento intermitente | `debugger` (obrigatório) |
| Regressão sem commit óbvio | `debugger` (obrigatório) |

O `debugger` **não implementa o fix** — ele diagnostica. O fix é delegado ao agent de domínio com o diagnóstico como input.

### Regras de ouro

1. **QA é agente, não terminal** — invocar via Agent tool, não `npx jest` direto
2. **Frontend só via agents** — `frontend` → `designer` → `tech-lead` → Playwright. Sem exceção por tamanho
3. **CLAUDE.md em diretório novo** — criar antes do primeiro arquivo de código
4. **DoCDD mid-implementation** — se escopo diverge do doc, parar e atualizar doc primeiro
5. **Hooks são passivos** — não precisam de ação manual; disparam sozinhos via `settings.json`
6. **Skills são ativas** — precisam ser invocadas no momento certo do ciclo de vida (ver tabela de gatilhos)
7. **Evidence before claims** — nunca afirmar que testes passam, build compila, ou feature funciona sem rodar o comando e ver o output. "Deve funcionar" não é evidência
8. **TDD obrigatório** — Red-Green-Refactor. Teste falha primeiro, implementa mínimo, refatora. Escreveu código antes do teste? Deletar e recomeçar. Ver `/tdd`
9. **Design antes de código** — features complexas passam por `/brainstorm` antes de tocar em arquivo. Implementação sem design validado é retrabalho garantido
10. **Plano antes de execução** — tasks com >5 steps passam por `/plan`. Subagents recebem o plano, não a ideia vaga

---

## Restrições não-negociáveis

### Isolamento de tenant
- Toda query tenant-scoped DEVE ter `WHERE tenant_id = ?`
- `tenant_id` extraído do JWT via `@TenantId()` — nunca do body
- Tabelas: `doctors`, `agent_settings`, `patients`, `appointments`, `clinical_notes`, `documents`, `event_log`, `booking_tokens`, `conversations`

### Auth separada
- Agency (`agency_members`) e Doctor (`doctors`) são domínios distintos
- JWTs com claims diferentes, endpoints separados

### Schema imutável sem migration
- Mudança de schema → nova migration em `apps/api/src/database/migrations/`
- Atualizar `schema.sql` + `migrations.md` + `entity-relationship.md`

### Agente usa OpenAI
- Módulo `agent/` usa **OpenAI SDK com `gpt-4o-mini`** — nunca Anthropic SDK

### clinicalNotes não expostas ao paciente
- Portal paciente: `{ patient, appointments, documents }` — sem `clinical_notes`

---

## Comandos preferidos (economia de contexto)

Scripts em `scripts/` que filtram output pra economizar tokens sem perder capacidade de debug.
**Use os wrappers pra checagem rápida; use os comandos crus pra debug detalhado.**

| Situação | Use | Ao invés de | Ganho |
|---|---|---|---|
| Testes passam? (smoke check) | `./scripts/ci-test.sh` | `pnpm --filter @nocrato/api test` | ~95% menos linhas |
| Validação antes de commit/PR | `./scripts/ci-check.sh` | 3 comandos separados | ~85% menos linhas |
| Estado do banco local (contagens) | `./scripts/db-status.sh` | abrir psql manual | direto |
| Debug de teste específico | `pnpm test --testPathPattern=X` | — | (output completo intencional) |
| Stack trace de falha | `pnpm test` (sem silent) | — | (output completo intencional) |
| Ver último commit (mensagem completa) | `git log -1` | `git log --oneline -1` | (output completo intencional) |

**Regra de ouro**: quando a pergunta é "está funcionando?", use o script. Quando a pergunta é "por que quebrou?", use o comando cru.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS + TypeScript + Knex + PostgreSQL 16 |
| Validação | Zod + nestjs-zod |
| Auth | @nestjs/jwt + @nestjs/passport (JWT stateless) |
| Email | Resend |
| Frontend | Vite + React 19 + TanStack Router + TanStack Query |
| UI | shadcn/ui + Tailwind CSS v4 |
| WhatsApp | Meta Cloud API (oficial) + módulo NestJS interno |
| LLM (agent) | OpenAI SDK — gpt-4o-mini |
| Eventos | @nestjs/event-emitter (EventEmitter2) |
| Deploy | Hostinger VPS + Docker + Nginx |

---

## Estrutura do monorepo

```
nocrato-health-v2/
├── CLAUDE.md
├── apps/
│   ├── api/                   ← NestJS backend
│   │   └── src/
│   │       ├── common/        ← guards, decorators, filters, pipes
│   │       ├── database/      ← Knex provider + 20 migrations
│   │       └── modules/       ← 13 módulos de feature
│   └── web/                   ← React frontend
│       └── src/
│           ├── routes/        ← agency/, doctor/, patient/, book/
│           ├── components/    ← shadcn/ui + customizados
│           └── lib/           ← queries, auth store, utils
├── docker/                    ← compose dev + prod, Dockerfiles, nginx
├── docs/                      ← documentação completa
└── .claude/
    ├── agents/                ← 12 agentes (backend, frontend, dba, qa, tech-lead, designer, architect, pm, devops, security, debugger, doc-verifier)
    ├── hooks/                 ← 5 hooks (context-monitor, statusline-bridge, prompt-guard, validate-commit, session-start)
    ├── skills/                ← 14 skills (compact, definition-of-done, health-check, code-review, test-cases, seed, assumptions, verify-sec-fix, intel-refresh, brainstorm, plan, tdd, finish-branch, writing-skills)
    └── agent-prompt-template.md ← checklist canônico de delegação
```

## Pontos de entrada

| Domínio | Backend | Frontend |
|---------|---------|----------|
| Agency auth | `POST /api/v1/agency/auth/login` | `routes/agency/login.tsx` |
| Doctor auth | `POST /api/v1/doctor/auth/login` | `routes/doctor/login.tsx` |
| Booking | `GET /api/v1/public/booking/:slug/...` | `routes/book/$slug.tsx` |
| Patient portal | `POST /api/v1/patient/portal/access` | `routes/patient/access.tsx` |
| WhatsApp webhook (Cloud API) | `GET/POST /api/v1/agent/webhook/cloud` | — |
| WhatsApp connection | `POST /api/v1/doctor/whatsapp/connect-cloud` | `routes/doctor/whatsapp.tsx` |

---

## Mapa da documentação

| Diretório | Conteúdo |
|-----------|----------|
| `docs/guides/` | Setup dev, onboarding, VPS cheatsheet |
| `docs/architecture/` | Stack, estrutura backend/frontend, 15 ADRs |
| `docs/database/` | Schema DDL, ER diagram, 20 migrations |
| `docs/flows/` | Auth, booking, appointment lifecycle, patient portal, agent |
| `docs/roadmap/v1/` | 12 epics + test cases (MVP concluído) |
| `docs/security/` | Auditoria OWASP |
| `docs/tech-debt.md` | Registro de TDs com prioridade P1/P2/P3 |
| `docs/seeds/` | Ideias tangenciais com trigger — via `/seed` |
| `docs/intel/` | Snapshots quantitativos do estado do projeto — via `/intel-refresh` |
| `.claude/agents/` | 12 agentes especializados |
| `.claude/hooks/` | 4 hooks advisory (context, prompt-guard, statusline, commit-lint) |
| `.claude/skills/` | 14 skills com gatilhos definidos na tabela acima |
| `.claude/prompt-engineering.md` | Guia de PE — ler antes de editar agentes |
| `.claude/agent-prompt-template.md` | Checklist de delegação a subagents |

---

## MVP vs V2

### No MVP (concluído)
Portal agência, portal doutor (onboarding→consultas→notas→docs→config), portal paciente, booking público, agente WhatsApp, event log, deploy Docker+Nginx

### V2 (não implementar agora)
Login as doctor, RBAC granular, pagamentos, S3/R2, WebSocket, CAPTCHA, self-service signup, RLS, Redis
