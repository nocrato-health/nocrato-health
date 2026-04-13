---
id: 004
title: Branding dinâmico no portal do doutor
surfaced_by: sessão Fase 0 LGPD Session A — teste manual do portal
surfaced_at: 2026-04-13
trigger: quando fechar Sessão A e iniciar melhorias de UX do portal
priority: post-pilot
related_adrs: []
---

# Branding dinâmico no portal do doutor

## Contexto

O campo `primary_color` já existe na tabela `tenants` e é configurável pelo doutor no onboarding/settings (seção Branding). Porém, nenhum componente do portal aplica essa cor dinamicamente — o design system usa tokens estáticos (amber/cream/blue-steel). O doutor configura a cor mas não vê reflexo nenhum.

## Proposta

- Buscar `primary_color` do tenant na API (já retorna no profile/settings)
- Injetar como CSS variable (`--brand-color`) no layout do doutor (`_layout.tsx`)
- Substituir tokens estáticos amber por `var(--brand-color)` em: sidebar ativa, botões primários, headers, badges
- Gerar variantes derivadas (hover, disabled) via `color-mix()` ou HSL manipulation
- Garantir contraste acessível (texto sobre cor dinâmica) — fallback pra branco/preto conforme luminância

## Custo estimado

1-2 dias (frontend agent + designer + Playwright)

## Riscos de NÃO fazer

Doutor configura branding sem efeito visível — experiência confusa, campo parece quebrado.

## Alternativas consideradas

- Aplicar só no booking público e portal do paciente (onde o paciente do doutor vê) — mas o doutor não veria preview da própria marca
- Remover o campo — simplifica mas perde diferenciação entre tenants
