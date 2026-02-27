# CLAUDE.md — Módulo invite

## Responsabilidade

Geração, validação e aceitação de convites para **agency_member** e **doctor**. Centraliza toda a lógica de ciclo de vida de invites — o módulo `auth` delega aqui para tudo que envolve a tabela `invites`.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `invite.service.ts` | Lógica de negócio: `inviteAgencyMember`, `inviteDoctor`, `validateInviteToken`, `acceptInvite` |
| `invite.controller.ts` | Rotas HTTP para os endpoints de convite |
| `invite.module.ts` | Registra `InviteService`, importa `EmailModule` |
| `invite.service.spec.ts` | Testes unitários do `InviteService` |
| `invite-doctor.service.spec.ts` | Testes unitários do fluxo de convite de doutor |

## Regras de negócio

- Convite expira em **7 dias** — verificado no momento do aceite
- Token é `crypto.randomBytes(32).toString('hex')` — 64 chars hex, não reutilizável
- Convite é **single-use**: após aceite, `status` muda para `'accepted'` e tentativas futuras retornam 400
- Não permite convite duplicado: verifica `status: 'pending'` existente antes de criar novo
- `inviteAgencyMember` → cria `agency_member` com `status: 'active'` ao aceitar (transação atômica)
- `inviteDoctor` → **não** cria o doctor aqui; a aceitação do convite de doutor é feita em `doctor-auth.service.ts` (acceptDoctorInvite), que cria `tenant` → `doctor` → `agent_settings` atomicamente
- `validateInviteToken` retorna apenas o email — usado pelo frontend para pré-preencher o formulário

## Padrões adotados

- Knex direto via `@Inject(KNEX)` — sem repositórios
- Transação Knex para operações multi-tabela (inserção de membro + update do invite)
- Erros específicos: `ConflictException` (duplicate), `NotFoundException` (token inexistente), `BadRequestException` (expirado/já usado)

## O que NÃO pertence a este módulo

- Aceitação de convite de **doutor** → `modules/auth/doctor-auth.service.ts` (cria tenant + doctor + agent_settings)
- Envio de email → `modules/email/email.service.ts` (chamado por aqui, mas implementado lá)
- Geração de JWT pós-aceitação → `modules/auth/`

## Como testar isoladamente

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=invite
```
