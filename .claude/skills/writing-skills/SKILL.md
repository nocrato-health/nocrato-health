# Skill: Writing Skills

Meta-skill pra criar e editar skills do Nocrato Health. Garante qualidade e consistência.

Inspirado no Superpowers writing-skills skill.

---

## Quando usar

- Ao criar uma skill nova
- Ao editar uma skill existente
- Ao portar uma skill de outro sistema (GSD, Superpowers, etc)

---

## Estrutura obrigatória de uma skill

```markdown
# Skill: [Nome]

[1-2 frases descrevendo o propósito. Sem jargão.]

---

## Quando usar
- [Cenários concretos que disparam a skill]

## Quando NÃO usar
- [Cenários onde parece que deveria usar, mas não deve]

---

## Fluxo
[Steps numerados ou seções do processo]

---

## Regras
- [Invariantes. Coisas que NUNCA devem acontecer.]
```

---

## Checklist de qualidade

Antes de considerar a skill pronta:

### 1. Trigger claro
- A `description` no frontmatter é **específica o suficiente** pra o Claude saber quando ativar?
- Teste mental: "Se eu fosse o Claude lendo 15 descriptions de skills, eu saberia quando esta aplica vs as outras?"

### 2. Sem ambiguidade com skills existentes
- Essa skill sobrepõe alguma existente?
- Se sim: qual é o boundary? Documentar no "Quando NÃO usar"

### 3. Actionable, não filosófico
- Cada step do fluxo resulta em uma **ação concreta** (tool call, pergunta, output)?
- Nenhum step é "pensar sobre X" sem output definido

### 4. Regras testáveis
- Cada regra no "Regras" pode ser **verificada objetivamente**?
- "Ser conciso" é ruim. "Máximo 3 linhas por bullet" é bom.

### 5. Tamanho apropriado
- Skills curtas (<50 linhas): provavelmente devia ser uma regra no CLAUDE.md, não uma skill
- Skills longas (>300 linhas): provavelmente precisa ser quebrada ou simplificada
- Sweet spot: 80-200 linhas

### 6. Testada com prompt natural
- Simular: "Se o usuário dissesse [X], essa skill seria ativada?"
- Testar 3 prompts que DEVEM ativar e 3 que NÃO devem

---

## Anti-patterns

| Anti-pattern | Solução |
|---|---|
| Skill que é só um checklist | Integrar no DoD ou HC existente |
| Skill que repete o CLAUDE.md | Deletar — CLAUDE.md já é lido |
| Skill muito genérica ("be careful") | Tornar específica ou deletar |
| Skill com muitos "se X, então Y" | Provavelmente são 2 skills |
| Skill que o Claude nunca dispara | Description ruim ou trigger mal definido |

---

## Registrar a skill

Após criar:

1. Arquivo em `.claude/skills/<nome>/SKILL.md`
2. Adicionar na tabela de skills do `CLAUDE.md` (se tiver trigger autônomo)
3. Se tiver trigger autônomo: adicionar na tabela "Skills autônomas — Gatilhos obrigatórios"
4. Se for manual (só via `/nome`): não precisa estar na tabela de gatilhos

---

## Regras

- **Skills são código, não prosa.** Elas moldam comportamento do agente. Tratar com o mesmo rigor de código.
- **Testar antes de commitar.** Simular mentalmente 3 cenários de ativação.
- **Uma skill por arquivo.** Nunca agrupar.
- **Sem dependências externas.** Skill deve funcionar com as tools built-in do Claude Code.
