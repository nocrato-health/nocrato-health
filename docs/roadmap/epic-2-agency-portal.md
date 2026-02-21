# EPIC 2: Portal da Agencia

| Field | Value |
|-------|-------|
| **Epic** | 2 |
| **Name** | Portal da Agencia |
| **Description** | Dashboard, gestao de doutores e colaboradores |
| **Dependencies** | EPIC 1 (Autenticacao & Convites) |
| **User Stories** | 5 |

---

## US-2.1: Como admin, quero ver o dashboard com metricas gerais

- [ ] GET /api/v1/agency/dashboard → { totalDoctors, activeDoctors, totalPatients, ... }
- [ ] modules/agency/agency.controller.ts
- [ ] **Criterio:** Retorna stats corretos

---

## US-2.2: Como admin, quero listar todos os doutores

- [ ] GET /api/v1/agency/doctors?page=1&limit=20&status=active
- [ ] Retorna lista paginada com: name, email, slug, CRM, specialty, status
- [ ] **Criterio:** Listagem com paginacao e filtro por status

---

## US-2.3: Como admin, quero ativar/desativar um doutor

- [ ] PATCH /api/v1/agency/doctors/:id/status { status: 'active' | 'inactive' }
- [ ] Se inativar: bloqueia novos agendamentos, consultas existentes mantem
- [ ] **Criterio:** Status muda, booking retorna "indisponivel" se inativo

---

## US-2.4: Como admin, quero listar e gerenciar colaboradores

- [ ] GET /api/v1/agency/members?page=1&limit=20
- [ ] PATCH /api/v1/agency/members/:id/status { status }
- [ ] **Criterio:** CRUD basico de membros

---

## US-2.5: [FRONTEND] Portal da agencia completo

- [ ] routes/agency/_layout.tsx (auth guard + sidebar)
- [ ] components/agency-sidebar.tsx (Dashboard, Doutores, Colaboradores)
- [ ] routes/agency/_layout/index.tsx (dashboard com cards de stats)
- [ ] routes/agency/_layout/doctors/index.tsx (lista + convidar + ativar/desativar)
- [ ] routes/agency/_layout/doctors/$doctorId.tsx (perfil read-only do doutor)
- [ ] routes/agency/_layout/members/index.tsx (lista colaboradores)
- [ ] **Criterio:** Fluxo completo no browser: login → dashboard → doutores → convidar
