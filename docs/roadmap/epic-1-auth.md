# EPIC 1: Autenticacao & Convites

| Field | Value |
|-------|-------|
| **Epic** | 1 |
| **Name** | Autenticacao & Convites |
| **Description** | Fluxos de login, registro, convite e esqueci minha senha |
| **Dependencies** | EPIC 0 (Fundacao) |
| **User Stories** | 9 |

---

## US-1.1: Como admin da agencia, quero fazer login no portal ✅

- [x] modules/auth/agency-auth.service.ts → loginAgency(email, password)
- [x] modules/auth/agency-auth.controller.ts → POST /api/v1/agency/auth/login
- [x] Retorna { accessToken, refreshToken, member: { id, name, email, role } }
- [x] **Criterio:** curl login → recebe tokens validos
- [x] Testes: agency-auth.service.spec.ts — 20/20

---

## US-1.2: Como admin, quero convidar um novo colaborador por email ✅

- [x] modules/invite/invite.service.ts → inviteAgencyMember(email, invitedBy)
- [x] modules/email/email.service.ts (Resend client)
- [x] modules/email/templates/invite-member.ts
- [x] POST /api/v1/agency/members/invite { email }
- [x] Gera token, salva invite, envia email via Resend
- [x] **Criterio:** curl invite → email recebido com link valido
- [x] Testes: invite.service.spec.ts — 38/38 (cobre US-1.2 e US-1.3)

---

## US-1.3: Como colaborador convidado, quero aceitar o convite e criar minha senha ✅

- [x] GET /api/v1/agency/auth/invite/:token (valida token)
- [x] POST /api/v1/agency/auth/accept-invite { token, name, password }
- [x] Ativa agency_member, marca invite como accepted (knex.transaction)
- [x] **Criterio:** Aceitar convite → membro ativo, login funciona

---

## US-1.4: Como admin, quero convidar um doutor por email ✅

- [x] email/templates/invite-doctor.ts
- [x] POST /api/v1/agency/doctors/invite { email }
- [x] Gera invite type='doctor', envia email com link /doctor/invite?token=X
- [x] **Criterio:** curl invite → email recebido
- [x] Testes: invite-doctor.service.spec.ts — 9/9

---

## US-1.5: Como doutor convidado, quero aceitar convite criando slug e senha ✅

- [x] GET /api/v1/doctor/auth/invite/:token (valida)
- [x] POST /api/v1/doctor/auth/accept-invite { token, slug, password, name }
- [x] Cria: tenant (slug) + doctor (perfil) + agent_settings (defaults)
- [x] Retorna { accessToken, refreshToken, doctor, tenant }
- [x] **Criterio:** Aceitar → tenant criado, login funciona, redirect pra onboarding
- [x] Testes: doctor-auth.service.spec.ts — 17/17
- [x] DoCDD: migration 015 (crm/crm_state nullable)

---

## US-1.6: Como doutor ja cadastrado, quero fazer login ✅

- [x] GET /api/v1/doctor/auth/resolve-email/:email → { slug, name } ou { hasPendingInvite: true } ou 404
- [x] POST /api/v1/doctor/auth/login { email, password }
- [x] Retorna { accessToken, refreshToken, doctor: {id,name,email}, tenant: {id,slug,name} }
- [x] JWT payload com tenantId para isolamento de tenant
- [x] **Criterio:** Login funcional com slug auto-preenchido
- [x] Testes: doctor-auth.service.spec.ts — resolveEmail + loginDoctor (US-1.6 suite)

---

## US-1.7: Como usuario, quero recuperar minha senha ✅

- [x] POST /api/v1/{agency|doctor}/auth/forgot-password { email } — sempre 200, nunca revela existencia
- [x] Cria invite type='password_reset', token 64-hex, expires_at = +1h (migration 016)
- [x] Invalida tokens pending anteriores antes de criar novo
- [x] Resend envia email com link de reset (falha silenciosa — nao vaza existencia do email)
- [x] POST /api/v1/{agency|doctor}/auth/reset-password { token, newPassword }
- [x] Transaction atomica: bcrypt.hash + UPDATE password_hash + accept invite (com SELECT FOR UPDATE)
- [x] DoCDD: migration 016 (invites.type += 'password_reset'; invites.invited_by nullable)
- [x] **Criterio:** Reset completo funcional
- [x] Testes: doctor-auth.service.spec.ts + agency-auth.service.spec.ts (US-1.7 suites)

---

## US-1.8: Como usuario, quero renovar meu token expirado ✅

- [x] dto/refresh-token.dto.ts → RefreshTokenSchema { refreshToken: z.string().min(1) }
- [x] AgencyAuthService.refreshToken() — verifica JWT_REFRESH_SECRET, valida type === 'agency', re-emite par
- [x] DoctorAuthService.refreshToken() — idem, valida type === 'doctor', preserva tenantId no re-emit
- [x] POST /api/v1/agency/auth/refresh → AgencyAuthController
- [x] POST /api/v1/doctor/auth/refresh → DoctorAuthController
- [x] Stateless: sem acesso ao banco no refresh
- [x] Segurança cross-domain: token de doctor rejeitado no endpoint de agency e vice-versa
- [x] **Criterio:** Refresh funcional, token antigo invalido
- [x] Testes: agency-auth.service.spec.ts + doctor-auth.service.spec.ts — 89/89 (US-1.8 suites: 11 novos testes)

---

## US-1.9: [FRONTEND] Paginas de autenticacao ✅

- [x] Scaffold apps/web (Vite + React 19 + TanStack Router code-based + Tailwind v4 + shadcn/ui manual)
- [x] lib/api-client.ts (fetch wrapper com auto-inject token + auto-refresh em 401)
- [x] lib/auth.ts (Zustand store persistido: agency vs doctor, accessToken, refreshToken, tenantId)
- [x] lib/query-client.ts (TanStack Query — refetchInterval: 30s)
- [x] routes/agency/login.tsx
- [x] routes/doctor/login.tsx (2-step: email resolve → senha)
- [x] routes/doctor/invite.tsx (token na URL, sugestao de slug, flag anti-overwrite)
- [x] routes/agency/reset-password.tsx + routes/doctor/reset-password.tsx
- [x] Componentes UI: Button, Input, Label, Card, Alert (cores Nocrato brand)
- [x] apps/web/CLAUDE.md documentando o modulo
- [x] **Criterio:** Typecheck passando — pnpm install + tsc --noEmit com 0 erros
- [x] Tech-lead: APROVADO_COM_RESSALVAS → issues corrigidos (greeting, Array.isArray, Link, CardTitle ref, slug flag)
