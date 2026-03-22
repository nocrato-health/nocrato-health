# Skill: Code Review

Realiza uma revisão estruturada e abrangente das mudanças de código antes do merge para main.
Detecta automaticamente o escopo do diff e aplica as regras específicas do stack Nocrato Health V2.

---

## Quando usar

- Antes de fazer merge de qualquer branch para main
- Quando o usuário invocar `/code-review` explicitamente
- Ao finalizar uma US antes de abrir o PR

<!--
## Quando usar com PRs (ativar quando branch protection estiver habilitada)
- Antes de fazer merge de qualquer PR
- Como etapa obrigatória no ciclo de US após o QA
-->

---

## Stack deste projeto

- **Backend:** NestJS + TypeScript + Knex + PostgreSQL
- **Frontend:** React 19 + TanStack Router + TanStack Query + Tailwind CSS v4 + shadcn/ui
- **Auth:** JWT stateless — agency e doctor são domínios separados
- **Isolamento:** todo query em tabela tenant-scoped DEVE ter `WHERE tenant_id = ?`
- **Validação:** Zod + nestjs-zod em todos os DTOs

---

## Passo 0 — Seleção do escopo

Pergunte ao usuário e aguarde a resposta:

**O que deseja revisar?**

1. Mudanças não commitadas — arquivos modificados mas não staged (`git diff HEAD`)
2. Staged apenas — arquivos no index mas não commitados (`git diff --cached`)
3. Branch atual vs main — todos os commits desta branch (`git diff $(git merge-base HEAD main)...HEAD`)
4. Um commit específico — mudanças de um único commit (informe o hash)
5. Um range de commits — mudanças entre dois commits (informe `<from>..<to>`)

<!--
## Fluxo com PR (descomentar quando branch protection estiver ativa)
6. PR aberto — buscar diff via `gh pr diff <número>`
-->

Execute o comando correspondente e use o diff como base da revisão.

| Escolha | Comando |
|---------|---------|
| 1 | `git diff HEAD` |
| 2 | `git diff --cached` |
| 3 | `git diff $(git merge-base HEAD main)...HEAD` |
| 4 | `git show <hash>` |
| 5 | `git diff <from>..<to>` |

---

## Passo 1 — Investigação do codebase

Antes de revisar, leia os arquivos modificados no diff para entender o contexto. Se necessário, leia também os módulos relacionados em `apps/api/src/modules/` e `apps/web/src/`.

---

## Critérios de revisão

Severidades:
- **Critical** — bloqueia o merge; deve ser corrigido antes
- **Warning** — deve ser corrigido logo após o merge; não é bloqueador
- **Suggestion** — melhoria opcional; não bloqueia o merge

---

### 1. Segurança

- Isolamento de tenant: toda query em tabela tenant-scoped tem `WHERE tenant_id = ?`
- `tenant_id` extraído do JWT via `@TenantId()` — nunca do body do request
- Sem credenciais, tokens ou PII hardcoded no código
- Inputs validados com Zod em todas as boundaries do sistema
- Sem SQL injection (Knex parameterizado — nunca concatenar strings em queries)
- Guards corretos por rota: `JwtAuthGuard` + `RolesGuard` para agency; `JwtAuthGuard` + `TenantGuard` + `RolesGuard` para doctor
- Uploads: `basename(file.originalname)` para prevenir path traversal
- Rate limiting em endpoints públicos

### 2. Performance

- N+1 queries: padrões de acesso a dados evitam queries repetidas
- Índices: novas queries têm índices adequados para suportá-las
- Paginação: datasets grandes paginados — padrão `{ data[], pagination: { page, limit, total, totalPages } }`
- `z.coerce.number()` em DTOs de query params (HTTP entrega strings)
- Sem full table scans sem WHERE em tabelas grandes

### 3. Testes & Cobertura

- Novos endpoints e services têm testes unitários correspondentes
- Edge cases cobertos: null, lista vazia, tenant errado (isolamento), valores inválidos
- Happy path e sad path testados
- Mock Knex correto: métodos encadeáveis com `mockReturnThis()`, terminais com `mockResolvedValue()`
- `jest.mock('@/config/env', ...)` ANTES de qualquer import nos specs
- Sem queda de cobertura significativa

### 4. Arquitetura & Padrões NestJS

- Controllers apenas orquestram — lógica de negócio no Service
- DTOs validados com `createZodDto` do nestjs-zod
- `@Inject(KNEX)` com Symbol — nunca a string `'KNEX_CONNECTION'`
- `DatabaseModule` é `@Global()` — não reimportar em módulos de feature
- Mensagens de exceção em português
- `@Get('dashboard')` e rotas estáticas ANTES de `@Get(':id')` no controller
- Sem código morto, imports não usados, console.log em produção

### 5. Bugs Potenciais

- Null/undefined sem guard: variáveis que podem ser null usadas sem verificação
- Off-by-one: bounds de loop, índices, paginação
- Condições invertidas ou incompletas
- Assumir que registro existe sem verificar (retornar 404 adequado)
- Mudanças de assinatura de método não refletidas em todos os callers
- Race conditions em fluxos async
- `Knex.count()` retorna string no PostgreSQL — converter com `Number()`
- Filtros `.where()` aplicados ANTES dos terminais `limit/offset`

### 6. API Design (se o diff inclui endpoints)

- Verbos HTTP corretos (GET leitura, POST criação, PATCH atualização parcial, DELETE remoção)
- Status codes corretos (201 criação, 204 sem conteúdo, 404 não encontrado, 409 conflito, 422 validação)
- Respostas de erro seguem estrutura uniforme
- Tokens e PII no header/body — nunca na URL ou query string
- Endpoints públicos sem guards adequadamente documentados

### 7. Migrations (se o diff inclui migrations)

- Mudanças aditivas primeiro: novas colunas como nullable ou com default
- Sem `NOT NULL` sem default em tabela com dados
- Arquivo segue padrão `{NNN}_{action}_{table}.sql`
- `docs/database/schema.sql`, `migrations.md` e `entity-relationship.md` atualizados junto
- `CLAUDE.md` de módulo atualizado se necessário

### 8. Observabilidade

- Sem `console.log` deixado em código de produção
- Sem senhas, tokens ou PII nos logs
- `event_log` registrado para operações significativas (`actor_type`, `event_type`, `payload`)

### 9. Frontend (se o diff inclui `apps/web/`)

- Componentes passaram pelo `frontend` + `designer` agents
- Sem chamadas diretas à API — usar hooks TanStack Query
- `useAuthStore.getState()` para leitura fora de componente (não `useAuthStore()`)
- Invalidação de cache correta no `onSuccess` das mutations
- Acessibilidade básica: `aria-label` em botões sem texto, contraste adequado

---

## O que foi bem feito

Antes de listar os problemas, reconheça o que foi bem feito: boas decisões de design, boa cobertura de testes, abstrações limpas ou qualquer coisa que mereça ser repetida.

---

## Formato de output

Para cada problema encontrado:

### [Categoria] — [Severidade]

**Arquivo:** `caminho/do/arquivo:linha`
**Problema:** Descrição breve do problema.
**Correção:** Abordagem sugerida.

---

## Tabela de resumo

| Categoria           | Critical | Warning | Suggestion | N/A |
|---------------------|----------|---------|------------|-----|
| Segurança           |          |         |            |     |
| Performance         |          |         |            |     |
| Testes/Cobertura    |          |         |            |     |
| Arquitetura         |          |         |            |     |
| Bugs Potenciais     |          |         |            |     |
| API Design          |          |         |            |     |
| Migrations          |          |         |            |     |
| Observabilidade     |          |         |            |     |
| Frontend            |          |         |            |     |
| **Total**           |          |         |            |     |

Se nenhum problema for encontrado: "Code review aprovado — nenhum problema encontrado."
