# EPIC 10: Portal do Paciente

| Field | Value |
|-------|-------|
| **Epic** | 10 |
| **Name** | Portal do Paciente |
| **Description** | Portal read-only para pacientes acessarem suas informacoes |
| **Dependencies** | EPIC 9 (Agente WhatsApp - Modulo Interno), EPIC 5 (Gestão de Consultas) |
| **User Stories** | 3 |

---

## US-10.1: Como sistema, quero gerar codigo de acesso apos primeira consulta

- [ ] Requer que o EPIC 5 emita evento `appointment.status_changed` com `newStatus='completed'` ao marcar consulta como concluída
- [ ] Quando appointment.status → 'completed' e paciente nao tem portal_access_code:
  - Gera codigo unico (ex: "ABC-1234-XYZ")
  - Salva em patients.portal_access_code, portal_active = true
  - Emite evento patient.portal_activated
  - Agente interno envia codigo via WhatsApp (@OnEvent('patient.portal_activated'))
- [ ] **Criterio:** Codigo gerado automaticamente na primeira conclusao

---

## US-10.2: Como paciente, quero acessar meu portal com o codigo

- [ ] POST /api/v1/patient/portal/access { code }
- [ ] Retorna: { patient, appointments, documents }
  - `// clinicalNotes excluídas: registros internos do médico, não expostos ao paciente`
- [ ] Sem JWT — sessao stateless baseada no codigo
- [ ] **Criterio:** Acesso read-only funcional

---

## US-10.3: [FRONTEND] Portal do paciente

- [ ] routes/patient/access.tsx (form: digitar codigo)
- [ ] routes/patient/portal.tsx (perfil read-only)
  - [ ] Dados pessoais
  - [ ] Historico de consultas (status, datas)
  - [ ] Documentos (download)
- [ ] Design limpo, mobile-first
- [ ] **Criterio:** Paciente ve tudo, nao edita nada
