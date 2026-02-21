# EPIC 3: Onboarding do Doutor

| Field | Value |
|-------|-------|
| **Epic** | 3 |
| **Name** | Onboarding do Doutor |
| **Description** | Wizard pos-convite para configurar o portal do doutor |
| **Dependencies** | EPIC 1 (Autenticacao & Convites) |
| **User Stories** | 2 |

---

## US-3.1: Como doutor recem-convidado, quero completar meu onboarding

- [ ] GET /api/v1/doctor/onboarding/status → { currentStep, completed }
- [ ] PATCH /api/v1/doctor/onboarding/profile { name, specialty, phone, CRM, crmState }
- [ ] PATCH /api/v1/doctor/onboarding/schedule { workingHours, timezone, appointmentDuration }
- [ ] PATCH /api/v1/doctor/onboarding/branding { primaryColor, logoUrl }
- [ ] PATCH /api/v1/doctor/onboarding/agent { welcomeMessage, personality, faq }
- [ ] POST /api/v1/doctor/onboarding/complete → marca onboarding_completed = true
- [ ] **Criterio:** 4 steps, cada um salva dados, ultimo ativa o portal

---

## US-3.2: [FRONTEND] Wizard de onboarding

- [ ] routes/doctor/_layout/onboarding.tsx (wizard 4 steps com progress bar)
- [ ] Step 1: Perfil (nome, CRM, especialidade, telefone)
- [ ] Step 2: Horarios (dias da semana, intervalos, timezone, duracao padrao)
- [ ] Step 3: Branding (cor primaria, upload logo)
- [ ] Step 4: Agente (mensagem boas-vindas, personalidade, FAQ)
- [ ] Redirect automatico pro onboarding se nao completou
- [ ] **Criterio:** Wizard funcional, apos completar → dashboard
