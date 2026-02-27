# CLAUDE.md — routes/

## Responsabilidade

Rotas da aplicação React organizadas por domínio (portal). Cada subpasta corresponde a um portal isolado da plataforma. O roteamento usa **TanStack Router** com arquivos de rota estáticos.

## Estrutura atual

```
routes/
├── __root.tsx        ← layout raiz (providers, outlet)
├── agency/           ← portal da agência Nocrato
│   ├── login.tsx
│   └── reset-password.tsx
└── doctor/           ← portal do doutor (tenant isolado)
    ├── invite.tsx
    ├── login.tsx
    └── reset-password.tsx
```

## Portais previstos (conforme roadmap)

| Pasta | Portal | Autenticação |
|-------|--------|-------------|
| `agency/` | Portal interno Nocrato | JWT agency (`type: 'agency'`) |
| `doctor/` | Portal do doutor | JWT doctor (`type: 'doctor'`, com `tenantId`) |
| `patient/` | Portal do paciente (read-only) | Código de acesso (Epic 10) |
| `book/` | Agendamento público | Token temporário 24h (Epic 7) |

## Regras

- Cada rota deve usar o `api-client` de `lib/api-client.ts` — nunca `fetch` direto
- Dados remotos via **TanStack Query** (`useQuery`, `useMutation`) — sem `useEffect` para fetch
- Estado de auth lido do store Zustand em `lib/auth.ts` — nunca de localStorage direto
- Rotas protegidas devem redirecionar para login se `accessToken` for `null`
- Nunca misturar rotas de agency com guards/lógica de doctor

## O que NÃO pertence aqui

- Componentes genéricos reutilizáveis → `components/`
- Lógica de HTTP / store → `lib/`
- Tipos de API → `types/api.ts`

## Protocolo de alteração

**Nunca editar arquivos nesta pasta diretamente no contexto principal.** Seguir o fluxo obrigatório:
`frontend agent (Task tool)` → `designer agent (Task tool)` → `tech-lead` → `QA Playwright`
