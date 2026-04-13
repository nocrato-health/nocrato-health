# Skill: Intel Refresh

Gera um snapshot versionado do estado do projeto em `docs/intel/` — números, contagens, estado atual — para que sessões futuras (e subagents) tenham uma referência "fresca" sem precisar re-descobrir tudo.

Diferente de memória: memória é qualitativa (padrões, decisões, feedbacks). Intel é **quantitativa e perecível** (quantos testes, quantas migrations, quais módulos existem, quais SEC-items estão abertos).

---

## Quando usar

- No início de uma sessão longa (>2h de trabalho planejado)
- Após um epic grande terminar (estado mudou significativamente)
- Antes de escrever um documento que cita números ("temos N testes", "M módulos")
- Quando suspeitar que a memória está desatualizada
- Manual pelo usuário: `/intel-refresh`

## Quando NÃO usar

- Durante trabalho ativo (custa tool calls)
- Se o último snapshot é de <2 dias e nada grande mudou

---

## Fluxo

1. **Criar `docs/intel/` se não existir.**

2. **Coletar métricas** (comandos diretos, não subagents):

   - **Git**: branch atual, últimos 10 commits, branches locais ativas
   - **Testes**: contar specs backend (`find apps/api/src -name "*.spec.ts" | wc -l`), rodar `pnpm --filter api test --listTests | wc -l`, contar e2e (`ls apps/web/e2e/*.spec.ts | wc -l`)
   - **Código**: contar módulos em `apps/api/src/modules/`, migrations em `apps/api/src/database/migrations/`, rotas em `apps/web/src/routes/`
   - **Docs**: contar ADRs, epics concluídos vs em progresso, TDs abertas (P1/P2/P3), seeds ativas, SEC-items (done vs open)
   - **Infra**: serviços rodando (docker ps | grep nocrato), portas ocupadas (lsof nos comuns)
   - **Env**: presença de envs críticas no `.env` (sem logar valores — só presente/ausente)

3. **Escrever `docs/intel/YYYY-MM-DD.md`** com frontmatter:

```markdown
---
captured_at: YYYY-MM-DD HH:MM
branch: {{branch}}
commit: {{sha curto}}
---

# Intel Snapshot — YYYY-MM-DD

## Resumo executivo
- {{1-3 bullets do que mudou desde o último snapshot}}

## Git
- Branch: ...
- Últimos commits: ...

## Código
- Módulos backend: N
- Migrations: M (última: NNN_nome)
- Rotas frontend: K

## Testes
- Unit: A/A (N specs)
- E2E: B/B (M specs)
- Último run: ...

## Docs
- ADRs: X
- Epics: Y/Z concluídos
- TDs: P1=a P2=b P3=c
- Seeds: N
- SEC-items: done=X open=Y

## Infra
- Containers up: ...
- Portas: ...

## Envs críticas (present/absent, never values)
- DOCUMENT_ENCRYPTION_KEY: present
- OPENAI_API_KEY: present
- BUGSINK_DSN: present

## Delta vs último snapshot
- {{diff em bullets: +2 migrations, +5 testes, SEC-14 closed, ...}}
```

4. **Atualizar `docs/intel/README.md`** com link para o novo snapshot (mais recente no topo). Manter só os 5 últimos links — snapshots antigos continuam no disco mas saem do índice.

5. **Reportar ao usuário**:
   - Path do snapshot criado
   - Delta executivo (2-3 linhas)
   - Nada mais.

---

## Regras

- **Nunca logar valores de env.** Só present/absent.
- **Nunca inventar números.** Se um comando falhou, marcar `unknown` no snapshot.
- **Sem subagents.** Essa skill é I/O puro, tem que ser rápida.
- **Um snapshot por dia.** Se já existe snapshot da data atual, sobrescrever (não criar YYYY-MM-DD-2).
- **Não versionar segredos.** Se algum valor vazar pro snapshot por engano, abortar e não commitar.
