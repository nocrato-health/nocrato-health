# Skill: Plant Seed

Captura rápida de ideia tangencial em `docs/seeds/` sem sair do fluxo de trabalho atual.

Diferente de uma TD ou issue, uma **seed** é uma possibilidade futura — algo que talvez nunca aconteça, mas que queremos preservar se um gatilho específico disparar. Ver `docs/seeds/README.md` para a filosofia completa.

---

## Quando usar

- Durante trabalho normal, quando surge uma ideia "legal, mas não agora"
- Ao descobrir uma melhoria arquitetural durante implementação de outra coisa
- Após um code review, quando um revisor menciona "poderíamos fazer X no futuro"
- Durante planejamento, quando uma alternativa é descartada mas vale preservar

## Quando NÃO usar

- É um bug → criar issue ou direto no tech-debt
- É uma tarefa do roadmap atual → criar US no epic
- É um débito técnico existente → adicionar em `docs/tech-debt.md`
- É uma decisão já tomada → ADR em `docs/architecture/decisions.md`

---

## Argumentos

Suporta duas formas:

**1. Posicional (rápido):**
```
/seed "título curto" "condição observável que dispara a revisão"
```

**2. Interativo (fallback se argumentos faltarem):** a skill pergunta título, trigger e (opcionalmente) contexto adicional via `AskUserQuestion`.

---

## Fluxo de execução

1. **Determinar próximo ID sequencial:**
   - Listar arquivos em `docs/seeds/` matching `NNN-*.md`
   - Extrair o maior N e incrementar
   - Formato: 3 dígitos zero-padded (`001`, `002`, `003`...)

2. **Construir slug do título:**
   - Lowercase
   - Remover acentos
   - Substituir espaços e caracteres não-alfanuméricos por `-`
   - Remover hífens duplicados e trailing/leading hífens
   - Máximo 60 caracteres
   - Exemplo: `"Envelope Encryption por Tenant"` → `envelope-encryption-por-tenant`

3. **Criar arquivo `docs/seeds/NNN-slug.md`** com o template frontmatter preenchido:

   ```markdown
   ---
   id: NNN
   title: {{título}}
   surfaced_by: {{breve — de onde surgiu a ideia, ex: "sessão X", "ADR-NNN", "code review PR #NN"}}
   surfaced_at: YYYY-MM-DD
   trigger: {{condição observável}}
   priority: {{post-scale | post-pilot | defer | never-unless-forced}}
   related_adrs: []
   ---

   # {{título}}

   ## Contexto

   {{Por que a ideia surgiu. O estado atual que motivou o pensamento.}}

   ## Proposta

   {{O que seria feito se o trigger acontecesse. Grosseiro — só o suficiente
   pra ser útil quando alguém reencontrar no futuro.}}

   ## Custo estimado

   {{Grosseiro: "1 sprint", "1-2 dias", "semana inteira com QA"}}

   ## Riscos de NÃO fazer

   {{O que acontece se a seed for ignorada mesmo após o trigger disparar.}}

   ## Alternativas consideradas

   {{Outras abordagens que já pensou.}}
   ```

4. **Preencher os campos que você já sabe:**
   - `id`, `title`, `trigger` dos argumentos
   - `surfaced_at` com a data atual (`date +%Y-%m-%d`)
   - `surfaced_by` baseado no contexto da sessão atual (ex: "sessão Fase 0 LGPD item 4")
   - **Os placeholders `{{...}}` nas seções de conteúdo**: deixar conforme template pra usuário preencher depois OU preencher baseado no contexto se você tiver evidência suficiente. Não invente conteúdo.

5. **Determinar a `priority`** com heurística:
   - `post-scale`: trigger é "quando escalar" / "quando tiver N+ clientes"
   - `post-pilot`: trigger é "depois do primeiro doutor real" / "quando houver dados reais"
   - `defer`: trigger é "quando decidirmos fazer X"
   - `never-unless-forced`: trigger é "se sofrer incidente" / "se requisito legal mudar"

6. **Atualizar o índice em `docs/seeds/README.md`:**
   - Localizar a tabela "Índice de seeds ativas"
   - Adicionar nova linha no final, antes de qualquer linha de fechamento
   - Formato: `| [NNN](NNN-slug.md) | Título | Surfaced by | Trigger | Priority |`

7. **Reportar ao usuário:**
   - Confirmar criação do arquivo com path relativo
   - Mostrar linha adicionada ao índice
   - Lembrar: "Completar as seções de Contexto/Proposta/Custo/Riscos quando tiver 2 minutos. Agora volta ao fluxo anterior."

---

## Exemplo concreto

Usuário digita:
```
/seed "Cache de DEK por tenant com TTL" "quando migrar pra envelope encryption"
```

Skill cria `docs/seeds/004-cache-de-dek-por-tenant-com-ttl.md`:

```markdown
---
id: 004
title: Cache de DEK por tenant com TTL
surfaced_by: sessão meta-infra 2026-04-09
surfaced_at: 2026-04-09
trigger: quando migrar pra envelope encryption
priority: post-scale
related_adrs: []
---

# Cache de DEK por tenant com TTL

## Contexto

{{preencher depois}}

## Proposta

{{preencher depois}}

[... seções restantes com placeholders ...]
```

E adiciona ao `README.md`:
```markdown
| [004](004-cache-de-dek-por-tenant-com-ttl.md) | Cache de DEK por tenant com TTL | sessão meta-infra 2026-04-09 | Quando migrar pra envelope encryption | post-scale |
```

---

## Regras

- **Uma seed por invocação.** Não agrupar múltiplas ideias num arquivo.
- **Nunca sobrescrever** uma seed existente. ID é sempre novo.
- **Não gerar conteúdo inventado** para as seções Contexto/Proposta/Custo/Riscos se não houver informação real no contexto da conversa. Prefira placeholders.
- **Ser rápido.** Toda a operação deve caber em 3-5 tool calls. Essa skill existe pra **não interromper** o fluxo principal.
- **Mensagem final curta.** Confirmar criação em 1-2 linhas, lembrar de preencher depois, sair.
