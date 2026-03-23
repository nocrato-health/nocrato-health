# CLAUDE.md — apps/web

Frontend da plataforma Nocrato Health. Leia este arquivo antes de tocar em qualquer código neste diretório.

---

## O que este módulo faz

App React que serve três portais distintos:
- **Agency portal** (`/agency/*`) — painel interno da Nocrato (gerenciar doutores, convites)
- **Doctor portal** (`/doctor/*`) — portal do médico (pacientes, consultas, configurações)
- **Patient portal** (`/patient/*`) — portal read-only do paciente (acesso via código)
- **Booking público** (`/book/:slug/*`) — agendamento protegido por token temporário

---

## Stack

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 19.x | UI rendering |
| Vite | 6.x | Build tool |
| TanStack Router | 1.x | Roteamento (code-based) |
| TanStack Query | 5.x | Data fetching + cache (polling 30s) |
| Zustand | 5.x | Auth state (persistido em localStorage) |
| React Hook Form | 7.x | Forms |
| Zod | 3.x | Validação de formulários |
| Tailwind CSS | 4.x | Styling (CSS-first config) |
| shadcn/ui | manual | Componentes copiados em `src/components/ui/` |

---

## Estrutura de arquivos

```
apps/web/
├── index.html
├── vite.config.ts           # Tailwind v4 via @tailwindcss/vite + React plugin
├── tsconfig.json
├── .env.example             # VITE_API_URL=http://localhost:3000
└── src/
    ├── main.tsx             # Entry point + router + QueryClientProvider
    ├── app.css              # @import "tailwindcss" + @theme com design tokens
    ├── lib/
    │   ├── api-client.ts    # fetch wrapper: auto-inject token, auto-refresh 401
    │   ├── auth.ts          # Zustand store: accessToken, refreshToken, user, userType
    │   ├── query-client.ts  # TanStack Query (refetchInterval: 30s)
    │   └── utils.ts         # cn() helper (clsx + tailwind-merge)
    ├── types/
    │   └── api.ts           # DTOs das respostas do backend
    ├── components/
    │   └── ui/              # shadcn/ui components (Button, Input, Label, Card, Alert)
    └── routes/
        ├── __root.tsx       # RootLayout (Outlet sem providers extras)
        ├── agency/
        │   ├── login.tsx            # Login da agência (email + senha)
        │   └── reset-password.tsx   # Forgot/reset password da agência
        └── doctor/
            ├── login.tsx            # Login 2-step (email → resolve → senha)
            ├── invite.tsx           # Aceitar convite (token na URL)
            └── reset-password.tsx   # Forgot/reset password do médico
```

---

## Principais arquivos e o que cada um faz

### `src/lib/api-client.ts`
- Fetch wrapper que injeta `Authorization: Bearer {accessToken}` em toda requisição
- Em 401: tenta refresh automático (`POST /api/v1/{userType}/auth/refresh`)
- Singleton de refresh (evita múltiplos refreshes paralelos com `refreshPromise`)
- Se refresh falha: `clearAuth()` e redireciona para login
- Exporta `api.get`, `api.post`, `api.patch`, `api.put`, `api.delete`

### `src/lib/auth.ts`
- Zustand store persistido em `localStorage` (key: `nocrato-auth`)
- Fields: `accessToken`, `refreshToken`, `user`, `userType`, `tenantId`
- Actions: `setAuth()`, `clearAuth()`, `updateTokens()`
- **Nunca** armazenar tokens em cookies ou React state não-persistido

### `src/main.tsx`
- Usa **code-based routing** (não file-based) — sem dependência de `routeTree.gen.ts`
- Router declarado inline, `declare module '@tanstack/react-router'` para type safety
- `QueryClientProvider` wrapa o `RouterProvider`

---

## Rotas implementadas (US-1.9)

| Rota | Componente | Descrição |
|---|---|---|
| `/agency/login` | `AgencyLoginPage` | Login email + senha |
| `/agency/reset-password` | `AgencyResetPasswordPage` | Forgot/reset com `?token=` |
| `/doctor/login` | `DoctorLoginPage` | 2-step: email resolve → senha |
| `/doctor/invite` | `DoctorInvitePage` | Aceitar convite com `?token=` |
| `/doctor/reset-password` | `DoctorResetPasswordPage` | Forgot/reset com `?token=` |

---

## Design system

### Cores (Nocrato brand — nunca usar grays padrão do shadcn)

| Token | Hex | Uso |
|---|---|---|
| `amber-dark` | `#6e5305` | Título do logo, texto de botão primário |
| `amber-bright` | `#fabe01` | Background do botão primário |
| `blue-steel` | `#6c85a0` | Links, botões secundários |
| `orange` | `#de782e` | Destaques, alertas |
| `cream` | `#fffdf8` | Background de página |

### Tipografia
- **Headings**: Montserrat (Google Fonts)
- **Body**: Montserrat (Google Fonts — fonte Xilosa removida, arquivo woff2 não existe)

### Componentes UI (`src/components/ui/`)
- `Button`: variantes `default` (amber), `outline`, `ghost`, `link`, `destructive` + prop `loading`
- `Input`: prop `error` para estado de erro (borda vermelha)
- `Label`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Alert`: variantes `default`, `destructive`, `success`

---

## Regras de negócio deste módulo

1. **Separação de domínios**: agency e doctor têm JWTs distintos (`type: 'agency'` vs `'doctor'`). Nunca misturar rotas.
2. **tenantId**: presente no JWT do doctor, extraído pelo backend. No frontend, armazenado no Zustand como `tenantId`.
3. **Doctor login é 2-step**: primeiro resolve email com `GET /doctor/auth/resolve-email/:email`, depois faz login com senha. Não pular o passo de resolução.
4. **Invite flow**: token na URL `?token=`, validado com `GET /doctor/auth/invite/:token` ao montar a página.
5. **Tokens**: armazenados em localStorage via Zustand persist. RefreshToken é renovado automaticamente no 401.
6. **Polling**: TanStack Query configurado com `refetchInterval: 30s` (sem WebSocket no MVP).

---

## O que NÃO pertence a este módulo

- Lógica de negócio do backend
- Queries SQL / Knex
- Envio de emails (responsabilidade do `api/src/modules/email/`)
- Lógica do agente WhatsApp

---

## Como rodar

```bash
# Na raiz do monorepo
pnpm install
cp apps/web/.env.example apps/web/.env

# Iniciar o backend primeiro
pnpm --filter @nocrato/api dev

# Iniciar o frontend
pnpm --filter @nocrato/web dev
# Abre em http://localhost:5173
```

---

## Como adicionar uma nova rota

1. Criar o componente em `src/routes/{domínio}/{rota}.tsx`
2. Importar em `src/main.tsx`
3. Criar a `createRoute({...})` e adicionar ao `routeTree`
4. Atualizar a tabela de rotas neste CLAUDE.md
