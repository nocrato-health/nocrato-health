# EPIC 4: Gestao de Pacientes

| Field | Value |
|-------|-------|
| **Epic** | 4 |
| **Name** | Gestao de Pacientes |
| **Description** | CRUD de pacientes no portal do doutor |
| **Dependencies** | EPIC 3 (Onboarding do Doutor) |
| **User Stories** | 5 |

---

## US-4.1: Como doutor, quero ver a lista dos meus pacientes ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/patients?page=1&search=Maria&status=active
- [x] Retorna: name, phone, email, source, status, created_at
- [x] **Criterio:** Listagem paginada com busca por nome/telefone
- [x] 21 testes (284/284 suite completa), cobertura 87.87%
- [x] Débito técnico: sanitização de `%`/`_` no search (baixo risco, MVP ok)

---

## US-4.2: Como doutor, quero ver o perfil completo de um paciente

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] GET /api/v1/doctor/patients/:id → patient + appointments + notes + documents
- [ ] **Criterio:** Retorna perfil completo com historico

---

## US-4.3: Como doutor, quero criar um paciente manualmente

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] POST /api/v1/doctor/patients { name, phone, cpf?, email?, dateOfBirth? }
- [ ] source = 'manual', valida phone unico por tenant
- [ ] **Criterio:** Paciente criado, phone unico enforced

---

## US-4.4: Como doutor, quero editar dados de um paciente

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] PATCH /api/v1/doctor/patients/:id { name?, phone?, cpf?, email?, status? }
- [ ] **Criterio:** Update funcional

---

## US-4.5: [FRONTEND] Paginas de pacientes

**Agentes:** `frontend` → `designer` → `qa`

- [ ] routes/doctor/_layout/patients/index.tsx (lista com cards + busca + filtro status)
- [ ] routes/doctor/_layout/patients/$patientId.tsx (perfil com tabs)
  - [ ] Tab Info: dados editaveis
  - [ ] Tab Consultas: historico de appointments
  - [ ] Tab Notas: notas clinicas
  - [ ] Tab Documentos: lista + upload
- [ ] **Criterio:** CRUD completo no browser
