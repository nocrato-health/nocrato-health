# EPIC 11: Polish & Deploy

| Field | Value |
|-------|-------|
| **Epic** | 11 |
| **Name** | Polish & Deploy |
| **Description** | Acabamento final e deploy em producao |
| **Dependencies** | EPIC 10 (Portal do Paciente) |
| **User Stories** | 4 |

---

## US-11.1: Como usuario, quero uma experiencia fluida

- [ ] Loading states (skeleton loaders em todas as listas)
- [ ] Error states (toast notifications + error boundaries)
- [ ] Empty states (mensagens amigaveis)
- [ ] Responsive (sidebar collapse em mobile)
- [ ] Favicon + meta tags + titulo dinamico por portal

---

## US-11.2: Como desenvolvedor, quero documentacao da API

- [ ] Swagger setup (@nestjs/swagger)
- [ ] Todos controllers com @ApiTags, @ApiOperation, @ApiResponse
- [ ] Acessivel em /api/docs
- [ ] **Criterio:** Documentacao completa e navegavel

---

## US-11.3: Como desenvolvedor, quero seed data para testes

- [ ] Seed: 1 admin, 2 doutores, 5 pacientes, 10 consultas, notas, docs
- [ ] Script: `pnpm --filter @nocrato/api seed`
- [ ] **Criterio:** Dados de teste prontos em 1 comando

---

## US-11.4: Como desenvolvedor, quero fazer deploy

- [ ] Hetzner CX22 (2vCPU, 4GB RAM)
- [ ] Docker Compose producao (PostgreSQL, Evolution API)
- [ ] Nginx reverse proxy + SSL (Let's Encrypt)
- [ ] NestJS build + serve producao
- [ ] React build → servido pelo Nginx
- [ ] ./uploads/ no disco local
- [ ] .env producao (DB, JWT, RESEND, WEBHOOK_API_KEY)
- [ ] **Criterio:** app.nocrato.com funcionando com SSL
