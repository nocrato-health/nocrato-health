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

## Proposta (implementada em 2026-04-20)

Detecção automática do lado do WhatsApp Business:

1. ✅ Adicionar `conversations.mode` (`'agent' | 'human'`, default `'agent'`) — migration 022
2. ✅ Adicionar `conversations.last_fromme_at TIMESTAMPTZ NULL` — migration 022
3. ✅ Webhook da Meta Cloud API recebe evento `statuses[].status === 'sent'` com `recipient_id` quando o doutor envia uma mensagem pelo WhatsApp Business app → `agentService.handleDoctorMessage()` → `conversationService.activateHumanMode()` → marca `mode='human'` + `last_fromme_at=now()` (usando `INSERT ... ON CONFLICT` pra cobrir caso onde o doutor escreve primeiro)
4. ✅ `processMessage()` chama `conversationService.shouldAgentRespond()` antes de invocar OpenAI — se `mode='human'`, retorna early sem responder
5. ✅ Auto-revert inline: se `mode='human'` e `last_fromme_at > 30min atrás`, o próprio `shouldAgentRespond()` atualiza `mode='agent'` e retorna `true` (agente volta a responder)
6. ✅ Endpoint manual `PATCH /api/v1/doctor/whatsapp/conversations/:phone/mode` — doutor pode forçar retorno ao agente pelo portal

**Nota histórica**: a proposta original usava `fromMe=true` da Evolution API. Em 2026-04-20 o projeto migrou pra Meta Cloud API exclusivamente (risco de ban do WhatsApp Business com providers não-oficiais). A detecção foi reimplementada via webhook `statuses` que o Meta envia quando a business account envia mensagens — equivalente funcional com fonte oficial.

## Custo estimado (realizado)

~1 dia. Migration + lógica no webhook Cloud + testes unitários.

## Riscos de NÃO fazer

Eliminados pela implementação.

## Alternativas consideradas

- **Botão manual no portal**: descartado como requisito, mas implementado como atalho (`PATCH conversations/:phone/mode`)
- **Análise de conteúdo da msg**: complexo e frágil — detecção determinística via evento Meta é superior
- **Desligar agente durante horário comercial**: muito restritivo, doutor pode querer que o agente responda fora do horário
