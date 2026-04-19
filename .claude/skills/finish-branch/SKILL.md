# Skill: Finish Branch

Guia estruturado pra completar uma branch de desenvolvimento. Verifica testes, apresenta opções claras, e executa a escolha.

Inspirado no Superpowers finishing-a-development-branch skill.

---

## Quando usar

- Implementação terminada, testes passando
- Antes de commit final / PR / merge
- Ao finalizar qualquer branch de feature, bugfix, ou TD

---

## Fluxo

### Step 1: Verificar testes

```bash
pnpm --filter @nocrato/api exec tsc --noEmit
pnpm --filter @nocrato/web exec tsc -p tsconfig.app.json --noEmit
cd apps/api && npx jest --no-coverage
```

**Se testes falham:** parar. Não prosseguir até resolver.

### Step 2: Determinar branch base

```bash
git merge-base HEAD main 2>/dev/null
```

Confirmar com o usuário: "Essa branch partiu de `main`?"

### Step 3: Apresentar opções

```
Implementação completa. O que deseja fazer?

1. Commit + Push + Criar PR
2. Merge local em main (sem PR)
3. Manter a branch como está (eu cuido depois)
4. Descartar esse trabalho
```

Apresentar as 4 opções sem explicação adicional — conciso.

### Step 4: Executar escolha

**Opção 1 — PR (padrão):**
1. Commit com Conventional Commits
2. `git push -u origin <branch>`
3. `gh pr create` com title + body
4. Rodar `/code-review` (obrigatório pelo protocolo)

**Opção 2 — Merge local:**
1. `git checkout main && git pull`
2. `git merge <branch>`
3. Rodar testes no merge result
4. Se falhar: `git merge --abort`

**Opção 3 — Manter:**
- Nada a fazer. Confirmar nome da branch e sair.

**Opção 4 — Descartar:**
- Confirmar com o usuário (irreversível)
- `git checkout main && git branch -D <branch>`

---

## Regras

- **Nunca mergear com testes falhando.** Step 1 é gate obrigatório.
- **Nunca fazer merge em main sem confirmar com o usuário.**
- **Opção 1 (PR) é o padrão.** Sugerir como recomendada.
- **Rodar /code-review antes de todo merge/PR** (protocolo CLAUDE.md).
