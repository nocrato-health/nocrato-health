# Skill: Assumptions

Extrai e registra premissas implícitas **antes** de iniciar um planejamento não-trivial. Força o usuário (e você) a tornar explícito o que está sendo assumido — para não descobrir no meio do caminho que a base era outra.

---

## Quando usar

- Antes de abrir uma US nova com ambiguidade ("como exatamente isso deve funcionar?")
- Ao receber um bugfix com causa raiz desconhecida
- Antes de uma migration destrutiva (dados serão perdidos?)
- Antes de um refactor que toca >3 módulos
- Sempre que você se pegar preenchendo lacunas "pelo contexto"

## Quando NÃO usar

- Tarefa trivial (typo, renomear variável, ajuste de cópia)
- Já existe ADR ou epic doc cobrindo a decisão
- Bugfix com stack trace claro apontando o culpado

---

## Fluxo

1. **Listar 3-8 premissas** que você está fazendo sobre a tarefa. Categorias típicas:
   - **Escopo**: o que está dentro/fora
   - **Dados**: estado atual do banco, volume, constraints
   - **Comportamento**: o que deve acontecer nos casos limite
   - **Dependências**: libs/serviços/envs que precisam existir
   - **Reversibilidade**: o que acontece se errar
   - **Stakeholders**: quem aprova, quem é afetado

2. **Para cada premissa, classificar:**
   - `CERTA` — tenho evidência direta no código/docs
   - `PROVÁVEL` — inferi do contexto, mas não verifiquei
   - `INCERTA` — estou chutando

3. **Validar as `PROVÁVEL` e `INCERTA`** ativamente:
   - `CERTA`: seguir
   - `PROVÁVEL`: ler o código/doc relevante pra confirmar antes de prosseguir
   - `INCERTA`: **parar e perguntar ao usuário** via `AskUserQuestion`

4. **Saída**: bloco markdown com as premissas classificadas + o que foi validado. Se o usuário respondeu perguntas, incluir as respostas.

---

## Template de saída

```markdown
## Assumptions — {{tarefa}}

### Escopo
- [CERTA] X está dentro | evidência: `file.ts:42`
- [PROVÁVEL→VALIDADA] Y está fora | verificado em `docs/roadmap/epic-N.md`
- [INCERTA→RESPONDIDA] Z é manual ou automatizado? | usuário: "manual"

### Dados
- [CERTA] N linhas em tabela X, prod vazio
- [INCERTA→RESPONDIDA] backfill OK perder? | usuário: "sim, dev vazio"

### Comportamento
- [PROVÁVEL→VALIDADA] endpoint retorna 404 se not found | visto em service.ts:88

### Riscos
- Se premissa Y estiver errada: {{consequência}}
```

---

## Regras

- **Máximo 8 premissas.** Se passar disso, a tarefa está grande demais — quebrar antes.
- **Toda `INCERTA` vira pergunta.** Não prosseguir assumindo.
- **Toda `PROVÁVEL` tem que virar `VALIDADA` ou `RESPONDIDA`** antes da implementação começar.
- **Arquivar o bloco** no topo do PR description ou no epic doc se for US maior. Premissas descobertas tarde são origem de bugs.
