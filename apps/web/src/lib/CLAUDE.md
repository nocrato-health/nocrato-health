# CLAUDE.md — lib/

## Responsabilidade

Utilitários e infraestrutura de cliente compartilhados por toda a aplicação frontend. Sem lógica de UI — apenas helpers, cliente HTTP, store de auth e configurações.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `api-client.ts` | Cliente HTTP com auto-refresh de token em 401, wrapper de `fetch` com `Authorization` automático |
| `auth.ts` | Zustand store persistido (`localStorage`) com estado de autenticação: tokens, usuário, userType, tenantId |
| `query-client.ts` | Instância global do TanStack Query `QueryClient` com configurações padrão |
| `utils.ts` | Helpers genéricos (ex: `cn()` para merge de classes Tailwind) |

## Regras de negócio

### api-client.ts
- Base URL via `VITE_API_URL` (fallback: `http://localhost:3000`)
- Auto-refresh em 401: tenta renovar o access token antes de falhar
- Refresh mutex: `refreshPromise` evita múltiplas chamadas simultâneas de refresh
- Em caso de falha no refresh, chama `clearAuth()` e retorna `null` (usuário é deslogado)
- Resposta 204 retorna `undefined` sem tentar parsear JSON
- Erros enriquecidos com `status` e `data` no objeto Error

### auth.ts
- Store Zustand com `persist` middleware — dados salvos em `localStorage` com key `'nocrato-auth'`
- `userType: 'agency' | 'doctor'` determina qual endpoint de refresh usar
- `tenantId` é `null` para agency_members, preenchido para doctors
- `clearAuth()` zera todos os campos (usado em logout e refresh falho)

## O que NÃO pertence aqui

- Componentes React → `components/`
- Hooks TanStack Query específicos de feature → `hooks/` (a criar conforme epics avançam)
- Tipos da API → `types/api.ts`

## Como testar isoladamente

```bash
# Sem testes unitários ainda — api-client mockável via MSW nos testes de componente
pnpm --filter @nocrato/web test
```
