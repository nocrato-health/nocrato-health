# EPIC 8: Configuracoes & Agente

| Field | Value |
|-------|-------|
| **Epic** | 8 |
| **Name** | Configuracoes & Agente |
| **Description** | Config do agente WhatsApp e settings do portal |
| **Dependencies** | EPIC 3 (Onboarding do Doutor) |
| **User Stories** | 3 |

---

## US-8.1: Como doutor, quero editar as configuracoes do meu agente

- [ ] GET /api/v1/doctor/agent-settings
- [ ] PATCH /api/v1/doctor/agent-settings { welcomeMessage?, personality?, faq?, appointmentRules?, bookingMode?, enabled? }
- [ ] bookingMode: 'link' | 'chat' | 'both'
- [ ] **Criterio:** Config salva, agente interno le via `agentSettingsService.findByTenant(tenantId)` no inicio de cada conversa

---

## US-8.2: Como doutor, quero editar meu perfil e horarios

- [ ] GET /api/v1/doctor/profile
- [ ] PATCH /api/v1/doctor/profile { name?, specialty?, phone?, workingHours?, timezone? }
- [ ] PATCH /api/v1/doctor/profile/branding { primaryColor?, logoUrl? }
- [ ] **Criterio:** Perfil atualizado

---

## US-8.3: [FRONTEND] Pagina de configuracoes

- [ ] routes/doctor/_layout/settings/index.tsx
- [ ] Secao 1: Dados do Doutor (nome, CRM, especialidade, telefone)
- [ ] Secao 2: Horarios de Trabalho (editor de intervalos por dia)
- [ ] Secao 3: Branding (cor, logo)
- [ ] Secao 4: Agente WhatsApp (boas-vindas, personalidade, FAQ, modo booking)
- [ ] **Criterio:** Todas configs editaveis e salvas
