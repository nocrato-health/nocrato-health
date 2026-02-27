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

## US-2.3: Como admin, quero ativar/desativar um doutor

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] PATCH /api/v1/agency/doctors/:id/status { status: 'active' | 'inactive' }
- [ ] Se inativar: bloqueia novos agendamentos, consultas existentes mantem
- [ ] **Criterio:** Status muda, booking retorna "indisponivel" se inativo

---

## US-2.4: Como admin, quero listar e gerenciar colaboradores

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] GET /api/v1/agency/members?page=1&limit=20
- [ ] PATCH /api/v1/agency/members/:id/status { status }
- [ ] **Criterio:** CRUD basico de membros

---

## US-2.5: [FRONTEND] Portal da agencia completo

**Agentes:** `frontend` → `designer` → `qa`

- [ ] routes/agency/_layout.tsx (auth guard + sidebar)
- [ ] components/agency-sidebar.tsx (Dashboard, Doutores, Colaboradores)
- [ ] routes/agency/_layout/index.tsx (dashboard com cards de stats)
- [ ] routes/agency/_layout/doctors/index.tsx (lista + convidar + ativar/desativar)
- [ ] routes/agency/_layout/doctors/$doctorId.tsx (perfil read-only do doutor)
- [ ] routes/agency/_layout/members/index.tsx (lista colaboradores)
- [ ] **Criterio:** Fluxo completo no browser: login → dashboard → doutores → convidar
