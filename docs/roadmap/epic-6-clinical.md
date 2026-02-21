# EPIC 6: Notas Clinicas & Documentos

| Field | Value |
|-------|-------|
| **Epic** | 6 |
| **Name** | Notas Clinicas & Documentos |
| **Description** | Registros medicos vinculados a consultas e pacientes |
| **Dependencies** | EPIC 4 (Gestao de Pacientes) |
| **User Stories** | 5 |

---

## US-6.1: Como doutor, quero criar uma nota clinica durante/apos atendimento

- [ ] POST /api/v1/doctor/clinical-notes { appointmentId, patientId, content }
- [ ] Emite evento note.created no event_log (agente sabe)
- [ ] **Criterio:** Nota criada, evento emitido

---

## US-6.2: Como doutor, quero ver notas de um paciente ou consulta

- [ ] GET /api/v1/doctor/clinical-notes?appointmentId=X
- [ ] GET /api/v1/doctor/clinical-notes?patientId=X&page=1
- [ ] **Criterio:** Listagem por consulta e por paciente

---

## US-6.3: Como doutor, quero fazer upload de um documento para um paciente

- [ ] POST /api/v1/doctor/upload (multipart/form-data) → { fileUrl, fileName }
- [ ] Salva em ./uploads/{tenantId}/
- [ ] POST /api/v1/doctor/documents { patientId, appointmentId?, type, fileUrl, fileName, description? }
- [ ] type: 'prescription' | 'certificate' | 'exam' | 'other'
- [ ] **Criterio:** Upload + registro funcional

---

## US-6.4: Como doutor, quero listar documentos de um paciente

- [ ] GET /api/v1/doctor/documents?patientId=X&type=prescription&page=1
- [ ] **Criterio:** Listagem com filtro por tipo

---

## US-6.5: [FRONTEND] Notas e documentos

- [ ] Dialog/pagina para criar nota clinica (a partir da consulta)
- [ ] Tab "Notas" no perfil do paciente (ja criada no EPIC 4)
- [ ] Tab "Documentos" no perfil do paciente: lista + botao upload
- [ ] Dialog de upload (tipo, descricao, arquivo)
- [ ] **Criterio:** Criar nota, upload doc, ver nas tabs
