# CLAUDE.md — Módulo email

## Responsabilidade

Envio transacional de e-mails via **Resend**. Módulo utilitário puro — não contém lógica de negócio, apenas abstrai a chamada ao SDK da Resend e as templates HTML.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `email.service.ts` | Três métodos de envio: `sendInviteMember`, `sendInviteDoctor`, `sendPasswordReset` |
| `email.module.ts` | Registra e exporta `EmailService` para consumo por outros módulos |
| `templates/invite-member.ts` | Template HTML para convite de agency_member |
| `templates/invite-doctor.ts` | Template HTML para convite de doutor |
| `templates/password-reset.ts` | Template HTML para redefinição de senha (agency e doctor) |

## Regras de negócio

- URLs geradas com base em `FRONTEND_URL` do env — nunca hardcoded
- Rota do reset de senha difere por `userType`: `agency/reset-password` ou `doctor/reset-password`
- Em caso de falha no envio, o serviço lança `Error` (não swallow silencioso) — quem chama decide como tratar
- Sem retry automático — se falhar, o erro propaga para o caller

## Padrões adotados

- `Resend` instanciado diretamente no serviço (não injetado) via `env.RESEND_API_KEY`
- Logger NestJS para cada envio (sucesso e erro)
- Módulo sem controller — é exclusivamente um serviço interno

## O que NÃO pertence a este módulo

- Lógica de quando enviar (quem decide é `invite.service.ts` ou `auth.service.ts`)
- Geração de tokens de convite → `modules/invite/`
- Templates de WhatsApp → módulo `agent/` (futuro)

## Como testar isoladamente

```bash
# Não há testes unitários ainda — EmailService depende do Resend SDK (mockável via jest.mock)
pnpm --filter @nocrato/api test -- --testPathPattern=email
```
