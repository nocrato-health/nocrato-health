# CLAUDE.md — types/

## Responsabilidade

Definições de tipos TypeScript que espelham as respostas da API backend. Fonte de verdade de tipos compartilhados no frontend — sem lógica, apenas `interface` e `type`.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `api.ts` | Tipos de entidades (`AgencyMember`, `Doctor`, `Tenant`) e respostas de auth (`AgencyLoginResponse`, `DoctorLoginResponse`, `RefreshResponse`, `ApiError`, etc.) |

## Regras

- Tipos devem espelhar **exatamente** o que o backend retorna — se o schema mudar, atualizar aqui junto
- Apenas `interface` e `type` — sem classes, sem funções, sem lógica
- Exportar tudo com `export` — sem `export default`
- `UserType = 'agency' | 'doctor'` é o discriminador central de domínio usado em `lib/auth.ts` e `lib/api-client.ts`

## O que NÃO pertence aqui

- Tipos locais de componente (props, estado interno) → definir inline ou no próprio arquivo do componente
- Tipos de configuração interna → `lib/`
- Enums de status de entidades de backend → espelhar como union types (`'pending' | 'active'`), não enum TypeScript

## Como manter sincronizado com o backend

Ao alterar qualquer DTO ou response no backend (Epic N), verificar se os tipos em `api.ts` precisam de atualização. Não há geração automática de tipos no MVP.
