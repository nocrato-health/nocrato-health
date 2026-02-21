# EPIC 1: Autenticacao & Convites

| Field | Value |
|-------|-------|
| **Epic** | 1 |
| **Name** | Autenticacao & Convites |
| **Description** | Fluxos de login, registro, convite e esqueci minha senha |
| **Dependencies** | EPIC 0 (Fundacao) |
| **User Stories** | 9 |

---

## US-1.1: Como admin da agencia, quero fazer login no portal

- [ ] modules/auth/auth.service.ts → loginAgency(email, password)
- [ ] modules/auth/auth.controller.ts → POST /api/v1/agency/auth/login
- [ ] Retorna { accessToken, refreshToken, member }
- [ ] **Criterio:** curl login → recebe tokens validos

---

## US-1.2: Como admin, quero convidar um novo colaborador por email

- [ ] modules/invite/invite.service.ts → createInvite(type, email, invitedBy)
- [ ] modules/invite/invite.repository.ts
- [ ] email/email.service.ts (Resend client)
- [ ] email/templates/invite-member.ts
- [ ] POST /api/v1/agency/members/invite { email }
- [ ] Gera token, salva invite, envia email via Resend
- [ ] **Criterio:** curl invite → email recebido com link valido

---

## US-1.3: Como colaborador convidado, quero aceitar o convite e criar minha senha

- [ ] GET /api/v1/agency/auth/invite/:token (valida token)
- [ ] POST /api/v1/agency/auth/accept-invite { token, password }
- [ ] Ativa agency_member, marca invite como accepted
- [ ] **Criterio:** Aceitar convite → membro ativo, login funciona

---

## US-1.4: Como admin, quero convidar um doutor por email

- [ ] email/templates/invite-doctor.ts
- [ ] POST /api/v1/agency/doctors/invite { email }
- [ ] Gera invite type='doctor', envia email com link /doctor/invite?token=X
- [ ] **Criterio:** curl invite → email recebido

---

## US-1.5: Como doutor convidado, quero aceitar convite criando slug e senha

- [ ] GET /api/v1/doctor/auth/invite/:token (valida)
- [ ] POST /api/v1/doctor/auth/accept-invite { token, slug, password, name }
- [ ] Cria: tenant (slug) + doctor (perfil) + agent_settings (defaults)
- [ ] Retorna { accessToken, refreshToken, doctor, tenant }
- [ ] **Criterio:** Aceitar → tenant criado, login funciona, redirect pra onboarding

---

## US-1.6: Como doutor ja cadastrado, quero fazer login

- [ ] GET /api/v1/doctor/auth/resolve-email/:email → { slug } ou { hasPendingInvite }
- [ ] POST /api/v1/doctor/auth/login { email, password }
- [ ] Retorna { accessToken, refreshToken, doctor, tenant }
- [ ] **Criterio:** Login funcional com slug auto-preenchido

---

## US-1.7: Como usuario, quero recuperar minha senha

- [ ] POST /api/v1/{agency|doctor}/auth/forgot-password { email }
- [ ] Cria invite type='password_reset', token, expires_at (1h)
- [ ] Resend envia email com link de reset
- [ ] POST /api/v1/{agency|doctor}/auth/reset-password { token, newPassword }
- [ ] **Criterio:** Reset completo funcional

---

## US-1.8: Como usuario, quero renovar meu token expirado

- [ ] POST /api/v1/{agency|doctor}/auth/refresh { refreshToken }
- [ ] Retorna novo { accessToken, refreshToken }
- [ ] **Criterio:** Refresh funcional, token antigo invalido

---

## US-1.9: [FRONTEND] Paginas de autenticacao

- [ ] Scaffold apps/web (Vite + React 19 + TanStack Router + shadcn/ui + Tailwind v4)
- [ ] lib/api-client.ts (fetch wrapper com auto-inject token + refresh)
- [ ] lib/auth.tsx (AuthContext: agency vs doctor)
- [ ] routes/agency/login.tsx
- [ ] routes/doctor/login.tsx (email → resolve → slug + senha)
- [ ] routes/doctor/invite.tsx (aceitar convite)
- [ ] routes/agency/reset-password.tsx + routes/doctor/reset-password.tsx
- [ ] **Criterio:** Login e convite funcionais no browser
