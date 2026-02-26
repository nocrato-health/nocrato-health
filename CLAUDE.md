# CLAUDE.md — Nocrato Health V2

Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão. Ele define o contexto do projeto, o protocolo de trabalho, e as restrições que devem ser respeitadas em todas as interações.

---

## O que é este projeto

**Nocrato Health V2** é uma plataforma SaaS multi-tenant para gestão de consultórios médicos. É um rebuild completo do V1 (que era um protótipo de "vibe coding"), com modelagem de domínio correta e foco em MVP para dev solo.

**Contexto de negócio:**

- **Nocrato** (a agência) gerencia doutores via um portal interno
- Cada **doutor** tem um portal isolado (tenant) identificado por slug (ex: `dr-silva`)
- **Pacientes** são criados pelo agente WhatsApp e têm um portal read-only com código de acesso
- Um **agente WhatsApp interno** (módulo NestJS + Evolution API + gpt-4o-mini) orquestra agendamento e notificações
- Página pública de **booking** protegida por token temporário (24h)

---

## PROTOCOLO OBRIGATÓRIO — Leia antes de qualquer ação

### Regra principal: Docs First

**Toda decisão técnica que altere o design do sistema DEVE atualizar a documentação ANTES (ou junto) do código.**

A ordem correta é:

```
1. CLAUDE.md         ← atualizar se o protocolo ou contexto mudar
2. README.md         ← documentação geral do projeto
2. docs/             ← atualizar o doc relevante (schema, flow, roadmap, ADR)
3. .claude/agents/   ← atualizar o agente responsável pelo domínio, se necessário
4. Código            ← implementar
```

**Nunca implemente algo que contradiz a documentação sem atualizar a documentação primeiro.**

### Antes de qualquer sessão de implementação

1. **Acione um Explore agent** para pré-carregar o contexto da US sem poluir o contexto principal. O agente deve ler e resumir:
   - Epic da US em `docs/roadmap/epic-N-*.md` (critérios de aceitação da US específica)
   - Flow relevante em `docs/flows/` (se existir)
   - Tabelas envolvidas em `docs/database/schema.sql`
   - Módulos existentes na pasta correspondente em `apps/api/src/modules/`
   - Retornar resumo compacto (~80 linhas) com: critérios de aceitação, colunas relevantes, código reutilizável, dependências e conflitos
2. Verifique as dependências (quais epics devem estar completos antes)
3. Consulte o agente especializado em `.claude/agents/` para o domínio em questão
4. Consulte `.claude/prompt-engineering.md` para técnicas de PE antes de acionar subagentes de implementação

### Quando adicionar uma feature ou mudar o design

Pergunte-se:

- Isso afeta o schema? → atualizar `docs/database/schema.sql` + `entity-relationship.md` + `migrations.md`
- Isso afeta um fluxo? → atualizar o arquivo em `docs/flows/`
- Isso é uma decisão arquitetural nova? → adicionar ADR em `docs/architecture/decisions.md`
- Isso afeta o roadmap? → atualizar o epic correspondente
- Isso muda como um agente deve agir? → consultar `.claude/prompt-engineering.md` para verificar se alguma técnica deve ser adicionada/ajustada, depois atualizar `.claude/agents/{agente}.md`

---

## PROTOCOLO DE IMPLEMENTAÇÃO — Ciclo de vida de cada entrega

### Ciclo por User Story

Cada User Story segue este ciclo antes de ser marcada como concluída:

```
0. Explore agent   → pré-carrega contexto da US (retorna resumo compacto)
1. Implementar     (backend / frontend / dba / devops — conforme domínio)
2. Tech-lead revisa → aprova qualidade, padrões, segurança
3. QA testa        → roda testes automatizados + Playwright quando há UI
4. ✅ Atualizar docs afetadas → marcar no epic e avançar
```

**Nunca avançar para a próxima US ou Epic sem que o ciclo acima esteja completo.**

> **DoCDD mid-implementation**: se durante a codificação você descobrir que o escopo real diverge do documentado, **pare, atualize a documentação primeiro, depois continue**. Nunca deixe a implementação divergir silenciosamente da documentação — isso invalida o princípio Docs First para todas as sessões futuras.

### Aprovação multi-agente por tipo de entrega

| Tipo de entrega            | Agentes que devem revisar e aprovar           |
| -------------------------- | --------------------------------------------- |
| Módulo backend (NestJS)    | `backend` → `tech-lead` → `qa`                |
| Migration / Schema         | `dba` → `tech-lead`                           |
| Rota / componente frontend | `frontend` → `designer` → `qa` (Playwright)   |
| Fluxo end-to-end           | `backend` + `frontend` → `tech-lead` → `qa`   |
| Docker / infra             | `devops` → `tech-lead`                        |
| Decisão arquitetural       | `architect` → registrar ADR em `decisions.md` |

A implementação só avança quando **todos** os agentes responsáveis por aquela entrega aprovarem. Se qualquer agente levantar um problema, o problema é resolvido antes de prosseguir.

### Documentação de módulo (OBRIGATÓRIO)

**Ao criar qualquer módulo, pasta de app ou domínio novo, criar um `CLAUDE.md` na raiz daquele diretório.**

O `CLAUDE.md` de módulo deve conter:

- O que este módulo faz (responsabilidade única e escopo)
- Principais arquivos e o que cada um faz
- Regras de negócio específicas deste módulo
- Padrões e convenções adotados aqui
- O que **não** pertence a este módulo
- Como rodar / testar isoladamente

Exemplos de onde criar:

```
apps/api/src/modules/patients/CLAUDE.md
apps/api/src/modules/auth/CLAUDE.md
apps/api/src/common/CLAUDE.md
apps/api/src/database/CLAUDE.md
apps/web/src/routes/doctor/CLAUDE.md
apps/web/src/components/CLAUDE.md
```

O `CLAUDE.md` de módulo é a primeira coisa que qualquer agente deve ler antes de tocar naquele módulo.

### Protocolo de subagentes (Task tool)

Subagentes são invocados via **Task tool** — cada chamada cria um contexto isolado que é destruído ao término da tarefa. O contexto principal recebe apenas o resultado.

**Regras:**

1. **Sempre use Task tool** — nunca invoque um agente inline tentando simular seu comportamento no contexto principal
2. **O prompt deve ser autossuficiente** — inclua papel, contexto da US, arquivos relevantes e formato de output esperado. O subagente não tem acesso ao histórico desta conversa
3. **Peça output compacto** — revisões retornam veredito + issues; implementações retornam lista de arquivos criados. Nada além disso entra no contexto principal
4. **Quando delegar**: tarefas que leem 3+ arquivos, geram 500+ tokens de output, ou têm escopo isolado (revisão, testes, exploração de codebase)
5. **Quando não delegar**: edições pontuais em 1-2 arquivos, respostas curtas, tarefas que dependem do estado atual da conversa

Consulte `.claude/prompt-engineering.md` para a estratégia completa de delegação e técnicas de PE para prompts de Task.

### Testes E2E com Playwright (frontend)

O agente QA usa **Playwright via MCP** para executar testes E2E no browser real:

- Aplicável a toda User Story com interface interativa
- O QA roda o Playwright MCP, navega pelas telas e valida os critérios de aceitação
- A US só é aprovada se o Playwright confirmar o comportamento esperado no browser
- Em caso de falha: reportar screenshot + steps to reproduce antes de avançar

---

## Mapa da Documentação

### `docs/architecture/`

| Arquivo                 | Conteúdo                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `tech-stack.md`         | Stack tecnológica e justificativas (NestJS, Knex, React, etc.) |
| `backend-structure.md`  | Estrutura de módulos NestJS, guards, decorators, interceptors  |
| `frontend-structure.md` | Estrutura de rotas React, componentes, hooks, contexts         |
| `decisions.md`          | 15 ADRs documentando decisões arquiteturais e trade-offs       |

### `docs/database/`

| Arquivo                  | Conteúdo                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `schema.sql`             | DDL completo das 12 tabelas — fonte de verdade do schema      |
| `entity-relationship.md` | Diagrama ER, relacionamentos, modelo de isolamento por tenant |
| `migrations.md`          | Ordem das 14 migrations, DAG de dependências, índices         |

### `docs/flows/`

| Arquivo                    | Conteúdo                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| `auth-flows.md`            | Login agency, login doctor, refresh token, forgot password, convites |
| `booking-flow.md`          | Fluxo completo: agente gera token → paciente abre página → agenda    |
| `appointment-lifecycle.md` | Máquina de estados: scheduled → waiting → in_progress → completed    |
| `patient-portal.md`        | Geração de código de acesso, portal read-only, dados expostos        |
| `agent.md`                 | Módulo WhatsApp interno: webhook, LLM tools (OpenAI), EventEmitter2  |

### `docs/roadmap/`

| Arquivo                     | Conteúdo                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| `epics-overview.md`         | Visão geral dos 12 epics, grafo de dependências, checklist final |
| `epic-0-foundation.md`      | Setup monorepo, banco, guards, NestJS bootstrap                  |
| `epic-1-auth.md`            | Autenticação e convites                                          |
| `epic-2-agency-portal.md`   | Portal da agência                                                |
| `epic-3-onboarding.md`      | Wizard pós-convite do doutor                                     |
| `epic-4-patients.md`        | CRUD de pacientes                                                |
| `epic-5-appointments.md`    | Gestão de consultas e lifecycle                                  |
| `epic-6-clinical.md`        | Notas clínicas e documentos                                      |
| `epic-7-booking.md`         | Agendamento público (token + in-chat)                            |
| `epic-8-settings.md`        | Configurações do agente e do portal                              |
| `epic-9-events.md`          | Módulo NestJS do agente WhatsApp                                 |
| `epic-10-patient-portal.md` | Portal do paciente                                               |
| `epic-11-deploy.md`         | Polish, Swagger, seed, deploy Hetzner                            |

### `.claude/`

| Arquivo                 | Conteúdo                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `prompt-engineering.md` | Guia de quando aplicar cada técnica de PE nos agentes — **ler antes de editar qualquer agente** |

### `.claude/agents/`

| Agente         | Quando usar                                                  |
| -------------- | ------------------------------------------------------------ |
| `pm.md`        | Validar escopo, priorização MVP, user stories                |
| `architect.md` | Decisões de design de sistema, ADRs, trade-offs              |
| `tech-lead.md` | Revisão de código, padrões NestJS, TypeScript                |
| `backend.md`   | Implementação NestJS: módulos, services, controllers, guards |
| `dba.md`       | Schema SQL, migrations, índices, Knex queries                |
| `frontend.md`  | React, TanStack Router, TanStack Query, componentes          |
| `designer.md`  | Design system, Tailwind, shadcn/ui, design tokens            |
| `devops.md`    | Docker, Nginx, CI/CD, Hetzner, variáveis de ambiente         |
| `qa.md`        | Testes, critérios de aceitação, edge cases                   |

---

## Restrições não-negociáveis (MVP)

### Isolamento de tenant

- **Toda query em tabela tenant-scoped DEVE ter `WHERE tenant_id = ?`**
- O `tenant_id` é extraído do JWT via `@TenantId()` decorator — nunca aceitar tenant_id do body do request
- Tabelas tenant-scoped: `doctors`, `agent_settings`, `patients`, `appointments`, `clinical_notes`, `documents`, `event_log`, `booking_tokens`, `conversations`

### Autenticação separada

- Agency (`agency_members`) e Doctor (`doctors`) são domínios de auth separados
- JWTs com claims diferentes, endpoints de login separados
- Nunca misturar guards de agency com rotas de doctor

### Schema é imutável sem migration

- Qualquer mudança de schema EXIGE uma nova migration SQL em `docs/database/migrations/`
- Seguir o padrão: `{NNN}_{action}_{table}.sql`
- Atualizar `docs/database/schema.sql`, `migrations.md`, e `entity-relationship.md` junto

### Agente usa OpenAI (não Anthropic)

- O módulo `agent/` usa **OpenAI SDK com `gpt-4o-mini`** — barato, rápido para chatbot
- Tool calling no formato OpenAI: `{ type: 'function', function: { name, description, parameters } }`
- **Nunca usar Anthropic SDK no módulo agent/**

### clinicalNotes não são expostas ao paciente

- O portal do paciente retorna `{ patient, appointments, documents }` — **sem clinical_notes**
- Clinical notes são registros internos do médico

---

## Stack resumida

| Camada      | Tecnologia                                         |
| ----------- | -------------------------------------------------- |
| Monorepo    | pnpm workspaces + Turborepo                        |
| Backend     | NestJS + TypeScript + Knex + PostgreSQL 16         |
| Validação   | Zod + nestjs-zod                                   |
| Auth        | @nestjs/jwt + @nestjs/passport (JWT stateless)     |
| Email       | Resend                                             |
| Frontend    | Vite + React 19 + TanStack Router + TanStack Query |
| UI          | shadcn/ui + Tailwind CSS v4                        |
| WhatsApp    | Evolution API + módulo NestJS interno              |
| LLM (agent) | OpenAI SDK — gpt-4o-mini                           |
| Eventos     | @nestjs/event-emitter (EventEmitter2)              |
| Deploy      | Hetzner CX22 + Docker + Nginx                      |

---

## Estrutura do monorepo (quando o código existir)

```
nocrato-health-v2/
├── CLAUDE.md                  ← você está aqui
├── README.md                  ← visão geral para humanos
├── package.json               ← workspace root (pnpm)
├── turbo.json                 ← Turborepo config
├── docker/
│   ├── docker-compose.dev.yml ← PostgreSQL + Evolution API local
│   └── docker-compose.prod.yml
├── apps/
│   ├── api/                   ← NestJS backend
│   │   └── src/
│   │       ├── app.module.ts
│   │       ├── common/        ← guards, decorators, filters, pipes
│   │       ├── database/      ← Knex provider + migrations
│   │       └── modules/       ← auth, invite, tenant, doctor, patient, appointment...
│   └── web/                   ← React frontend
│       └── src/
│           ├── routes/        ← agency/, doctor/, patient/, book/
│           ├── components/    ← shadcn/ui + componentes customizados
│           └── hooks/         ← TanStack Query hooks
├── docs/                      ← documentação completa do projeto
└── .claude/
    └── agents/                ← agentes especializados do Claude Code
```

---

## Pontos de entrada por domínio

| Domínio          | Backend entry                          | Frontend entry              |
| ---------------- | -------------------------------------- | --------------------------- |
| Agency auth      | `POST /api/v1/agency/auth/login`       | `routes/agency/login.tsx`   |
| Doctor auth      | `POST /api/v1/doctor/auth/login`       | `routes/doctor/login.tsx`   |
| Booking público  | `GET /api/v1/public/booking/:slug/...` | `routes/book/$slug.tsx`     |
| Patient portal   | `POST /api/v1/patient/portal/access`   | `routes/patient/access.tsx` |
| WhatsApp webhook | `POST /api/v1/agent/webhook`           | — (interno)                 |

---

## O que está no MVP e o que não está

### MVP inclui

- Portal agência: login, dashboard, gestão de doutores, convites
- Portal doutor: onboarding, pacientes, consultas, notas, documentos, config agente
- Portal paciente: acesso via código, read-only
- Agendamento público: link com token + in-chat via agente
- Agente WhatsApp interno (Evolution API + gpt-4o-mini + EventEmitter2)
- Event log como audit trail
- Deploy em Hetzner com Docker + Nginx

### Deixado para V2 (não implementar no MVP)

- Agency acessar portal do doutor ("login as doctor")
- RBAC granular além de `agency_admin` / `agency_member` / `doctor`
- Pagamentos (gateway)
- Object storage S3/R2 (MVP usa disco local)
- WebSocket real-time (MVP usa polling 30s no frontend)
- CAPTCHA no booking
- Self-service doctor signup
- Row-Level Security (RLS) no PostgreSQL
- Redis para token blacklist ou event bus
