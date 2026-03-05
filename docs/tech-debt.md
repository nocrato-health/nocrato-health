# Débitos Técnicos

Registro centralizado de decisões conscientes de simplificação que devem ser revisadas antes de produção ou conforme o projeto escalar.

Formato de prioridade: **P1** (antes do deploy) · **P2** (antes de escalar) · **P3** (conforto/qualidade)

---

## Em aberto

### TD-01 — getSlots: filtro de appointments usa range UTC fixo
**Módulo:** `booking`
**Identificado em:** US-7.2
**Prioridade:** P2

`getSlots` filtra appointments do dia com `date_time >= T00:00:00.000Z AND date_time < T23:59:59.999Z`, tratando a data como se fosse UTC. O correto seria converter os limites do dia para UTC usando o timezone do doutor (`doctors.timezone`).

**Impacto atual:** Nenhum no MVP. Todos os doutores estão em `America/Sao_Paulo` (UTC-3) com horários entre 08:00–18:00. Um appointment das 08:00 local é armazenado como T11:00Z — dentro do range. Só se manifestaria com horários após 21:00 local (T00:00Z do dia seguinte).

**Fix:** Calcular `dayStart` e `dayEnd` convertendo `date + 00:00` e `date + 23:59` para UTC usando `Intl.DateTimeFormat` ou `Date` aritmético com o offset do timezone.

---

### TD-02 — Seed de dados realista ausente
**Módulo:** `database`
**Identificado em:** Revisão pós-Epic 5
**Prioridade:** P1

O seed atual (`seed.ts`) cria apenas admin da agência. Falta um doutor completo (onboarding concluído, agent_settings configurado, working_hours preenchido), paciente de exemplo e booking token válido para testar o fluxo completo em produção.

**Fix:** Expandir `apps/api/src/database/seed.ts` com fixture realista de ponta a ponta.

---

### TD-03 — Coverage threshold não configurado no Jest
**Módulo:** `apps/api`
**Identificado em:** Revisão pós-Epic 5
**Prioridade:** P3

Não há `--coverageThreshold` no Jest config. A cobertura pode cair silenciosamente em futuras US sem alertar.

**Fix:** Adicionar threshold mínimo (sugestão: `{ statements: 80, functions: 90 }`) em `jest.config.ts`.

---

### TD-04 — CI não configurado (GitHub Actions)
**Módulo:** `infra`
**Identificado em:** Revisão pós-Epic 5
**Prioridade:** P1

Não há pipeline de CI. Testes Jest e Playwright só rodam localmente.

**Fix:** Criar `.github/workflows/ci.yml` com steps: `pnpm install` → `tsc --noEmit` → `jest` → `playwright test`.

---

### TD-05 — Mobile viewport não testado no Playwright
**Módulo:** `apps/web`
**Identificado em:** Revisão pós-Epic 5
**Prioridade:** P2

`playwright.config.ts` usa apenas Chromium desktop. A página de booking (`/book/:slug`) é acessada majoritariamente via mobile (link do WhatsApp).

**Fix:** Adicionar projeto `iphone-12` no config do Playwright para as suítes de booking (US-7.5).

---

### TD-06 — `any` explícito em jwt-auth.guard.ts
**Módulo:** `common/guards`
**Identificado em:** Health Check US-7.2
**Prioridade:** P3

`jwt-auth.guard.ts` usa `: any` em um type assertion. Não é risco de runtime — é qualidade de tipo.

**Fix:** Tipar corretamente com a interface `JwtPayload` do projeto.

---

### TD-07 — Specs de controller ausentes
**Módulo:** `auth`, `agency`, `booking`, `clinical-note`, `document`, `invite`
**Identificado em:** Auditoria pós-Epic 7
**Prioridade:** P2

Nenhum controller tem `*.controller.spec.ts`. Os testes cobrem os services, mas validações de rota, query params inválidos, respostas HTTP e guards ficam sem teste isolado. O `booking.controller.ts` é o mais crítico por ser público (sem guards).

**Fix:** Adicionar `*.controller.spec.ts` usando `Test.createTestingModule()` + `supertest`. Priorizar `booking.controller.spec.ts` por ser público.

---

### TD-08 — event_log cresce indefinidamente sem política de retenção
**Módulo:** `event-log`
**Identificado em:** ADR-007 / Auditoria pós-Epic 7
**Prioridade:** P2

A tabela `event_log` recebe uma linha por evento de negócio (appointments, documentos, notas clínicas, etc.) sem TTL ou arquivamento. Em produção com múltiplos tenants ativos, a tabela pode atingir milhões de linhas em meses, degradando queries de audit.

**Fix pós-deploy:** Definir política de retenção (sugestão: 180 dias). Implementar job de arquivamento trimestral ou particionamento por mês.

---

### TD-09 — Refresh tokens sem possibilidade de revogação imediata
**Módulo:** `auth`
**Identificado em:** ADR-006 / Auditoria pós-Epic 7
**Prioridade:** P2

Refresh tokens são stateless (não armazenados no banco). Impossível revogar sessão ativa de um usuário comprometido antes do token expirar (7 dias). Mitigação atual: access tokens curtos (15 min).

**Fix pós-escala:** Implementar Redis blacklist para refresh tokens ou armazenar hash do token no banco com flag `revoked`.

---

### TD-10 — Uploads de documentos em disco local sem backup
**Módulo:** `document`
**Identificado em:** ADR-003 / Auditoria pós-Epic 7
**Prioridade:** P2

Arquivos enviados (`/uploads/{tenantId}/`) ficam no disco da instância Hetzner sem replicação. Falha de disco = perda de todos os documentos dos pacientes.

**Fix pós-deploy:** Configurar cron job de sync para S3/R2. Longo prazo: substituir disco local por object storage (fora do escopo do MVP).

---

### TD-11 — EventEmitter2 sem retry (eventos de negócio podem ser perdidos)
**Módulo:** `agent`
**Identificado em:** ADR-014 / Auditoria pós-Epic 7
**Prioridade:** P2

`EventEmitter2` é síncrono e in-process. Se o processo NestJS cair durante a execução de um handler (ex: envio de notificação WhatsApp), o evento é descartado sem retry. O `event_log` garante rastreabilidade mas não reprocessamento automático.

**Mitigação atual:** Gravar no `event_log` ANTES de emitir o evento (já implementado) — permite reprocessamento manual.

**Fix pós-escala:** Migrar eventos críticos para BullMQ (Redis-backed) com retry automático e dead-letter queue.

---

## Resolvidos

*(nenhum ainda)*

---

## Como usar este arquivo

- Ao identificar um novo débito, adicionar entrada com ID sequencial (`TD-NN`), módulo, US de origem e prioridade.
- Ao resolver, mover para a seção **Resolvidos** com o commit de fix.
- P1 deve ser resolvido antes do Epic 11 (deploy). P2 antes de escalar. P3 é qualidade opcional.
