# CLAUDE.md — components/

## Responsabilidade

Componentes React reutilizáveis da aplicação. Divididos em dois grupos: componentes primitivos do **shadcn/ui** (em `ui/`) e componentes de produto (diretamente em `components/`).

## Estrutura

```
components/
└── ui/          ← primitivos do shadcn/ui (gerados via CLI, não editar manualmente)
    ├── alert.tsx
    ├── button.tsx
    ├── card.tsx
    ├── input.tsx
    └── label.tsx
```

## Regras

- **`ui/`**: componentes gerados pelo `shadcn/ui`. Nunca editar diretamente — se precisar customizar, criar um wrapper em `components/`.
- Componentes de produto (fora de `ui/`) devem ser genéricos o suficiente para serem reutilizados em pelo menos 2 rotas — se for específico de uma rota, colocar na própria pasta da rota.
- Usar **Tailwind CSS v4** para estilização — sem CSS modules, sem styled-components.
- Props tipadas com TypeScript — sem `any`.

## O que NÃO pertence aqui

- Componentes específicos de uma rota → colocar na pasta da rota em `routes/`
- Lógica de dados/fetch → usar hooks em `hooks/` ou TanStack Query diretamente
- Contextos de estado global → `lib/auth.ts` ou futuro `contexts/`

## Como adicionar um componente shadcn/ui

```bash
pnpm --filter @nocrato/web dlx shadcn@latest add <component>
```

## Protocolo de alteração

**Nunca editar arquivos nesta pasta diretamente no contexto principal.** Seguir o fluxo obrigatório:
`frontend agent (Task tool)` → `designer agent (Task tool)` → `tech-lead` → `QA Playwright`
