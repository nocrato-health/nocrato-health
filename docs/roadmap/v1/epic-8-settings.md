---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 8: Configuracoes & Agente

| Field | Value |
|-------|-------|
| **Epic** | 8 |
| **Name** | Configuracoes & Agente |
| **Description** | Config do agente WhatsApp e settings do portal |
| **Dependencies** | EPIC 3 (Onboarding do Doutor) |
| **User Stories** | 3 |

> **Casos de teste:** [[test-cases/epic-8|Test Cases — Epic 8]]

---

## ✅ US-8.1: Como doutor, quero editar as configuracoes do meu agente

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/agent-settings
- [x] PATCH /api/v1/doctor/agent-settings { welcomeMessage?, personality?, faq?, appointmentRules?, bookingMode?, enabled? }
- [x] bookingMode: 'link' | 'chat' | 'both'
- [x] **Criterio:** Config salva, agente interno le via `agentSettingsService.findByTenant(tenantId)` no inicio de cada conversa

---

## ✅ US-8.2: Como doutor, quero editar meu perfil e horarios

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/profile
- [x] PATCH /api/v1/doctor/profile { name?, specialty?, phone?, workingHours?, timezone? }
- [x] PATCH /api/v1/doctor/profile/branding { primaryColor?, logoUrl? }
- [x] **Criterio:** Perfil atualizado

---

## ✅ US-8.3: [FRONTEND] Pagina de configuracoes

**Agentes:** `frontend` → `designer` → `qa`

- [x] routes/doctor/settings.tsx (4 seções em Tabs)
- [x] Secao 1: Dados do Doutor (nome, especialidade, telefone — CRM/email read-only)
- [x] Secao 2: Horarios de Trabalho (editor de intervalos por dia com toggle e multi-slot)
- [x] Secao 3: Branding (cor hex com color picker + preview, logo URL com preview)
- [x] Secao 4: Agente WhatsApp (boas-vindas, personalidade, FAQ, regras, bookingMode, enabled toggle)
- [x] **Criterio:** Todas configs editaveis e salvas — 5/5 CTs Playwright passando

---

## Links Relacionados

- [[flows/agent|Agente WhatsApp]]
- [[architecture/decisions|ADRs]]
