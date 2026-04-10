# Skill: Verify Security Fix

Fecha formalmente um item `SEC-NN` da auditoria OWASP (em `docs/security/`) validando que o fix está efetivamente no código, coberto por teste, e documentado.

Existe porque múltiplos SEC-items foram "implementados" em sessões passadas mas ficaram sem confirmação — e depois descobrimos que o commit só mexeu em 1 de 3 call sites.

---

## Quando usar

- Após terminar a implementação de um `SEC-NN` (ex: SEC-11 redact PII, SEC-14 encrypt CPF)
- Antes de marcar o item como `status: done` no doc da auditoria
- Como sanity check antes de um commit que "fecha SEC-NN"

## Quando NÃO usar

- SEC-item ainda em implementação
- Fix parcial intencional (registrar como TD, não fechar o SEC)

---

## Fluxo

1. **Ler o item `SEC-NN`** em `docs/security/` — extrair:
   - Descrição do risco
   - Call sites / arquivos afetados originalmente listados
   - Critério de pronto (se definido)

2. **Verificar código**:
   - Grep por padrões antigos (anti-pattern) em todo o repo: devem ter zero ocorrências fora de testes e comments
   - Grep pelo padrão novo nos arquivos listados no SEC: deve aparecer em TODOS
   - Para cada call site, ler o arquivo e confirmar que a mudança está presente
   - Se houver arquivo NOVO (ex: utility de redact), confirmar que existe e é importado nos call sites

3. **Verificar testes**:
   - Grep por testes do anti-pattern / do novo comportamento
   - Rodar os testes do módulo afetado (subset, não suite inteira)
   - Reportar: X testes passando, cobrindo Y/Z call sites

4. **Verificar migrations** (se aplicável):
   - Schema atualizado em `docs/database/schema.sql`
   - Entry em `migrations.md`
   - ER diagram se campo apareceu/sumiu

5. **Verificar docs**:
   - `docs/security/` atualizado: status: done + commit ref + data
   - Se a fix introduziu env var nova: `.env.example` + referência em `docs/guides/setup-dev.md`
   - `CLAUDE.md` se criou restrição nova

6. **Relatório final** (formato fixo):

```markdown
## SEC-NN Verification — {{título}}

### Code
- [ok|gap] Anti-pattern removido: N ocorrências restantes (listar se > 0)
- [ok|gap] Novo pattern presente em: X/Y call sites
  - file1.ts ✓
  - file2.ts ✓
  - file3.ts ✗ ← gap

### Tests
- [ok|gap] N testes cobrindo o fix, M/N call sites testados
- Suite: A/A passando

### Migration
- [ok|gap|n/a] schema.sql / migrations.md / ER diagram

### Docs
- [ok|gap] docs/security/ marcado done
- [ok|gap|n/a] env var documentada
- [ok|gap|n/a] CLAUDE.md atualizado

### Veredito
- [CLOSED | BLOCKED]
- Se BLOCKED: lista de ações pra fechar
```

---

## Regras

- **Nunca marcar CLOSED com gaps abertos.** Qualquer `gap` → BLOCKED + lista de ações.
- **Rodar testes de verdade**, não confiar em "deve estar passando".
- **Listar call sites verificados individualmente** — "todos ok" não serve.
- **Não implementar o fix nessa skill.** Se encontrar gap, reportar e parar. Fix é trabalho separado.
