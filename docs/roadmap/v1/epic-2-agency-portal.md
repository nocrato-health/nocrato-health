---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 2: Portal da Agencia

| Field | Value |
|-------|-------|
| **Epic** | 2 |
| **Name** | Portal da Agencia |
| **Description** | Dashboard, gestao de doutores e colaboradores |
| **Dependencies** | EPIC 1 (Autenticacao & Convites) |
| **User Stories** | 5 |

---

## US-2.1: Como admin, quero ver o dashboard com metricas gerais ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/agency/dashboard → { totalDoctors, activeDoctors, totalPatients, totalAppointments, upcomingAppointments }
- [x] modules/agency/agency.controller.ts + agency.service.ts + agency.module.ts
- [x] **Criterio:** Retorna stats corretos — 13 testes unitários, 149/149 passando
- [x] Tech-lead: APROVADO (OBS-TL-1: knex.fn.now() em WHERE aceito para MVP)

---

## US-2.2: Como admin, quero listar todos os doutores ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/agency/doctors?page=1&limit=20&status=active
- [x] Retorna lista paginada com: id, name, email, slug, crm, specialty, status, createdAt
- [x] **Criterio:** Listagem com paginacao e filtro por status — 25 testes, 174/174 passando
- [x] Tech-lead: APROVADO (OBS-TL-1: return type implícito aceitável MVP)

---

## US-2.3: Como admin, quero ativar/desativar um doutor ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] PATCH /api/v1/agency/doctors/:id/status { status: 'active' | 'inactive' }
- [x] Se inativar: campo `status` persistido; booking deve honrar ao ser implementado (Epic 7)
- [x] Apenas `agency_admin` pode mudar status (`@Roles` no método sobrescreve class-level)
- [x] NotFoundException (404) para id inexistente; 400 para body inválido via ZodValidationPipe
- [x] **Criterio:** Status muda, 14 testes unitários, 188/188 passando
- [x] Tech-lead: APROVADO (OBS-TL-1: select('id') eficiente; OBS-TL-2: terceiro status no futuro exige atualizar schema e Zod)
- [x] QA: APROVADO (188/188 testes, tsc limpo, todos edge cases cobertos)

---

## US-2.4: Como admin, quero listar e gerenciar colaboradores

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/agency/members?page=1&limit=20
- [x] PATCH /api/v1/agency/members/:id/status { status }
- [x] **Criterio:** CRUD basico de membros

---

## US-2.5: [FRONTEND] Portal da agencia completo ✅

**Agentes:** `frontend` → `designer` → `tech-lead` → `qa`

- [x] routes/agency/_layout.tsx (pathless layout route com auth guard beforeLoad + AgencySidebar)
- [x] components/agency-sidebar.tsx (Dashboard, Doutores, Colaboradores + logout)
- [x] routes/agency/_layout/index.tsx (dashboard com 5 cards de stats via TanStack Query)
- [x] routes/agency/_layout/doctors/index.tsx (lista paginada + filtro status + modal convite + ativar/desativar)
- [x] routes/agency/_layout/members/index.tsx (lista paginada + filtro status + ativar/desativar)
- [x] components/status-badge.tsx, components/pagination-controls.tsx
- [x] lib/queries/agency.ts (dashboardQueryOptions, doctorsQueryOptions, membersQueryOptions, mutations)
- [x] apps/web/playwright.config.ts + e2e/agency.spec.ts (4 testes E2E)
- [x] **Bugfix incluso:** removido prefixo duplicado api/v1 de 4 controllers (agency, agency-auth, doctor-auth, invite)
- [x] N/A routes/agency/_layout/doctors/$doctorId.tsx — perfil read-only adiado para US posterior (sem dados adicionais de doutor no backend ainda)
- [x] **Criterio:** Fluxo completo no browser validado por Playwright 4/4: redirect unauthenticated → login → dashboard → doutores
- [x] Frontend agent: APROVADO (773 linhas, tsc limpo)
- [x] Designer: APROVADO (5 correções: border ativo amber-bright, bg-amber-dark token, empty states gray-400)
- [x] Tech-lead: APROVADO (tsc zero erros strict mode, OBS-TL-1: hook por linha — irrelevante com limit:10)
- [x] QA Playwright: APROVADO (4/4 testes, 5.7s)
- [x] Health check: SAUDÁVEL (TS API ✅, TS Web ✅, 227/227 ✅, sem console.log, CLAUDE.md ok)

---

## Links Relacionados

- [[flows/auth-flows|Fluxo de Autenticação]]
- [[architecture/decisions|ADRs]]
