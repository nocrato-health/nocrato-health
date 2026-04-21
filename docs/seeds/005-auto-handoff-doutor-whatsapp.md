---
id: 005
title: Auto-handoff doutor↔agente no WhatsApp
surfaced_by: sessão LGPD Session B — discussão sobre asincronidade doutor/agente
surfaced_at: 2026-04-20
implemented_at: 2026-04-20
trigger: primeiro doutor ativo usando WhatsApp Business com pacientes reais
priority: post-pilot
status: implemented
related_adrs: []
---

# Auto-handoff doutor↔agente no WhatsApp

## Contexto

Hoje todo message recebido no webhook vai pro `processMessage()` → OpenAI → resposta automática. Se o doutor abrir o WhatsApp Business e responder manualmente a um paciente, o agente intercepta a próxima resposta do paciente e responde por cima — quebrando a conversa humana.

O doutor não vai abrir o portal pra clicar "Assumir conversa" antes de responder pelo celular. Ele simplesmente manda a mensagem.

## Proposta

Detecção automática baseada em `fromMe: true` (já recebido no webhook, hoje ignorado):

1. Adicionar `conversations.mode` (`'agent' | 'human'`, default `'agent'`)
2. Quando webhook recebe msg `fromMe: true` → marcar `mode = 'human'` + gravar timestamp
3. No `processMessage()`: se `mode = 'human'` → skip (não chamar OpenAI, não responder)
4. Timeout: se `last_fromme_at > 30min` sem nova msg do doutor → reverter pra `mode = 'agent'`
5. O timeout pode ser checado inline no `processMessage()` (sem cron):
   ```
   if (mode === 'human' && now - lastFromMeAt > 30min) → mode = 'agent'
   ```
6. Opcionalmente: botão "Devolver ao agente" no portal do doutor (atalho manual)
7. Opcionalmente: notificar o paciente quando o agente retomar ("O assistente virtual está de volta")

Migration: `ALTER TABLE conversations ADD COLUMN mode VARCHAR(20) DEFAULT 'agent'` + `last_fromme_at TIMESTAMPTZ NULL`.

## Custo estimado

1-2 dias. Migration simples, lógica no `processMessage()` e no handler de webhook (`fromMe` processing). Sem frontend obrigatório (botão no portal é nice-to-have).

## Riscos de NÃO fazer

- Doutor manda msg pro paciente, agente responde por cima → experiência confusa, parece bug
- Doutor perde confiança no sistema e desliga o agente completamente
- Risco real a partir do primeiro doutor ativo com pacientes reais

## Alternativas consideradas

- **Botão manual no portal**: descartado como requisito — doutor não vai lembrar de clicar antes de responder pelo celular
- **Análise de conteúdo da msg**: complexo e frágil — detecção automática por `fromMe` é determinística
- **Desligar agente durante horário comercial**: muito restritivo, doutor pode querer que o agente responda fora do horário
