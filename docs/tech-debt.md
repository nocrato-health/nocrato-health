---
tags: [tech-debt]
type: reference
---

# Débitos Técnicos

Registro centralizado de decisões conscientes de simplificação que devem ser revisadas antes de produção ou conforme o projeto escalar.

Formato de prioridade: **P1** (antes do deploy) · **P2** (antes de escalar) · **P3** (conforto/qualidade)

---

## Em aberto

### ~~TD-01 — getSlots: filtro de appointments usa range UTC fixo~~ ✅ RESOLVIDO
**Módulo:** `booking`
**Identificado em:** US-7.2

**Resolvido em:** TD Phase 3 fix — helper `localDayToUtcRange(date, timezone)` converte dia local para range UTC via Intl.DateTimeFormat. Extraído para `_computeSlots()` privado que centraliza a lógica (TD-12). Para `America/Sao_Paulo` (UTC-3), range agora é `T03:00:00.000Z` / `T02:59:59.999Z` do dia seguinte. CTs CT-TZ-01 e CT-TZ-02 validam.

---

### ~~TD-02 — Seed de dados realista ausente~~ ✅ RESOLVIDO
**Módulo:** `database`
**Identificado em:** Revisão pós-Epic 5

**Resolvido em:** `seed.ts` expandido com fixture completo de ponta a ponta: 2 tenants, 2 doutores, 5 pacientes, 10 consultas (todos os status), 3 notas clínicas, 2 documentos, 1 booking_token (válido 24h, phone pré-preenchido), 1 conversa de exemplo (4 mensagens). `agent_settings` da Dra. Ana inclui `evolution_instance_name='dr-ana-silva-instance'` (suporte ao TD-20), `personality`, `appointment_rules` e `faq`.

---

### ~~TD-03 — Coverage threshold não configurado no Jest~~ ✅ RESOLVIDO
**Módulo:** `apps/api`
**Identificado em:** Revisão pós-Epic 5

**Resolvido em:** TD Phase 4 fix — `coverageThreshold` adicionado ao Jest config em `package.json` com floor baseado nos valores atuais (statements: 44%, functions: 42%). Regressão de cobertura agora falha o CI.

---

### ~~TD-04 — CI não configurado (GitHub Actions)~~ ✅ RESOLVIDO
**Módulo:** `infra`
**Identificado em:** Revisão pós-Epic 5
**Prioridade:** P1

`.github/workflows/ci.yml` criado com `pnpm install` → `turbo typecheck` → `turbo test` (jest). Playwright permanece local — CI com E2E requer stack completa (DB + API + web) e é desproporcional para solo dev MVP.

---

### ~~TD-05 — Mobile viewport não testado no Playwright~~ ✅ RESOLVIDO
**Módulo:** `apps/web`
**Identificado em:** Revisão pós-Epic 5

**Resolvido em:** TD Phase 4 fix — projeto `mobile` (iPhone 12) adicionado ao `playwright.config.ts` com `testMatch: '**/booking.spec.ts'` para rodar booking E2E em viewport mobile sem duplicar toda a suite.

---

### ~~TD-06 — `any` explícito em jwt-auth.guard.ts~~ ✅ RESOLVIDO
**Módulo:** `common/guards`
**Identificado em:** Health Check US-7.2

**Resolvido em:** TD Phase 4 fix — `handleRequest` tipado com `JwtPayload` importado de `jwt.strategy`. Removidos todos os `any` do guard.

---

### ~~TD-07 — Specs de controller ausentes~~ ✅ RESOLVIDO (parcial)
**Módulo:** `health`
**Identificado em:** Auditoria pós-Epic 7

**Resolvido em:** TD Phase 1 fix — `health.controller.spec.ts` criado com 3 testes (happy path, validação ISO timestamp, propagação de erro DB). Os demais controllers já tinham specs adicionadas em Epics anteriores. 15/15 controllers agora têm spec.

---

### TD-08 — event_log cresce indefinidamente sem política de retenção
**Módulo:** `event-log`
**Identificado em:** ADR-007 / Auditoria pós-Epic 7
**Prioridade:** P2

A tabela `event_log` recebe uma linha por evento de negócio (appointments, documentos, notas clínicas, etc.) sem TTL ou arquivamento. Em produção com múltiplos tenants ativos, a tabela pode atingir milhões de linhas em meses, degradando queries de audit.

**Fix pós-deploy:** Definir política de retenção (sugestão: 180 dias). Implementar job de arquivamento trimestral ou particionamento por mês.

---

### ~~TD-09 — Refresh tokens sem possibilidade de revogação imediata~~ ✅ RESOLVIDO

**Resolvido em:** SEC-07 fix — `refresh_token_version INTEGER NOT NULL DEFAULT 0` adicionado a `agency_members` e `doctors` (migration 017). Incrementar a versão no banco (via update manual ou endpoint de logout futuro) invalida imediatamente todos os refresh tokens em circulação para aquele usuário. Token com versão divergente lança `UnauthorizedException('Refresh token revogado')`. Redis blacklist permanece como opção de melhoria futura para granularidade por token individual (vs. por usuário).

---

### ~~TD-10 — Uploads de documentos em disco local sem backup~~ ✅ RESOLVIDO (parcial)

**Resolvido em:** TD-10 fix — `scripts/backup-uploads.sh` criado no repositório. Deploy workflow configura cron diário às 03:00 que executa `rsync -a --delete uploads/ → /opt/backups/nocrato-uploads/`. Proteção contra delete acidental do app. Backup real (S3/R2) permanece como melhoria futura.

---

### ~~TD-12 — Duplicação da lógica de geração de slots entre getSlots e getSlotsInternal~~ ✅ RESOLVIDO
**Módulo:** `booking`
**Identificado em:** US-7.4 (OBS-TL-1)

**Resolvido em:** TD Phase 3 fix — método privado `_computeSlots(tenantId, date)` extraído. `getSlots` mantém apenas validação de slug+token e delega. `getSlotsInternal` é one-liner que delega. ~80 linhas de duplicação eliminadas.

---

### ~~TD-13 — getSlotsInternal silencia doutor inativo (retorna slots vazios sem NotFoundException)~~ ✅ RESOLVIDO
**Módulo:** `booking`
**Identificado em:** US-7.4 (OBS-TL-2)

**Resolvido em:** TD Phase 1 fix — `getSlotsInternal` agora lança `NotFoundException('Médico não encontrado ou inativo')` quando doctor é null. Optional chaining removido (doctor garantido non-null após o guard). Teste adicionado em `booking.service.spec.ts`.

---

### ~~TD-15 — AgentSettingsRow duplicada entre agent-settings.service.ts e onboarding.service.ts~~ ✅ RESOLVIDO
**Módulo:** `doctor`
**Identificado em:** US-8.1 (OBS-TL-1)

**Resolvido em:** TD Phase 4 fix — interface unificada `AgentSettingsRow` criada em `doctor.types.ts` com todos os campos (incluindo `evolution_instance_name`). Ambos services importam de `./doctor.types`.

---

### ~~TD-14 — formatTime/formatDateTime com timezone fixo; todayDate usa fuso local do browser~~ ✅ RESOLVIDO
**Módulo:** `apps/web` (routes/book/$slug.tsx)
**Identificado em:** US-7.5 (OBS-TL-2 tech-lead)

**Resolvido em:** TD Phase 3 fix — `formatDateTime`, `todayDate` e construção do `dateTime` agora recebem timezone explícito. `validateToken` retorna `doctor.timezone` desde Step 1. Helper `localToIso(date, time, timezone)` substitui offset `-03:00` hardcoded. Sem dependência de `America/Sao_Paulo` ou fuso do browser.

---

### ~~TD-15 — Campo phone readonly (booking) bypassável via DevTools; backend não valida correspondência~~ ✅ RESOLVIDO

**Resolvido em:** TD-15 fix — `bookAppointment` agora busca `phone` no SELECT do `booking_tokens`. Se `bookingToken.phone !== null && dto.phone !== bookingToken.phone`, lança `ForbiddenException('Token inválido')` — mesmo status dos demais casos de rejeição de token para não criar oracle de segurança. CTs CT-73-08 e CT-73-09 adicionados.

---

### ~~TD-11 — EventEmitter2 sem retry (eventos de negócio podem ser perdidos)~~ ✅ RESOLVIDO (parcial)
**Módulo:** `agent`
**Identificado em:** ADR-014 / Auditoria pós-Epic 7

**Resolvido em:** TD Phase 2 fix — decorator `@RetryOnError` criado em `common/decorators/` com retry configurável (maxRetries, baseDelayMs, backoff exponencial/linear). Aplicado nos 4 handlers `@OnEvent` do `agent.service.ts`. Try/catch removidos dos handlers (decorator gerencia retry + log final). 8 CTs para o decorator + 2 CTs para handlers com retry. Migração para BullMQ permanece como melhoria futura pós-escala.

---

### ~~TD-12/web — Timezone hardcoded `America/Sao_Paulo` no frontend de booking~~ ✅ RESOLVIDO
**Módulo:** `apps/web/routes/book/`
**Identificado em:** US-7.5 / Revisão tech-lead

**Resolvido em:** TD Phase 3 fix — coberto pelo fix de TD-14. `validateToken` agora retorna `doctor.timezone`. Frontend usa timezone explícito em `formatDateTime`, `todayDate` e `localToIso`. Offset `-03:00` removido.

---

### ~~TD-16 — `workingHours: {}` apaga horários mas não invalida step de onboarding~~ ✅ RESOLVIDO
**Módulo:** `doctor/onboarding`
**Identificado em:** US-8.3 / Revisão tech-lead (OBS-TL-1)

**Resolvido em:** TD Phase 4 fix — comentário adicionado no `onboarding.service.ts` documentando que `working_hours = {}` é estado válido pós-onboarding. O step não é exibido após `onboarding_completed=true`, portanto a inconsistência visual não se manifesta.

---

### TD-17 — Duas implementações de ativação de portal
**Módulo:** `patient`
**Identificado em:** US-9.1
**Prioridade:** P3

`appointment.service.ts` ativa o portal do paciente diretamente dentro da transação quando o status muda para `completed` (actor_type='doctor'). `patient.service.ts` tem o método `activatePortal()` standalone para uso futuro do módulo `agent/` (actor_type='system'). São dois caminhos distintos que registram entradas diferentes no `event_log`.

**Impacto atual:** Nenhum — os dois caminhos são mutuamente exclusivos no MVP. O risco é de inconsistência no `event_log` se o `agent/` precisar ativar portais que já foram ativados pelo fluxo do doutor.

**Fix:** Consolidar em US futura se o `agent/` precisar de consistência no `event_log`. Extrair a lógica de geração de código e UPDATE do paciente para `patient.service.activatePortal()`, e chamá-la de dentro da transação do `appointment.service` via injeção do `PatientService`.

---

### TD-28 — bookAppointment: race condition no findOrCreate de paciente por phone
**Módulo:** `booking`
**Identificado em:** TD Phase 4 — Playwright paralelo (QA)
**Prioridade:** P2

`bookAppointment` em `booking.service.ts` faz SELECT → INSERT sequencial para criar paciente pelo phone. Se duas transações concorrentes não encontram o paciente e ambas tentam INSERT, a segunda falha com erro `23505` (unique violation em `(tenant_id, phone)`) e retorna 500 ao paciente.

**Impacto atual:** Baixo — booking é sequencial na prática (um tab por vez). Manifestou-se em testes E2E paralelos.

**Fix:** Usar `INSERT ... ON CONFLICT (tenant_id, phone) DO UPDATE SET name = EXCLUDED.name RETURNING *` (upsert atômico), mesmo padrão de `ConversationService.getOrCreate`.

---

### ~~TD-29 — ThrottlerGuard quebra execução paralela do full suite Playwright~~ ✅ RESOLVIDO
**Módulo:** `apps/web/e2e`, `apps/api/src/modules/auth`, `apps/api/src/common/guards`
**Identificado em:** PR SEC-10/12 — regressão QA (Playwright full suite)

**Resolvido em:** Opção 1 implementada — `E2eAwareThrottlerGuard` em `apps/api/src/common/guards/e2e-throttler.guard.ts` estende `ThrottlerGuard` e sobrescreve `shouldSkip()`. Bypass triplo-guardado: requer `NODE_ENV === 'test'` **E** `env.E2E_THROTTLE_BYPASS_SECRET` setado **E** header `x-e2e-bypass` batendo com o secret. Em qualquer outro caso, delega ao `super.shouldSkip()` (comportamento idêntico ao vanilla). Substituído `@UseGuards(ThrottlerGuard)` pelo novo guard nos 3 controllers afetados (doctor-auth, agency-auth, patient-portal). `playwright.config.ts` injeta o header via `extraHTTPHeaders` consumindo `process.env.E2E_THROTTLE_BYPASS_SECRET`. Em prod (`NODE_ENV=production`) o bypass é inerte mesmo que o secret seja definido por engano.

---

### ~~TD-18 — Type guard do webhook controller não valida `data.key` antes do cast~~ ✅ RESOLVIDO em US-9.3
**Módulo:** `agent`
**Identificado em:** US-9.2 (OBS-TL-2 tech-lead)
**Resolvido em:** US-9.3 — adicionado guard `!payload.data?.key?.remoteJid` no controller antes de chamar `handleMessage`

---

### ~~TD-19 — Webhook controller sem decorator explícito de rota pública~~ ✅ RESOLVIDO
**Módulo:** `agent`
**Identificado em:** US-9.2 (OBS-TL-3 tech-lead)

**Resolvido em:** TD Phase 4 fix — decorator `@Public()` criado em `common/decorators/public.decorator.ts`. Aplicado nos controllers e endpoints públicos: `agent.controller` (class), `booking.controller` (class), `health.controller` (class), e métodos públicos dos auth controllers (login, forgot-password, etc.).

---

### ~~TD-20 — resolveTenantFromInstance não suportava múltiplos tenants ativos~~ ✅ RESOLVIDO → ⚠️ NÃO-APLICÁVEL (2026-04-20)
**Módulo:** `agent`
**Identificado em:** US-9.3 (OBS-TL-4 tech-lead)
**Resolvido em:** TD-20 fix — migration `016_add_evolution_instance_to_agent_settings.ts` adicionou coluna `evolution_instance_name VARCHAR(100) NULL` em `agent_settings`. `resolveTenantFromInstance(instanceName)` agora filtra `WHERE enabled=true AND evolution_instance_name=instanceName`. Controller extrai `payload.instance` e valida sua presença antes de chamar `handleMessage`. Isolamento de tenant garantido por instância.

**Nota 2026-04-20 (ADR-018)**: Com a remoção completa da Evolution API, `evolution_instance_name` foi dropada via migration `023_drop_evolution_instance_from_agent_settings.ts`. A resolução multitenant do agente agora usa `agent_settings.whatsapp_phone_number_id` (migration 020) pareando com `entry[].changes[].value.metadata.phone_number_id` do webhook da Meta Cloud API — mesmo princípio (identificador por-doutor), provider oficial. O TD fica preservado como histórico de entrega.

---

### ~~TD-22 — Instância OpenAI criada por mensagem recebida~~ ✅ RESOLVIDO
**Módulo:** `agent`
**Identificado em:** US-9.3 (OBS-TL-2 tech-lead)

**Resolvido em:** `new OpenAI({ apiKey: env.OPENAI_API_KEY })` movido de dentro de `handleMessage` para `private readonly openai: OpenAI` inicializado no constructor de `AgentService`. Todos os 22 testes do agent.service.spec.ts passando.

---

### ~~TD-23 — Acessos ao portal do paciente não registrados no event_log~~ ✅ RESOLVIDO

**Resolvido em:** TD-23 fix — `getPatientPortalData` agora chama `eventLogService.append(tenantId, 'patient.portal_accessed', 'patient', patientId, {})` com `await` antes das queries paralelas. Decisão consciente: falha no audit trail bloqueia o acesso (não silencia) — conformidade LGPD tem precedência sobre disponibilidade neste fluxo. 5 CTs adicionados na suite patient.service.spec.ts.

---

### TD-24 — `await eventLogService.append` no portal do paciente é trade-off de disponibilidade vs conformidade LGPD
**Módulo:** `patient`
**Identificado em:** TD-23 fix (OBS-TL-3 tech-lead / QA)
**Prioridade:** P3

`getPatientPortalData` usa `await` no registro de auditoria. Se o event_log (banco) estiver indisponível, o acesso do paciente ao portal falha com erro 500. Decisão consciente para o MVP: conformidade LGPD (não vazar acesso não auditado) tem precedência sobre disponibilidade. Risco atual baixo (banco é o mesmo da API).

**Fix pós-escala:** Se event_log migrar para serviço separado (ex: OpenSearch), implementar fire-and-forget com fallback de log local para desacoplar disponibilidade do portal da disponibilidade do serviço de auditoria.

---

### ~~TD-26 — Evento `note.created` não emitido ao criar nota via finalização de consulta~~ ✅ RESOLVIDO
**Módulo:** `appointment`
**Identificado em:** fix/session-and-clinical-notes (OBS-TL-1)

**Resolvido em:** TD Phase 1 fix — `appointment.service.ts` agora captura `note.id` via `.returning('id')` e insere `event_log` entry com `event_type: 'note.created'`, `actor_type: 'doctor'`, `actor_id: actorId`, `payload: { noteId, appointmentId, patientId }` dentro da mesma transação. Teste adicionado em `appointment.service.spec.ts`.

---

### ~~TD-27 — `toDatetimeLocal`/`fromDatetimeLocal` assume timezone do browser = timezone do médico~~ ✅ RESOLVIDO
**Módulo:** `web` (utils)
**Identificado em:** fix/doctor-portal-ux (tech-lead review)

**Resolvido em:** TD Phase 3 fix — ambas funções agora aceitam parametro opcional `timezone?: string`. Quando presente, usam `Intl.DateTimeFormat` com `timeZone` para conversão correta. Call sites em `appointments/index.tsx` e `$appointmentId.tsx` passam `profile?.timezone` via `useQuery(profileSettingsQueryOptions())`. Fallback browser-local mantido para backward compatibility.

---

### ~~TD-25 — SEC-08: resolveEmail expõe PII nos logs e enumeração de usuários~~ ✅ RESOLVIDO (parcial)
**Módulo:** `auth`
**Identificado em:** Hardening pós-Epic 10 (SEC-08)

**Resolvido em:** TD Phase 1 fix — endpoint migrado de `GET resolve-email/:email` para `POST resolve-email` com body `{ email }` (Zod validation). PII removida dos logs de URL. Frontend atualizado para `api.post`. Resposta discriminated union mantida (requisito funcional do fluxo 2-step). Risco residual: enumeração via resposta diferenciada, mitigado por ThrottlerGuard (5 req/15min por IP).

---

## Resolvidos

### TD-18 — Type guard do webhook controller não validava `data.key.remoteJid`
**Resolvido em:** US-9.3 — adicionado guard `!payload.data?.key?.remoteJid` no controller antes de chamar `handleMessage`

---

### TD-20 — WhatsAppService usava instância Evolution global (env var) em vez de por doutor
**Módulo:** `agent`
**Identificado em:** US-9.3 (OBS-TL-4 tech-lead)
**Resolvido em:** TD-20 fix (completo) — `WhatsAppService.sendText(phone, text, instanceName)` agora recebe instância como parâmetro (antes usava env global `EVOLUTION_INSTANCE`). `AgentContext` inclui `instanceName` via `loadAgentContext()`. Handlers @OnEvent usam helper `getInstanceName(tenantId)`. Regex `^[a-zA-Z0-9_-]{1,100}$` valida instanceName (SEC-TD20-01). Telefone mascarado em logs (SEC-TD20-03/LGPD). Erro 23505 tratado em `agent-settings.service.ts` (SEC-TD20-02). `EVOLUTION_INSTANCE` removida de `env.ts`.

---

### TD-21 — Erros da API OpenAI não eram capturados com contexto de tenant/phone
**Módulo:** `agent`
**Identificado em:** US-9.3 (OBS-TL-1 tech-lead)
**Resolvido em:** TD-21 fix — `agent.service.ts`: try/catch ao redor da chamada inicial e da chamada dentro do loop de tool_calls, com log contextualizado incluindo `tenant=` e `phone=`. `agent.controller.ts`: try/catch ao redor de `handleMessage` garantindo retorno 200 à Evolution API mesmo em exceções inesperadas. Novos CTs: CT-TD21-01, CT-TD21-02, CT-TD21-03.

---

### ~~TD-23/web — ErrorBoundary não invalida cache do TanStack Query ao tentar novamente~~ ✅ RESOLVIDO
**Módulo:** `apps/web/src/components/error-boundary.tsx`
**Identificado em:** US-11.1 (OBS-TL-1 tech-lead)

**Resolvido em:** TD Phase 1 fix — `queryClient.resetQueries()` chamado antes de `setState({ hasError: false })` no handler do botão "Tentar novamente". Importa singleton `queryClient` de `@/lib/query-client`. Cache limpo garante refetch de dados frescos ao re-renderizar.

---

## Como usar este arquivo

- Ao identificar um novo débito, adicionar entrada com ID sequencial (`TD-NN`), módulo, US de origem e prioridade.
- Ao resolver, mover para a seção **Resolvidos** com o commit de fix.
- P1 deve ser resolvido antes do Epic 11 (deploy). P2 antes de escalar. P3 é qualidade opcional.