# Prompt Engineering — Guia de Aplicação por Contexto

Este arquivo documenta **quando implementar** cada técnica de prompt engineering nos agentes do projeto. Não é um catálogo genérico — é um guia de decisão baseado no que já foi observado funcionando (ou não) neste projeto.

---

## Técnicas já implementadas

### Role / Persona Prompting
**Status**: Implementado em todos os agentes desde o início.

**Quando usar**: Sempre. É a camada base de qualquer agente. Define o viés, o tom e os limites de responsabilidade. Sem persona, o modelo tende a responder como assistente genérico.

**Trigger**: Criação de qualquer novo agente.

---

### Few-Shot (exemplos concretos de output)
**Status**: Implementado em `backend`, `frontend`, `dba`, `qa`, `designer`.

**Quando usar**: Quando o agente precisa produzir um artefato com formato repetível e estruturado (código, SQL, testes, CSS). Exemplos ensinam mais rápido do que descrições.

**Trigger**: O agente vai gerar código ou documentação com estrutura previsível. Se você consegue escrever um exemplo de "saída perfeita", use Few-Shot.

**Não usar quando**: O agente raciocina sobre trade-offs ou avalia algo (architect, tech-lead de revisão) — nesses casos, exemplos de output podem criar viés de confirmação.

---

### Skeleton of Thought (SoT)
**Status**: Implementado em `architect` (formato ADR) e `qa` (relatório de falha Playwright).

**Quando usar**: Quando a estrutura do output é tão importante quanto o conteúdo. O modelo preenche slots predefinidos ao invés de inventar formato.

**Trigger**: Existe um template que toda resposta do agente deve seguir (relatórios, decisões arquiteturais, checklists de aprovação).

**Diferença do Few-Shot**: Few-Shot mostra "aqui está um exemplo completo". SoT mostra "aqui está o esqueleto — preencha".

---

### Directional Stimulus (Anti-Genérico)
**Status**: Implementado em todos os agentes via seção `## Autenticidade`.

**Quando usar**: Quando o modelo tem um padrão default ruim para aquele domínio. No caso deste projeto: LLMs tendem a produzir código genérico de SaaS americano; a seção Autenticidade direciona para o domínio real (clínica brasileira, WhatsApp, doutores).

**Trigger**: Você percebe que o agente está produzindo outputs que "poderiam estar em qualquer projeto". Adicione restrições negativas explícitas ("não faça X") antes das positivas ("faça Y").

---

### Constraint-Based Prompting
**Status**: Implementado em `tech-lead`, `dba`, `backend` para isolamento de tenant.

**Quando usar**: Para regras não-negociáveis que, se violadas, causam bugs de segurança ou dados. Marcar como CRITICAL / MUST ajuda o modelo a não relativizar.

**Trigger**: Existe uma regra que nunca tem exceção no MVP (ex: toda query precisa de `tenant_id`).

---

### Decision Output Prompting (Veredito estruturado)
**Status**: Implementado em `tech-lead` via seção `## Decisão de Revisão`.

**Quando usar**: Quando o agente precisa emitir uma decisão com consequências claras (avança / não avança). Define os três estados possíveis (APROVADO / OBSERVAÇÃO / BLOQUEANTE) com critério de distinção.

**Trigger**: O agente tem papel de gatekeeper no processo (revisor, aprovador). Sem isso, a saída fica ambígua e o ciclo de aprovação quebra.

---

## Técnicas avaliadas e descartadas para este momento

### Chain of Thought (CoT)
**Status**: Avaliado pós-MVP — **não implementar agora**.

**Avaliação**: O tech-lead fez revisões corretas ao longo de 11 epics sem CoT explícito. O checklist ordenado na seção "Decisão de Revisão" já força raciocínio sequencial implícito. Não houve caso observado de veredito superficial ou incorreto durante o MVP.

**Trigger para reconsiderar**: Se revisões começarem a aprovar algo que deveria ser reprovado (vazamento de tenant, bypass de auth) sem justificar o raciocínio. Nesse momento, adicionar instrução CoT antes do checklist.

---

### ReAct (Reason → Act → Observe → Repeat)
**Status**: Avaliado pós-MVP — **não implementar agora**.

**Avaliação**: O Playwright MCP já funciona com o protocolo atual do QA (seção "Playwright via MCP"). Os testes E2E dos 11 epics rodaram sem necessidade de loop iterativo explícito — quando um seletor falhava, o QA já ajustava naturalmente. O overhead de formalizar o loop ReAct no prompt não se justifica.

**Trigger para reconsiderar**: Se o QA começar a desistir após primeira falha de seletor em UIs mais complexas (ex: formulários multi-step com estados dinâmicos no V2). Nesse momento, adicionar o protocolo ReAct ao `qa.md`.

---

## Técnicas descartadas para este projeto

| Técnica | Motivo |
|---|---|
| **Self-Consistency** | Requer múltiplas amostras e votação — muito caro e sem benefício para geração de código determinístico |
| **Tree of Thought (ToT)** | Adequado para problemas de busca com ramificações. O projeto tem decisões arquiteturais documentadas em ADRs — não precisa de ToT em runtime |
| **Zero-Shot puro** | Só usado no campo `description` do YAML para roteamento. Para geração de código, Few-Shot sempre supera Zero-Shot |

---

---

## Estratégia do Claude Principal — Custo, Contexto e Delegação

Esta seção é para o **Claude principal** (não os subagentes). Define quando e como invocar subagentes para manter o contexto principal enxuto e reduzir custo total da sessão.

---

### Quando delegar para subagente vs. resolver inline

| Situação | Decisão | Motivo |
|---|---|---|
| Revisão de código (tech-lead, dba) | **Subagente** | Lê múltiplos arquivos, produz relatório longo — polui contexto principal |
| Exploração ampla de codebase | **Subagente** | Múltiplas buscas com resultados grandes — main context não precisa ver tudo |
| Escrita de um único arquivo simples | **Inline** | Não vale overhead de subagente |
| Escrita de módulo completo (5+ arquivos) | **Subagente** | Isola o trabalho, mantém contexto principal limpo |
| Pergunta técnica pontual | **Inline** | Resposta curta, sem side effects |
| Testes + validação de critérios de aceite | **Subagente** | QA precisa de contexto próprio e ferramentas isoladas |

**Regra geral**: se a tarefa vai gerar mais de ~500 tokens de output ou exige ler mais de 3 arquivos, use subagente.

---

### Como escrever prompts eficientes para subagentes (Task tool)

O prompt passado ao subagente via Task tool **deve ser autossuficiente** — o subagente não tem acesso ao histórico da conversa principal.

**Estrutura recomendada:**

```
1. PAPEL: "Você é o [agente X] do projeto Nocrato Health V2"
2. CONTEXTO: o que já foi feito, qual US está sendo trabalhada
3. TAREFA: o que precisa ser feito agora (específico, bounded)
4. ARQUIVOS RELEVANTES: quais arquivos ler primeiro
5. OUTPUT ESPERADO: formato exato do que deve ser retornado
```

**Exemplo:**
```
Você é o tech-lead do projeto. A US-1.2 (login de doutor) acabou de ser implementada.
Revise os arquivos:
- apps/api/src/modules/auth/auth.controller.ts
- apps/api/src/modules/auth/auth.service.ts
- apps/api/src/common/guards/jwt-auth.guard.ts

Retorne exatamente:
- O veredito (APROVADO / APROVADO COM OBSERVAÇÕES / REPROVADO — BLOQUEANTE)
- Lista de issues com código BLOQUEANTE-N ou OBS-TL-N
- Nada mais
```

Quanto mais específico o output esperado, menos tokens o subagente gasta em explicações desnecessárias.

---

### Técnicas de PE para aplicar nos prompts de subagente

| Técnica | Quando aplicar no prompt do Task |
|---|---|
| **SoT (Skeleton of Thought)** | Sempre que quiser output estruturado — liste os campos esperados no prompt. Reduz tokens e facilita parse do resultado |
| **Constraint** | Quando há restrições que o subagente pode ignorar por falta de contexto ("não altere arquivos existentes", "retorne apenas o diff necessário") |
| **Few-Shot inline** | Quando o output é um formato novo que o agente não conhece — cole um exemplo curto diretamente no prompt do Task |
| **CoT explícito** | Quando o subagente precisa raciocinar (revisão, decisão) — adicione "analise cada item antes de emitir o veredito" |

---

### Isolamento de contexto — regras

1. **Cada subagente começa com contexto zero** — tudo que ele precisa saber deve estar no prompt do Task
2. **O resultado retornado é o único que entra no contexto principal** — o subagente pode ler 20 arquivos; o main context só vê o que ele devolveu
3. **Nunca passe o histórico completo da conversa para um subagente** — extraia apenas o que é relevante para aquela tarefa
4. **Subagentes de revisão devem retornar apenas o veredito + issues** — não o código revisado, não explicações longas
5. **Subagentes de implementação devem retornar apenas: "feito, arquivos criados: X, Y, Z"** — o main context lê os arquivos depois se precisar

---

## Princípio geral

> Adicionar técnicas de prompt tem custo: prompts maiores são mais lentos, mais caros, e podem introduzir instruções conflitantes. Só adicione uma técnica quando houver um problema observado que ela resolve. Não optimize prematuramente agentes que já funcionam.

> Para o Claude principal: o contexto é o recurso mais escasso. Delegate cedo, receba resultados compactos, siga em frente.
