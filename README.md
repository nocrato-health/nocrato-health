# Nocrato Health V2

Plataforma SaaS multi-tenant para gestão de consultórios médicos. Conecta uma agência (Nocrato) a doutores, automatizando agendamento via WhatsApp com um agente de IA interno.

> **V2** é um rebuild completo do V1 (protótipo), com modelagem de domínio correta, NestJS no backend, e foco em MVP para lançamento no mercado.

---

## Visão Geral

Nocrato Health oferece quatro superfícies para usuários distintos:

| Portal | Quem usa | Como acessa |
|--------|----------|-------------|
| **Agência** (`/agency`) | Staff Nocrato | Email + senha |
| **Doutor** (`/doctor`) | Cada médico parceiro | Convite por email + slug |
| **Paciente** (`/patient`) | Pacientes | Código de acesso (sem senha) |
| **Booking público** (`/book/:slug`) | Qualquer paciente | Link com token temporário |

O **agente WhatsApp** é um módulo interno do NestJS que recebe webhooks da Evolution API, processa mensagens com GPT-4o-mini (OpenAI), gerencia o estado de conversa no banco, e envia respostas de volta — sem dependência de ferramenta externa como N8N.

---

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS + TypeScript |
| Banco de dados | PostgreSQL 16 + Knex |
| Validação | Zod + nestjs-zod |
| Auth | JWT stateless (@nestjs/jwt + @nestjs/passport) |
| Email | Resend |
| Frontend | Vite + React 19 + TanStack Router + TanStack Query |
| UI | shadcn/ui + Tailwind CSS v4 |
| WhatsApp | Evolution API (Docker) |
| LLM (agente) | OpenAI SDK — gpt-4o-mini |
| Eventos internos | @nestjs/event-emitter (EventEmitter2) |
| Deploy | Hetzner CX22 + Docker Compose + Nginx |

---

## Estrutura do Monorepo

```
nocrato-health-v2/
├── CLAUDE.md                    # Contexto e protocolo para o Claude Code
├── README.md                    # Este arquivo
├── package.json                 # pnpm workspace root
├── turbo.json                   # Turborepo pipeline
│
├── apps/
│   ├── api/                     # Backend NestJS (porta 3000)
│   │   └── src/
│   │       ├── app.module.ts
│   │       ├── common/          # Guards, decorators, filters, pipes
│   │       │   ├── guards/      # JwtAuthGuard, RolesGuard, TenantGuard
│   │       │   └── decorators/  # @Roles, @CurrentUser, @TenantId
│   │       ├── database/        # Knex provider + migrations SQL
│   │       └── modules/
│   │           ├── auth/        # Login, refresh, forgot password
│   │           ├── invite/      # Convites (agency member + doctor + reset)
│   │           ├── tenant/      # Gestão de tenants
│   │           ├── doctor/      # Perfil + CRUD do doutor
│   │           ├── patient/     # Pacientes (CRUD + portal access)
│   │           ├── appointment/ # Consultas + lifecycle de status
│   │           ├── clinical/    # Notas clínicas
│   │           ├── document/    # Upload de documentos
│   │           ├── booking/     # Booking público (tokens + slots)
│   │           ├── event-log/   # Audit trail append-only
│   │           ├── conversation/# Estado de conversa WhatsApp (JSONB)
│   │           └── agent/       # Módulo WhatsApp (webhook + LLM + tools)
│   │
│   └── web/                     # Frontend React (porta 5173)
│       └── src/
│           ├── routes/
│           │   ├── agency/      # Portal da agência
│           │   ├── doctor/      # Portal do doutor
│           │   ├── patient/     # Portal do paciente
│           │   └── book/        # Booking público ($slug)
│           ├── components/      # shadcn/ui + componentes compartilhados
│           └── hooks/           # TanStack Query hooks por domínio
│
├── docker/
│   ├── docker-compose.dev.yml   # PostgreSQL + Evolution API (local)
│   └── docker-compose.prod.yml  # Produção (Hetzner)
│
└── docs/                        # Documentação completa (ver abaixo)
```

---

## Como rodar localmente

### Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### Setup

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir PostgreSQL e Evolution API
docker compose -f docker/docker-compose.dev.yml up -d

# 3. Configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edite apps/api/.env com suas chaves (JWT_SECRET, OPENAI_API_KEY, etc.)

# 4. Rodar migrations
pnpm --filter @nocrato/api migrate

# 5. Seed inicial (cria dados de exemplo + primeiro admin da agência)
pnpm --filter @nocrato/api seed

# 6. Subir backend e frontend em paralelo
pnpm dev
```

**URLs:**
- Backend: http://localhost:3000
- Swagger: http://localhost:3000/api/docs
- Frontend: http://localhost:5173

**Credenciais criadas pelo seed:**
| Portal | Email | Senha |
|--------|-------|-------|
| Agência (admin) | `admin@nocrato.com` | `admin123` |
| Doutor (demo) | `dr.ana@silva.com` | `Doctor123!` |

> Booking público demo: `http://localhost:5173/book/dr-ana-silva?token=seed-booking-token-0000000000000000000000000000000000000`

---

## Rodando testes

```bash
# Testes unitários (todos os apps)
pnpm test

# Testes unitários — só o backend
pnpm --filter @nocrato/api test

# Testes E2E com Playwright (requer frontend + backend rodando)
pnpm --filter @nocrato/web test:e2e

# Typecheck completo
pnpm typecheck
```

---

## Modelo de Domínio

```
NOCRATO (agência)
│
├── agency_members (staff Nocrato)
│   └── criam → invites → tenants
│
├── tenants (portal de cada doutor, isolado por tenant_id)
│   ├── doctors (1:1 com tenant)
│   ├── agent_settings (config do agente WhatsApp)
│   ├── patients (muitos por tenant)
│   │   ├── appointments (consultas com lifecycle de status)
│   │   │   └── clinical_notes (notas do médico, internas)
│   │   └── documents (prescrições, laudos — expostos ao paciente)
│   ├── booking_tokens (tokens temporários 24h para booking público)
│   ├── conversations (estado de conversa WhatsApp por phone)
│   └── event_log (audit trail append-only)
│
└── AGENTE (módulo interno NestJS)
    ├── Recebe webhooks da Evolution API
    ├── Processa com gpt-4o-mini (tool calling: list_slots, book_appointment, etc.)
    ├── Gerencia conversations no banco
    └── Emite eventos via EventEmitter2 → notifica pacientes
```

### Isolamento de Tenant

Todo dado de paciente pertence a **um único tenant** (portal de um doutor). Todas as queries em tabelas tenant-scoped usam `WHERE tenant_id = ?`, extraído do JWT via `@TenantId()` decorator — o tenant nunca vem do body do request.

---

## Fluxos Principais

### Agendamento via WhatsApp
```
Paciente manda msg → Evolution API → webhook → agent.controller
  → agent.service (busca contexto, chama GPT-4o-mini com tools)
  → tool: generate_booking_link → bookingService.generateToken()
  → whatsappService.sendText(link) → paciente abre /book/:slug?token=X
  → seleciona slot → POST /api/v1/public/booking/:slug/book
  → appointment criado → EventEmitter2 emite appointment.created
  → agente envia confirmação no WhatsApp
```

### Portal do Paciente
```
appointment.status → 'completed' (primeira vez)
  → EventEmitter2: appointment.status_changed
  → patient.service gera código único (ABC-1234-XYZ)
  → salva em patients.portal_access_code, portal_active = true
  → EventEmitter2: patient.portal_activated
  → agente envia código via WhatsApp
  → paciente acessa /patient/access → POST /api/v1/patient/portal/access { code }
  → retorna { patient, appointments, documents }
```

---

## Epics do Roadmap

| Epic | Nome | Status |
|------|------|--------|
| 0 | Fundação (monorepo, banco, NestJS bootstrap) | ✅ Concluído |
| 1 | Autenticação & Convites | ✅ Concluído |
| 2 | Portal da Agência | ✅ Concluído |
| 3 | Onboarding do Doutor | ✅ Concluído |
| 4 | Gestão de Pacientes | ✅ Concluído |
| 5 | Gestão de Consultas | ✅ Concluído |
| 6 | Notas Clínicas & Documentos | ✅ Concluído |
| 7 | Agendamento Público (Booking) | ✅ Concluído |
| 8 | Configurações & Agente | ✅ Concluído |
| 9 | Agente WhatsApp (Módulo Interno) | ✅ Concluído |
| 10 | Portal do Paciente | ✅ Concluído |
| 11 | Polish & Deploy | ✅ Concluído |

Detalhes em [`docs/roadmap/epics-overview.md`](docs/roadmap/epics-overview.md).

---

## Documentação

```
docs/
├── README.md                        # Índice da documentação
├── architecture/
│   ├── tech-stack.md                # Justificativas de cada tecnologia
│   ├── backend-structure.md         # Módulos NestJS, guards, decorators
│   ├── frontend-structure.md        # Rotas React, hooks, componentes
│   └── decisions.md                 # ADRs de decisões arquiteturais
├── database/
│   ├── schema.sql                   # DDL completo (fonte de verdade)
│   ├── entity-relationship.md       # Diagrama ER e relacionamentos
│   └── migrations.md                # Ordem e convenções das migrations
├── flows/
│   ├── auth-flows.md                # Login, refresh, forgot password, convites
│   ├── booking-flow.md              # Fluxo completo de agendamento
│   ├── appointment-lifecycle.md     # Máquina de estados das consultas
│   ├── patient-portal.md            # Portal read-only do paciente
│   └── agent.md                     # Módulo WhatsApp: LLM tools e eventos
├── roadmap/
│   ├── epics-overview.md            # Visão geral dos 12 epics
│   └── epic-{0-11}-*.md             # Detalhes de cada epic
├── security/
│   └── audit-report.md              # Relatório de auditoria de segurança (SEC-NN)
└── tech-debt.md                     # Débitos técnicos com prioridade (TD-NN)
```

---

## Variáveis de Ambiente (Backend)

```env
# Database
DATABASE_URL=postgresql://nocrato:password@localhost:5432/nocrato

# Auth
JWT_SECRET=<openssl rand -base64 64>
JWT_EXPIRES_IN=7d

# Email
RESEND_API_KEY=re_...

# WhatsApp (Evolution API)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=<evolution-key>
EVOLUTION_INSTANCE=nocrato
EVOLUTION_WEBHOOK_TOKEN=<token-para-validar-webhooks>

# AI — usado apenas no módulo agent/
OPENAI_API_KEY=sk-...

# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Para o Claude Code

Este projeto usa Claude Code como assistente de desenvolvimento. O arquivo [`CLAUDE.md`](CLAUDE.md) na raiz contém:

- O protocolo de trabalho (Docs First)
- Mapa completo de toda a documentação
- Restrições não-negociáveis do MVP
- Referência rápida para os agentes especializados em `.claude/agents/`

**Antes de qualquer implementação**, o Claude lê CLAUDE.md e o epic correspondente.
