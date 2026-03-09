# EPIC 10: Portal do Paciente

| Field | Value |
|-------|-------|
| **Epic** | 10 |
| **Name** | Portal do Paciente |
| **Description** | Portal read-only para pacientes acessarem suas informacoes |
| **Dependencies** | EPIC 9 (Agente WhatsApp - Modulo Interno), EPIC 5 (Gestão de Consultas) |
| **User Stories** | 3 |

> **Casos de teste:** [docs/test-cases/epic-10.md](../test-cases/epic-10.md)

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

## US-10.2: Como paciente, quero acessar meu portal com o codigo

**Agentes:** `backend` → `tech-lead` → `qa`

- [ ] POST /api/v1/patient/portal/access { code }
- [ ] Retorna: { patient, appointments, documents }
  - `// clinicalNotes excluídas: registros internos do médico, não expostos ao paciente`
- [ ] Sem JWT — sessao stateless baseada no codigo
- [ ] **Criterio:** Acesso read-only funcional

---

## US-10.3: [FRONTEND] Portal do paciente

**Agentes:** `frontend` → `designer` → `qa`

- [ ] routes/patient/access.tsx (form: digitar codigo)
- [ ] routes/patient/portal.tsx (perfil read-only)
  - [ ] Dados pessoais
  - [ ] Historico de consultas (status, datas)
  - [ ] Documentos (download)
- [ ] Design limpo, mobile-first
- [ ] **Criterio:** Paciente ve tudo, nao edita nada
