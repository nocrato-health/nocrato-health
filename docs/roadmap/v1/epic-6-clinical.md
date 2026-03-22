---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 6: Notas Clinicas & Documentos

| Field | Value |
|-------|-------|
| **Epic** | 6 |
| **Name** | Notas Clinicas & Documentos |
| **Description** | Registros medicos vinculados a consultas e pacientes |
| **Dependencies** | EPIC 4 (Gestao de Pacientes) |
| **User Stories** | 5 |

> **Casos de teste:** [[test-cases/epic-6|Test Cases — Epic 6]]

---

## ✅ US-6.1: Como doutor, quero criar uma nota clinica durante/apos atendimento

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] POST /api/v1/doctor/clinical-notes { appointmentId, patientId, content }
- [x] Emite evento note.created no event_log (agente sabe)
- [x] **Criterio:** Nota criada, evento emitido

---

## ✅ US-6.2: Como doutor, quero ver notas de um paciente ou consulta

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/clinical-notes?appointmentId=X
- [x] GET /api/v1/doctor/clinical-notes?patientId=X&page=1
- [x] **Criterio:** Listagem por consulta e por paciente

---

## ✅ US-6.3: Como doutor, quero fazer upload de um documento para um paciente

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] POST /api/v1/doctor/upload (multipart/form-data) → { fileUrl, fileName }
- [x] Salva em ./uploads/{tenantId}/ (basename sanitizado — sem path traversal)
- [x] POST /api/v1/doctor/documents { patientId, appointmentId?, type, fileUrl, fileName, description? }
- [x] type: 'prescription' | 'certificate' | 'exam' | 'other'
- [x] **Criterio:** Upload + registro funcional

---

## ✅ US-6.4: Como doutor, quero listar documentos de um paciente

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/documents?patientId=X&type=prescription&page=1
- [x] Filtro opcional por type (prescription|certificate|exam|other)
- [x] Paginação: page, limit (default 10, max 100); retorna `{ data[], pagination }`
- [x] Isolamento: WHERE tenant_id + patient_id — cross-tenant retorna data:[] sem 404
- [x] **Criterio:** Listagem com filtro por tipo

---

## ✅ US-6.5: [FRONTEND] Notas e documentos

**Agentes:** `frontend` → `designer` → `qa`

- [x] Dialog/pagina para criar nota clinica (a partir da consulta)
- [x] Tab "Notas" no perfil do paciente (ja criada no EPIC 4)
- [x] Tab "Documentos" no perfil do paciente: lista + botao upload
- [x] Dialog de upload (tipo, descricao, arquivo)
- [x] **Criterio:** Criar nota, upload doc, ver nas tabs

---

## Links Relacionados

- [[flows/appointment-lifecycle|Lifecycle de Consultas]]
- [[architecture/decisions|ADRs]]
