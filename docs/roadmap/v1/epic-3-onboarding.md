---
tags: [roadmap, v1, epic]
type: epic
status: completed
---

# EPIC 3: Onboarding do Doutor

| Field | Value |
|-------|-------|
| **Epic** | 3 |
| **Name** | Onboarding do Doutor |
| **Description** | Wizard pos-convite para configurar o portal do doutor |
| **Dependencies** | EPIC 1 (Autenticacao & Convites) |
| **User Stories** | 2 |

---

## US-3.1: Como doutor recem-convidado, quero completar meu onboarding ✅

**Agentes:** `backend` → `tech-lead` → `qa`

- [x] GET /api/v1/doctor/onboarding/status → { currentStep, completed, steps }
- [x] PATCH /api/v1/doctor/onboarding/profile { name, specialty, phone, CRM, crmState }
- [x] PATCH /api/v1/doctor/onboarding/schedule { workingHours, timezone, appointmentDuration }
- [x] PATCH /api/v1/doctor/onboarding/branding { primaryColor, logoUrl }
- [x] PATCH /api/v1/doctor/onboarding/agent { welcomeMessage, personality, faq }
- [x] POST /api/v1/doctor/onboarding/complete → marca onboarding_completed = true
- [x] **Criterio:** 4 steps, cada um salva dados, ultimo ativa o portal

**Implementado em:** `apps/api/src/modules/doctor/`
**Testes:** 31 testes (26 service + 6 controller) | Cobertura: 93-97% | Suite total: 258/258
**Notas de implementação:**
- `getOnboardingStatus` retorna `{ currentStep: 1-5, completed: bool, steps: { profile, schedule, branding, agent } }`
- `updateBranding` atualiza tabela `tenants` (primary_color, logo_url), não `doctors`
- `updateAgentSettings` faz upsert com default `booking_mode: 'both'` (valor válido do CHECK constraint)
- `completeOnboarding` valida `name`, `crm` e `working_hours` antes de marcar como completo

#### Casos de Teste

> Gerados em: 2026-03-01

### CT-31-01 — Happy path: status avança conforme cada step é completado

**Categoria:** Happy path
**Pré-condição:** doutor com convite aceito (`onboarding_completed = false`), sem dados de perfil, sem `agent_settings`

**Passos:**
1. `GET /api/v1/doctor/onboarding/status` → confirmar `{ currentStep: 1, completed: false, steps: { profile: false, schedule: false, branding: true, agent: false } }`
2. `PATCH /api/v1/doctor/onboarding/profile` com `{ name: "Dr. Rafael Souza", crm: "123456", crmState: "SP" }`
3. `GET /api/v1/doctor/onboarding/status` → confirmar `currentStep: 2, steps.profile: true`
4. `PATCH /api/v1/doctor/onboarding/schedule` com `{ workingHours: { "monday": [{ "start": "08:00", "end": "17:00" }] }, timezone: "America/Sao_Paulo", appointmentDuration: 30 }`
5. `GET /api/v1/doctor/onboarding/status` → confirmar `currentStep: 4, steps.schedule: true` _(step 3 branding é sempre true — pula direto para 4)_
6. `PATCH /api/v1/doctor/onboarding/agent` com `{ welcomeMessage: "Olá! Sou o assistente do Dr. Rafael." }`
7. `GET /api/v1/doctor/onboarding/status` → confirmar `currentStep: 5, completed: true`
8. `POST /api/v1/doctor/onboarding/complete` → confirmar `{ success: true, doctor: { name: "Dr. Rafael Souza", ... } }`

**Resultado esperado:** cada GET após PATCH reflete o avanço correto do step; complete retorna 200 com dados do doutor
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-02 — Acesso sem JWT retorna 401

**Categoria:** Acesso negado
**Pré-condição:** nenhuma

**Passos:**
1. `GET /api/v1/doctor/onboarding/status` sem header `Authorization`
2. Repetir para `PATCH /api/v1/doctor/onboarding/profile` e `POST /api/v1/doctor/onboarding/complete`

**Resultado esperado:** HTTP 401 Unauthorized em todos os endpoints
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-03 — JWT de agência é rejeitado nos endpoints de onboarding

**Categoria:** Acesso negado
**Pré-condição:** JWT válido de um `agency_member` (type: "agency")

**Passos:**
1. `GET /api/v1/doctor/onboarding/status` com JWT de agência no header `Authorization`

**Resultado esperado:** HTTP 403 Forbidden — `RolesGuard` bloqueia quem não tem role `doctor`
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-04 — Isolamento: doutor não altera dados de outro tenant

**Categoria:** Isolamento
**Pré-condição:** dois doutores com tenants distintos — `dr-rafael` (tenant A) e `dra-carvalho` (tenant B), ambos sem onboarding completo

**Passos:**
1. Autenticar como `dr-rafael` e obter JWT com `tenantId` do tenant A
2. `PATCH /api/v1/doctor/onboarding/profile` com `{ name: "Dr. Rafael Souza", crm: "111111", crmState: "SP" }` usando JWT de `dr-rafael`
3. Autenticar como `dra-carvalho` e fazer `GET /api/v1/doctor/onboarding/status`

**Resultado esperado:** status de `dra-carvalho` continua com `steps.profile: false` — o PATCH de `dr-rafael` não afetou o tenant B
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-05 — complete bloqueado quando working_hours não está configurado

**Categoria:** Edge case
**Pré-condição:** doutor com `name` e `crm` preenchidos, mas `working_hours = null`

**Passos:**
1. `POST /api/v1/doctor/onboarding/complete`

**Resultado esperado:** HTTP 400 — `"Horários não configurados — configure sua agenda antes de concluir o onboarding"`
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-06 — step 3 (branding) está sempre true no status, mesmo sem primary_color customizado

**Categoria:** Edge case
**Pré-condição:** doutor com `profile` completo e `schedule` completo, nunca chamou `PATCH /branding`

**Passos:**
1. `GET /api/v1/doctor/onboarding/status`

**Resultado esperado:** `steps.branding: true` e `currentStep: 4` (avança para agent sem exigir branding)
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-07 — updateAgentSettings: segunda chamada faz UPDATE, não duplica registro

**Categoria:** Edge case
**Pré-condição:** doutor autenticado, `agent_settings` já existe para o tenant

**Passos:**
1. `PATCH /api/v1/doctor/onboarding/agent` com `{ welcomeMessage: "Olá, primeira mensagem." }`
2. `PATCH /api/v1/doctor/onboarding/agent` com `{ welcomeMessage: "Olá, mensagem atualizada.", personality: "Formal e objetivo." }`
3. Verificar no banco: `SELECT COUNT(*) FROM agent_settings WHERE tenant_id = ?`

**Resultado esperado:** COUNT = 1 (sem duplicatas); `welcome_message` = "Olá, mensagem atualizada."; `personality` = "Formal e objetivo."
**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-31-08 — updateBranding: primary_color com formato inválido é rejeitado pelo banco

**Categoria:** Validação de entrada
**Pré-condição:** doutor autenticado

**Passos:**
1. `PATCH /api/v1/doctor/onboarding/branding` com `{ primaryColor: "azul" }` _(não é hex válido)_

**Resultado esperado:** HTTP 400 — violação do `CHECK constraint` `tenants_primary_color_check` (`^#[0-9A-Fa-f]{6}$`)
**Resultado atual:** [ ] ok  [ ] falhou

---

## US-3.2: [FRONTEND] Wizard de onboarding ✅

**Agentes:** `frontend` → `designer` → `qa`

- [x] routes/doctor/onboarding.tsx (wizard 4 steps com progress bar)
- [x] Step 1: Perfil (nome, CRM, especialidade, telefone)
- [x] Step 2: Horarios (dias da semana, intervalos, timezone, duracao padrao)
- [x] Step 3: Branding (cor primaria, logoUrl)
- [x] Step 4: Agente (mensagem boas-vindas, personalidade)
- [x] Redirect automatico pro onboarding se nao completou
- [x] **Criterio:** Wizard funcional, apos completar → dashboard

**Implementado em:** `apps/web/src/routes/doctor/`
**Testes:** 6/6 Playwright (CT-32-01 a CT-32-06) | Suíte backend: 263/263
**Notas de implementação:**
- `routes/doctor/onboarding.tsx` — wizard completo (4 steps como componentes internos)
- `routes/doctor/_layout.tsx` — layout pathless com sidebar + guard `onboardingCompleted`
- `routes/doctor/dashboard.tsx` — placeholder (expandido no Epic 4+)
- `lib/queries/doctor.ts` — queries e mutations para todos os endpoints de onboarding
- `lib/auth.ts` — adicionado campo `onboardingCompleted` ao store Zustand
- `types/api.ts` — adicionados tipos `OnboardingStatus`, `WorkingHours`, etc.
- Guard de routing: `doctorOnboardingRoute` fora do layout protegido (sem sidebar)
- Backend fix: `loginDoctor` e `acceptDoctorInvite` agora retornam `onboardingCompleted`
- E2E setup: `setup-test-data.ts` + `global-setup.ts` + `doctor-onboarding.spec.ts`

#### Casos de Teste

> Gerados em: 2026-03-01

### CT-32-01 — Happy path: wizard completo via UI com redirect para dashboard

**Categoria:** Happy path
**Pré-condição:** doutor com convite aceito, logado no portal, `onboarding_completed = false`

**Passos:**
1. Acessar `/doctor/onboarding` — confirmar que exibe Step 1 (Perfil) com progress bar em 25%
2. Preencher nome "Dra. Ana Carvalho", CRM "654321", estado "RJ", clicar "Próximo"
3. Confirmar que avançou para Step 2 (Horários) com progress bar em 50%
4. Configurar horários (ex: segunda a sexta, 08:00–17:00), timezone "America/Sao_Paulo", duração 30min, clicar "Próximo"
5. Confirmar que avançou para Step 3 (Branding) com progress bar em 75%
6. Clicar "Próximo" sem alterar nada (branding é opcional)
7. Confirmar que avançou para Step 4 (Agente) com progress bar em 100%
8. Preencher mensagem de boas-vindas "Olá! Sou o assistente da Dra. Ana.", clicar "Concluir"
9. Confirmar redirect para `/doctor/dashboard`

**Resultado esperado:** wizard percorre os 4 steps sem erro; ao concluir, redireciona para o dashboard; `onboarding_completed = true` no banco
**Resultado atual:** [x] ok  [ ] falhou — 2026-03-01 (Playwright automático)

---

### CT-32-02 — Redirect automático para onboarding se não completou

**Categoria:** Edge case
**Pré-condição:** doutor logado com `onboarding_completed = false`

**Passos:**
1. Tentar acessar diretamente `/doctor/dashboard`

**Resultado esperado:** redirect automático para `/doctor/onboarding`
**Resultado atual:** [x] ok  [ ] falhou — 2026-03-01 (Playwright automático)

---

### CT-32-03 — Doutor que já completou onboarding não é redirecionado de volta

**Categoria:** Edge case
**Pré-condição:** doutor logado com `onboarding_completed = true`

**Passos:**
1. Acessar `/doctor/onboarding` diretamente

**Resultado esperado:** redirect para `/doctor/dashboard` — wizard não deve ser reexibido após conclusão
**Resultado atual:** [x] ok  [ ] falhou — 2026-03-01 (Playwright automático)

---

### CT-32-04 — Step 1: campos obrigatórios bloqueiam avanço se vazios

**Categoria:** Validação de entrada
**Pré-condição:** doutor no Step 1 do wizard

**Passos:**
1. Deixar campo "Nome" em branco e clicar "Próximo"
2. Preencher nome mas deixar "CRM" em branco e clicar "Próximo"

**Resultado esperado:** em ambos os casos, formulário exibe erro de validação e não avança para Step 2
**Resultado atual:** [x] ok  [ ] falhou — 2026-03-01 (Playwright automático)

---

### CT-32-05 — Step 3 (Branding): logo é opcional — wizard avança sem upload

**Categoria:** Edge case
**Pré-condição:** doutor no Step 3 (Branding), sem logo enviado

**Passos:**
1. Clicar "Próximo" sem alterar cor primária nem fazer upload de logo

**Resultado esperado:** avança para Step 4 sem erro — logo_url pode ser null
**Resultado atual:** [x] ok  [ ] falhou — 2026-03-01 (Playwright automático)

---

### CT-32-06 — Usuário não autenticado é redirecionado para login

**Categoria:** Acesso negado
**Pré-condição:** nenhuma sessão ativa (localStorage limpo)

**Passos:**
1. Acessar `/doctor/onboarding` sem estar autenticado

**Resultado esperado:** redirect automático para `/doctor/login`
**Resultado atual:** [x] ok  [ ] falhou — 2026-03-01 (Playwright automático)

---

## Links Relacionados

- [[flows/auth-flows|Fluxo de Autenticação]]
- [[architecture/decisions|ADRs]]
