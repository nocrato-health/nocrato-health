# Skill: Plan

Cria plano de implementação detalhado com steps TDD, file paths exatos e code blocks.
Assume que o engineer (subagent) tem **zero contexto** do codebase e precisa de tudo mastigado.

Inspirado no Superpowers writing-plans skill. Adaptado pro contexto Nocrato Health.

---

## Quando usar

- Após `/brainstorm` aprovar um design para feature complexa
- Antes de epics com múltiplas US
- Qualquer task que toque >5 arquivos ou >2 módulos
- Refactors grandes

## Quando NÃO usar

- Task de 1-3 arquivos com escopo claro
- Bugfix simples
- Ajuste de config/env

---

## Checklist de escopo

Se o design cobre múltiplos subsistemas independentes → quebrar em planos separados.
Cada plano deve produzir software testável isoladamente.

---

## Estrutura do plano

### Header obrigatório

```markdown
# [Feature Name] — Plano de Implementação

**Goal:** [Uma frase — o que isso constrói]
**Arquitetura:** [2-3 frases sobre abordagem]
**Módulos afetados:** [lista]
**Estimativa:** [N tasks, ~Xh]

---
```

### Task structure

```markdown
### Task N: [Nome do componente]

**Arquivos:**
- Criar: `apps/api/src/modules/xxx/yyy.ts`
- Modificar: `apps/api/src/modules/xxx/zzz.ts:42-60`
- Spec: `apps/api/src/modules/xxx/yyy.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

\`\`\`typescript
describe('Yyy', () => {
  it('should do X when Y', async () => {
    const result = await service.method(input)
    expect(result).toEqual(expected)
  })
})
\`\`\`

- [ ] **Step 2: Rodar teste e confirmar que falha**

Run: `npx jest --testPathPattern=yyy --no-coverage`
Esperado: FAIL com "service.method is not a function"

- [ ] **Step 3: Implementar mínimo pra passar**

\`\`\`typescript
async method(input: Type): Promise<Result> {
  return expected
}
\`\`\`

- [ ] **Step 4: Rodar teste e confirmar que passa**

Run: `npx jest --testPathPattern=yyy --no-coverage`
Esperado: PASS

- [ ] **Step 5: Commit**

\`\`\`bash
git add apps/api/src/modules/xxx/
git commit -m "feat(xxx): add method"
\`\`\`
```

---

## Regras

- **File paths exatos.** Nunca "no diretório apropriado".
- **Code blocks completos.** Todo step com código mostra o código real — sem "implementar aqui".
- **Sem placeholders.** "TBD", "TODO", "implementar depois" são proibidos. Se não sabe, pesquise antes de planejar.
- **TDD em toda task.** Red → Green → Refactor → Commit.
- **Granularidade de 2-5 minutos por step.** Se um step leva >10 min, quebrar.
- **DRY, YAGNI.** Não planejar o que não foi pedido.
- **Commits frequentes.** Um commit por task, não por plano inteiro.

---

## Self-review

Após escrever o plano, revisar:

1. **Cobertura do spec**: toda requirement do design tem task?
2. **Placeholders**: buscar "TBD", "TODO", "implementar", "similar a Task N"
3. **Consistência de tipos**: nomes de funções/tipos usados em Task N batem com Task M?
4. **Ordem de dependência**: Task N depende de algo de Task M? Se sim, M vem antes.

Corrigir inline sem re-review.

---

## Execução

Após salvar o plano, oferecer:

> "Plano criado. Duas opções de execução:
> 1. **Subagent por task** (recomendado) — um agent por task com review entre cada
> 2. **Execução inline** — implemento sequencialmente nessa sessão
>
> Qual prefere?"

Se subagent: seguir protocolo CLAUDE.md (backend → tech-lead → qa).
Se inline: executar tasks em ordem com commits frequentes.

---

## Onde salvar

`docs/plans/YYYY-MM-DD-<feature-name>.md`

Criar `docs/plans/` se não existir.
