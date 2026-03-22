---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 10: Portal do Paciente

| Field | Value |
|-------|-------|
| **Epic** | 10 |
| **Name** | Portal do Paciente |
| **Description** | Portal read-only para pacientes acessarem suas informacoes |
| **Dependencies** | EPIC 9 (Agente WhatsApp - Modulo Interno), EPIC 5 (Gestão de Consultas) |
| **User Stories** | 3 |

> **Casos de teste:** [[test-cases/epic-10|Test Cases — Epic 10]]

---

## US-10.1: Como sistema, quero gerar codigo de acesso apos primeira consulta ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] Requer que o EPIC 5 emita evento `appointment.status_changed` com `newStatus='completed'` ao marcar consulta como concluída
- [x] Quando appointment.status → 'completed' e paciente nao tem portal_access_code:
  - Gera codigo unico (ex: "ABC-1234-XYZ")
  - Salva em patients.portal_access_code, portal_active = true
  - Emite evento patient.portal_activated (actor_type='system', actor_id=null)
  - Agente interno envia codigo via WhatsApp (@OnEvent('patient.portal_activated'))
- [x] **Criterio:** Codigo gerado automaticamente na primeira conclusao

---

## US-10.2: Como paciente, quero acessar meu portal com o codigo ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] POST /api/v1/patient/portal/access { code }
- [x] Retorna: { patient, doctor, tenant, appointments, documents }
  - `// clinicalNotes excluídas: registros internos do médico, não expostos ao paciente`
- [x] Sem JWT — sessao stateless baseada no codigo
- [x] GET /api/v1/patient/portal/documents/:id?code=... — proxy de download com validação de código
- [x] **Criterio:** Acesso read-only funcional

---

## US-10.3: [FRONTEND] Portal do paciente ✅

**Agentes:** `frontend` → `designer` → `qa`

- [x] routes/patient/access.tsx (form: digitar codigo)
- [x] routes/patient/portal.tsx (perfil read-only)
  - [x] Dados pessoais
  - [x] Historico de consultas (status, datas)
  - [x] Documentos (download)
- [x] Design limpo, mobile-first
- [x] **Criterio:** Paciente ve tudo, nao edita nada

---

## Links Relacionados

- [[flows/patient-portal|Portal do Paciente]]
- [[architecture/decisions|ADRs]]
