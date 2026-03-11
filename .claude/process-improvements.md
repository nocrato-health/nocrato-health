# Melhorias de Processo — Claude Code Workflow

Ideias identificadas durante o desenvolvimento do MVP para aplicar em projetos futuros
ou no Epic 11 (polish) se houver tempo.

---

## 1. Outputs concisos nos agents

**Problema:** Agents (backend, tech-lead, QA) retornam 50-80 linhas de resultado no contexto
principal, acelerando o consumo da janela de contexto.

**Solução:** Adicionar ao final do prompt de cada agent:

```
FORMATO DE RETORNO (obrigatório, máx 20 linhas):
- Arquivos criados/modificados: lista com uma linha por arquivo
- Testes: X novos, Y total
- Decisões de design relevantes: apenas se divergirem do especificado
- Problemas encontrados: apenas se houver
Não repetir código, não listar CTs individualmente, não reproduzir outputs de terminal.
```

**Impacto estimado:** Reduz ~40% do consumo de contexto por US.

---

## 2. CLAUDE.md com links para arquivos externos

**Problema:** O `CLAUDE.md` raiz tem ~300 linhas carregadas em todo system prompt,
incluindo seções estáticas (mapa de docs, estrutura do monorepo) que raramente mudam.

**Solução:** Extrair seções estáticas para arquivos separados e referenciar via link:

```markdown
## Mapa da Documentação
→ Ver [docs/meta/doc-map.md](docs/meta/doc-map.md)

## Estrutura do Monorepo
→ Ver [docs/meta/monorepo-structure.md](docs/meta/monorepo-structure.md)
```

Manter no CLAUDE.md apenas: protocolo obrigatório, restrições não-negociáveis, stack resumida.

**Impacto estimado:** Reduz CLAUDE.md de ~300 para ~150 linhas.

---

## 3. Agents em background quando independentes

**Problema:** Tech-lead e QA rodam sequencialmente no foreground, bloqueando o contexto.

**Solução:** Quando não há dependência de output (ex: tech-lead não precisa esperar para
que o QA comece se ambos leem os mesmos arquivos), usar `run_in_background: true` e
atualizar docs enquanto aguarda.

**Cuidado:** QA deve rodar APÓS tech-lead aprovar — a sequência tem dependência lógica.
Aplicar apenas para etapas verdadeiramente independentes.

---

## 4. Não ler arquivos no contexto principal antes de delegar

**Problema:** Antes de delegar ao backend agent, leio arquivos (schema, services existentes)
para "passar contexto" — mas o agent os relê, criando duplicata no histórico.

**Solução:** Passar apenas caminhos de arquivo no prompt do agent. O agent lê por conta
própria, sem poluir o contexto principal.

**Exceção válida:** Ler para verificar se algo existe antes de decidir *se* delega.
