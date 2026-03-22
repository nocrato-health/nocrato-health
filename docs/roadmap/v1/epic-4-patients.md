---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 4: Gestao de Pacientes

| Field | Value |
|-------|-------|
| **Epic** | 4 |
| **Name** | Gestao de Pacientes |
| **Description** | CRUD de pacientes no portal do doutor |
| **Dependencies** | EPIC 3 (Onboarding do Doutor) |
| **User Stories** | 5 |

> **Casos de teste:** [[test-cases/epic-4|Test Cases — Epic 4]]

---

## US-4.1: Como doutor, quero ver a lista dos meus pacientes ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/patients?page=1&search=Maria&status=active
- [x] Retorna: name, phone, email, source, status, created_at
- [x] **Criterio:** Listagem paginada com busca por nome/telefone
- [x] 21 testes (284/284 suite completa), cobertura 87.87%
- [x] Sanitização de `%`/`_` no search implementada e testada

---

## US-4.2: Como doutor, quero ver o perfil completo de um paciente ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/patients/:id → patient + appointments + notes + documents
- [x] Retorna: `{ patient, appointments, clinicalNotes, documents }` com ordering por data DESC
- [x] NotFoundException para patient inexistente ou de outro tenant (sem vazar existência)
- [x] `cpf` e `portal_access_code` nunca selecionados; `portal_active` incluído
- [x] 17 testes novos (305/305 suite completa), cobertura 100%
- [x] **Criterio:** Retorna perfil completo com historico

---

## US-4.3: Como doutor, quero criar um paciente manualmente ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] POST /api/v1/doctor/patients { name, phone, cpf?, email?, dateOfBirth? }
- [x] source = 'manual' fixo, status = 'active' padrão
- [x] Phone único por tenant (UNIQUE INDEX idx_patients_tenant_phone) → 409 ConflictException
- [x] cpf e portal_access_code nunca expostos na resposta (.returning(PUBLIC_PATIENT_FIELDS))
- [x] 61 testes (366/366 suite completa), cobertura 100%
- [x] **Criterio:** Paciente criado, phone unico enforced

---

## US-4.4: Como doutor, quero editar dados de um paciente ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] PATCH /api/v1/doctor/patients/:id { name?, phone?, cpf?, email?, status? }
- [x] Patch parcial real: campos omitidos não sobrescrevem o banco
- [x] Body vazio rejeitado pelo schema Zod (`.refine()` — ao menos 1 campo obrigatório)
- [x] status aceita apenas 'active' | 'inactive'
- [x] Phone único por tenant → 409 ConflictException (reutiliza padrão US-4.3)
- [x] NotFoundException para patient inexistente ou de outro tenant (sem vazar existência)
- [x] cpf e portal_access_code nunca expostos na resposta (.returning(PUBLIC_PATIENT_FIELDS))
- [x] updated_at atualizado via knex.fn.now()
- [x] 13 testes novos (337/337 suite completa)
- [x] **Criterio:** Update funcional

---

## US-4.5: [FRONTEND] Paginas de pacientes ✅

**Agentes:** `frontend` → `designer` → `qa`

- [x] routes/doctor/patients/index.tsx (lista paginada com cards + busca + filtro status + dialog "Novo paciente")
- [x] routes/doctor/patients/$patientId.tsx (perfil com 4 tabs)
  - [x] Tab Info: dados editaveis com form + PATCH on save
  - [x] Tab Consultas: historico de appointments em ordem DESC
  - [x] Tab Notas: notas clinicas (lista read-only)
  - [x] Tab Documentos: lista de documentos
- [x] lib/queries/patients.ts — patientsQueryOptions, patientProfileQueryOptions, useCreatePatient, useUpdatePatient
- [x] components/ui/{dialog,select,tabs,skeleton}.tsx — implementacao propria (sem Radix UI)
- [x] lib/toast.ts + components/toast-container.tsx — sistema de toast via CustomEvent
- [x] 7/7 CTs Playwright passando (CT-45-01 a CT-45-07) — commit 0ad8985
- [x] **Criterio:** CRUD completo no browser

---

## Links Relacionados

- [[flows/patient-portal|Portal do Paciente]]
- [[architecture/decisions|ADRs]]
