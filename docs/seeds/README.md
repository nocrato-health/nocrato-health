---
tags: [meta, ideas]
type: index
---

# Seeds — Ideias tangenciais com gatilho

## O que é

**Seeds** são ideias, insights e possibilidades que surgem durante o trabalho mas **não são dívidas técnicas**. Diferença chave:

| | Tech Debt (`docs/tech-debt.md`) | Seed (`docs/seeds/`) |
|---|---|---|
| Natureza | Algo está errado ou sub-ótimo agora | Algo **poderia** ser feito no futuro |
| Ação | Tem que ser resolvido eventualmente | Só vira ação se o **trigger** for disparado |
| Exemplo | TD-28: race condition no booking | Seed: envelope encryption por tenant quando escalar |
| Pressão | Acumula risco | Zero pressão — pode nunca acontecer |

Seeds **não entram em priorização de sprint**. Elas ficam dormentes até que o **gatilho** documentado seja observado no projeto.

## Por que existe este diretório

Sem seeds, ideias tangenciais ou se perdem (esquecidas) ou poluem o `tech-debt.md` (que fica enorme e confuso). Seeds preservam o pensamento sem criar obrigação.

Caso real que motivou a criação (sessão Fase 0 LGPD):
- Enquanto implementava criptografia de documentos com chave única (`DOCUMENT_ENCRYPTION_KEY`), surgiu a ideia de envelope encryption por tenant.
- Envelope encryption é mais seguro mas **overkill pro MVP com 1 doutor**.
- Não é tech debt — a implementação atual é correta pro escopo.
- Também não é roadmap — não há cliente pedindo.
- É uma possibilidade que **pode** virar necessidade se aparecer compliance HIPAA/PCI ou >5 clínicas.

Isso é uma seed clássica.

## Formato

Arquivo único por seed, nomeado `NNN-kebab-case-title.md` onde `NNN` é sequencial (001, 002, ...).

```markdown
---
id: 001
title: Título curto e descritivo
surfaced_by: O que fez a ideia aparecer (ex: "ADR-017 seção 1", "code review PR #14")
surfaced_at: YYYY-MM-DD
trigger: Condição observável que justifica revisitar. Seja específico.
priority: post-scale | post-pilot | defer | never-unless-forced
related_adrs: [ADR-017, ...]  # opcional
---

# Título

## Contexto

Por que a ideia surgiu. O estado atual que motivou o pensamento.

## Proposta

O que seria feito se o trigger acontecesse. Não precisa ser detalhado —
basta o suficiente pra ser útil quando alguém (você ou outro dev)
reencontrar o arquivo no futuro.

## Custo estimado

Grosseiro. "1 sprint", "1-2 dias", "semana inteira com QA", "épico novo".

## Riscos de NÃO fazer

O que acontece se a seed for ignorada mesmo após o trigger disparar.
Se a resposta for "nada grave", talvez seja uma seed permanentemente dormente.

## Alternativas consideradas

Se você já pensou em outras abordagens.
```

## Workflow

1. **Captura**: durante trabalho normal, quando uma ideia surgir, criar arquivo novo. Não interromper o fluxo principal.
2. **Revisão periódica**: a cada merge de branch grande, passar o olho em `docs/seeds/` e marcar seeds cujos triggers apareceram como `status: triggered` (mover pro tech-debt ou criar issue).
3. **Purga**: seeds mais antigas que 1 ano sem ação podem ser arquivadas em `docs/seeds/archive/` ou deletadas se forem claramente obsoletas.

## Regras

- **Uma seed por arquivo**, sempre. Não agrupar.
- **Trigger concreto e observável**, não subjetivo. "Quando o projeto escalar" é ruim. "Quando tiver 5+ doutores ativos" é bom.
- **Não copiar código** extenso para dentro da seed — ela é memória, não documentação de implementação.
- **Não confundir com ADR**. ADR é "decisão tomada". Seed é "possibilidade".
- **Não confundir com Roadmap**. Roadmap é "vamos fazer". Seed é "talvez um dia".

## Skill `/seed` (futura)

Planejado: comando curto pra capturar seeds sem sair do fluxo.

```
/seed "envelope encryption por tenant" "5+ doutores ou HIPAA"
```

Cria o arquivo com template preenchido e ID sequencial. Ainda não implementado.

## Índice de seeds ativas

<!-- Atualizar manualmente ao adicionar nova seed. A primeira coluna linka pro arquivo. -->

| # | Título | Surfaced by | Trigger | Priority |
|---|---|---|---|---|
| [001](001-envelope-encryption-per-tenant.md) | Envelope encryption por tenant | ADR-017 seção 1 | 5+ doutores OU compliance HIPAA/PCI | post-scale |
| [002](002-logging-interceptor-redacao-headers.md) | LoggingInterceptor com redação de headers | Code review PR #14 (OBS-TL-1) | Decidir logar requests no futuro | defer |
| [003](003-rotacao-document-encryption-key.md) | Rotação da chave de criptografia de documentos | ADR-017 seção 1 | Key comprometida OU >1 ano em prod | post-pilot |
| [004](004-branding-dinamico-no-portal-do-doutor.md) | Branding dinâmico no portal do doutor | Teste manual Fase 0 LGPD | Fechar Sessão A + melhorias UX portal | post-pilot |
