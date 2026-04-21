# Skill: Brainstorm

Exploração colaborativa antes de implementar. Transforma uma ideia vaga em design validado com o usuário — antes de tocar em código.

Inspirado no Superpowers brainstorming skill. Adaptado pro contexto Nocrato Health.

---

## Quando usar

- Antes de features complexas (>3 arquivos ou decisão de design incerta)
- Quando o usuário pede algo ambíguo ("quero melhorar X", "adicionar Y")
- Antes de refactors arquiteturais
- Quando `/assumptions` não é suficiente (precisa explorar alternativas, não só validar premissas)

## Quando NÃO usar

- Bugfix com causa clara
- Task trivial (renomear, ajustar texto, config)
- Já existe epic doc ou ADR cobrindo a decisão
- `/assumptions` resolve (premissas claras, sem alternativas a explorar)

---

## Regra de ouro

```
NENHUMA IMPLEMENTAÇÃO SEM DESIGN VALIDADO PELO USUÁRIO.
```

Não invocar agents de implementação (backend, frontend, etc) até o usuário aprovar o design.

---

## Fluxo

### 1. Explorar contexto do projeto
- Ler arquivos, docs, commits recentes relevantes
- Entender o estado atual do que vai ser afetado

### 2. Perguntas clarificadoras (uma por vez)
- Preferir múltipla escolha quando possível
- Uma pergunta por mensagem — não sobrecarregar
- Focar em: propósito, restrições, critérios de sucesso, edge cases
- Máximo 5-6 perguntas — se precisar de mais, a task é grande demais (decompor)

### 3. Propor 2-3 abordagens
- Cada abordagem com trade-offs claros
- Liderar com a recomendada e explicar por quê
- Incluir: custo estimado, complexidade, impacto em código existente

### 4. Apresentar design
- Escalar detalhe pela complexidade (2-3 frases se simples, parágrafo se complexo)
- Cobrir: arquitetura, componentes, fluxo de dados, error handling
- Perguntar seção por seção: "Isso faz sentido?"
- Estar pronto pra voltar e ajustar

### 5. Design aprovado → próximos passos
- Se feature grande: invocar `/plan` pra criar plano de implementação
- Se feature pequena: seguir direto pro protocolo normal (branch → agents → review)
- Registrar decisões relevantes em ADR se arquitetural

---

## Regras

- **Uma pergunta por mensagem.** Não listar 5 perguntas de uma vez.
- **Não codar durante brainstorm.** Zero implementação até aprovação.
- **YAGNI agressivo.** Remover features desnecessárias do design — menos é mais.
- **Explorar alternativas.** Sempre 2-3 opções, nunca uma só.
- **Ser honesto sobre trade-offs.** "Essa opção é mais simples mas não escala" > "essa opção é perfeita".
