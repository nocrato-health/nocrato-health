# Agent Prompt Template (canônico)

Template de referência para invocar subagents via `Agent` tool. **Não é enforced por hook** — é um check humano antes de delegar.

Usar para: backend, frontend, designer, tech-lead, qa, dba, devops, security, doc-verifier, debugger.

---

## Checklist antes de chamar Agent

- [ ] **Base correta**: worktree parte da branch atual (`feat/...`), não de `main` velho. Se agent vai rodar em worktree, garantir que `HEAD` da branch tem os commits necessários.
- [ ] **Escopo explícito**: lista de arquivos ou módulos que PODE tocar. Lista do que NÃO pode tocar.
- [ ] **Critério de pronto**: como vou saber que terminou? (testes passando / endpoint responde / UI renderiza)
- [ ] **Contexto suficiente**: epic doc, schema, flow relevante linkados — subagent não tem minha conversa.
- [ ] **Restrições não-negociáveis**: tenant isolation, guards obrigatórios, nomenclatura, padrões do módulo (consultar MEMORY.md relevante).
- [ ] **Relatório esperado**: forma da resposta (patch diff / report markdown / test results). Limite de palavras se for research.

---

## Esqueleto do prompt

```
# Tarefa
{{uma frase — o quê e por quê}}

# Contexto
- Branch base: feat/xxx (HEAD: abc1234 — verificar com git log -1 --oneline antes de editar)
- Epic / doc: docs/roadmap/epic-N-xxx.md
- Módulo alvo: apps/api/src/modules/{{modulo}}/
- Convenções do módulo: ver MEMORY.md → seção "Módulo {{modulo}}/"

# Escopo
Pode tocar:
- arquivo1.ts
- arquivo2.spec.ts

Não pode tocar:
- nenhum arquivo em apps/web/
- nenhuma migration já commitada
- CLAUDE.md (só eu altero)

# Restrições não-negociáveis
- Tenant isolation: toda query tenant-scoped com WHERE tenant_id
- Injetar Knex via @Inject(KNEX) (Symbol) — nunca string
- Mensagens de exceção em PT-BR
- Specs: jest.mock('@/config/env', ...) ANTES de qualquer import

# Critério de pronto
- [ ] Endpoint X responde {...}
- [ ] Specs CT-NN-01 a CT-NN-05 passando
- [ ] Typecheck limpo
- [ ] Sem alterações fora do escopo listado

# Relatório esperado
- Diff resumo (arquivos modificados + linhas)
- Resultado dos testes (X/Y passando)
- Qualquer premissa que você teve que fazer (listar explicitamente — se INCERTA, parar e perguntar, não adivinhar)
```

---

## Regras

- **Nunca delegue entendimento.** Se você não entende a tarefa, não é o subagent que vai descobrir. Entenda primeiro, delegue depois.
- **Nunca delegue sem verificar a base da worktree.** Subagents em worktree baseada em main desatualizado reverteram commits 2× na sessão Fase 0 LGPD.
- **Restrinja o escopo por arquivo.** "Implemente o módulo X" é ruim. "Edite `x.service.ts`, `x.controller.ts`, `x.service.spec.ts`" é bom.
- **Peça relatórios curtos.** Research → ≤200 palavras. Implementação → diff + testes, sem narrativa.
- **Subagents não veem esta conversa.** Linkar docs relevantes explicitamente.
- **Tech-lead e security rodam no contexto principal** (read-only, não precisam de worktree).
