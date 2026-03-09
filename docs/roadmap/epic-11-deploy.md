# EPIC 11: Polish & Deploy

| Field | Value |
|-------|-------|
| **Epic** | 11 |
| **Name** | Polish & Deploy |
| **Description** | Acabamento final e deploy em producao |
| **Dependencies** | EPIC 10 (Portal do Paciente) |
| **User Stories** | 4 |

> **Casos de teste:** [docs/test-cases/epic-11.md](../test-cases/epic-11.md)

---

## ✅ US-11.1: Como usuario, quero uma experiencia fluida

**Agentes:** `frontend` → `designer` → `qa`

- [x] Loading states (skeleton loaders em todas as listas)
- [x] Error states (toast notifications + error boundaries)
- [x] Empty states (mensagens amigaveis)
- [x] Responsive (sidebar collapse em mobile)
- [x] Favicon + meta tags + titulo dinamico por portal

---

## ✅ US-11.2: Como desenvolvedor, quero documentacao da API

**Agentes:** `backend` → `tech-lead`

- [x] Swagger setup (@nestjs/swagger)
- [x] Todos controllers com @ApiTags, @ApiOperation, @ApiResponse
- [x] Acessivel em /api/docs
- [x] **Criterio:** Documentacao completa e navegavel

---

## ✅ US-11.3: Como desenvolvedor, quero seed data para testes

**Agentes:** `backend` → `tech-lead`

- [x] Seed: 1 admin, 2 doutores, 5 pacientes, 10 consultas, notas, docs
- [x] Script: `pnpm --filter @nocrato/api seed`
- [x] **Criterio:** Dados de teste prontos em 1 comando

---

## ✅ US-11.4: Como desenvolvedor, quero fazer deploy

**Agentes:** `devops` → `tech-lead`

- [x] Hetzner CX22 (2vCPU, 4GB RAM)
- [x] Docker Compose producao (PostgreSQL, Evolution API)
- [x] Nginx reverse proxy + SSL (Let's Encrypt)
- [x] NestJS build + serve producao
- [x] React build → servido pelo Nginx
- [x] ./uploads/ no disco local
- [x] .env producao (DB, JWT, RESEND, WEBHOOK_API_KEY)
- [x] **Criterio:** app.nocrato.com funcionando com SSL
