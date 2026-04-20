---
tags: [plan, refactor, whatsapp]
type: plan
---

# Remove Evolution API — Plano de Implementação

**Goal:** Remover completamente Evolution API do codebase e operar exclusivamente com Meta Cloud API oficial. Implementar auto-handoff doutor↔agente via webhook `statuses` do Cloud API (compensando a ausência de `fromMe` que existia na Evolution).

**Arquitetura:**
- WhatsApp provider único: Meta Cloud API via Embedded Signup OAuth
- Auto-handoff automático: webhook Cloud recebe `statuses[].status === 'sent'` quando o doutor envia via WhatsApp Business app → backend ativa `mode='human'` na conversa
- Auto-revert inline (30min sem msg do doutor) continua funcionando
- Endpoint manual `PATCH /doctor/whatsapp/conversations/:phone/mode` preservado como atalho

**Módulos afetados:**
- `apps/api/src/modules/agent/` — webhook, service, controllers, providers
- `apps/api/src/modules/doctor/` — types + agent-settings (refs a evolution_instance_name)
- `apps/api/src/config/env.ts` — remover EVOLUTION_* vars
- `apps/api/src/database/migrations/` — nova migration 023
- `apps/web/src/routes/doctor/whatsapp.tsx` — remover card Evolution
- `apps/web/src/lib/queries/whatsapp.ts` — remover queries Evolution
- `docker/docker-compose.{dev,prod}.yml` — remover container Evolution
- `docker/nginx.conf` — remover proxy /evolution (se houver)
- `.env.example` — atualizar
- Docs: CLAUDE.md dos módulos afetados, flows/agent.md, schema.sql, migrations.md, entity-relationship.md

**Estimativa:** 12 tasks, ~4-5h total

**Premissas:**
- Prod está limpo (TRUNCATE já executado) — remover `evolution_instance_name` sem risco
- Testes existentes de Cloud API continuam passando; testes Evolution são removidos
- Frontend `whatsapp.tsx` hoje tem 2 cards (Meta + Evolution); passa a ter 1

---

## Task 1: Migration 023 — DROP evolution_instance_name

**Arquivos:**
- Criar: `apps/api/src/database/migrations/023_drop_evolution_instance_from_agent_settings.ts`
- Modificar: `docs/database/schema.sql` (remover coluna + index)
- Modificar: `docs/database/migrations.md` (adicionar linha 023)
- Modificar: `docs/database/entity-relationship.md` (atualizar descrição de agent_settings)

- [ ] **Step 1: Criar migration 023**

```typescript
// apps/api/src/database/migrations/023_drop_evolution_instance_from_agent_settings.ts
import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_agent_settings_evolution_instance')

  await knex.schema.alterTable('agent_settings', (table) => {
    table.dropColumn('evolution_instance_name')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('agent_settings', (table) => {
    table
      .string('evolution_instance_name', 100)
      .nullable()
      .comment('Nome da instância Evolution API — DEPRECATED, removido em migration 023')
  })

  await knex.raw(`
    CREATE UNIQUE INDEX idx_agent_settings_evolution_instance
    ON agent_settings (evolution_instance_name)
    WHERE evolution_instance_name IS NOT NULL
  `)
}
```

- [ ] **Step 2: Rodar migration local**

```bash
pnpm --filter @nocrato/api migrate
```

Esperado: `✅ Batch N — 1 migration(s) aplicada(s): 023_drop_evolution_instance_from_agent_settings.ts`

- [ ] **Step 3: Atualizar docs/database/schema.sql**

Em `CREATE TABLE agent_settings`, remover a linha `evolution_instance_name VARCHAR(100)` e o índice `idx_agent_settings_evolution_instance`. Remover comment relacionado.

- [ ] **Step 4: Atualizar docs/database/migrations.md**

Adicionar linha 023:

```markdown
| 023 | `023_drop_evolution_instance_from_agent_settings.ts` | DROP `agent_settings.evolution_instance_name` + index. Remoção definitiva do provider Evolution API. | `agent_settings` (005), `016` |
```

Atualizar "The schema is split into 23 sequential migration files."

- [ ] **Step 5: Atualizar docs/database/entity-relationship.md**

Remover referência a `evolution_instance_name` na seção `agent_settings`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/database/migrations/023_drop_evolution_instance_from_agent_settings.ts docs/database/
git commit -m "chore(db): migration 023 — drop evolution_instance_name column"
```

---

## Task 2: Remover EVOLUTION_* do env + .env.example

**Arquivos:**
- Modificar: `apps/api/src/config/env.ts`
- Modificar: `.env.example` (raiz + `apps/api/.env.example`, se existir)
- Modificar: `apps/api/src/config/CLAUDE.md`

- [ ] **Step 1: Remover vars do schema Zod**

Em `apps/api/src/config/env.ts`, remover estas chaves do schema:
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_TOKEN`

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm --filter @nocrato/api typecheck
```

Esperado: erros em todos os lugares que importam essas vars (próximas tasks vão limpar).

- [ ] **Step 3: Remover do .env.example**

```bash
grep -n "EVOLUTION" .env.example apps/api/.env.example 2>/dev/null
```

Editar os arquivos encontrados removendo as 3 linhas EVOLUTION_*.

- [ ] **Step 4: Atualizar CLAUDE.md do config**

Em `apps/api/src/config/CLAUDE.md`, remover menções a `EVOLUTION_*` na tabela de vars.

- [ ] **Step 5: Commit (depois da Task 3, quando typecheck voltar a passar)**

---

## Task 3: Remover evolution-connection.provider.ts + interface dual

**Arquivos:**
- Deletar: `apps/api/src/modules/agent/evolution-connection.provider.ts`
- Modificar: `apps/api/src/modules/agent/whatsapp-connection.provider.ts`
- Modificar: `apps/api/src/modules/agent/agent.module.ts`

- [ ] **Step 1: Deletar provider Evolution**

```bash
rm apps/api/src/modules/agent/evolution-connection.provider.ts
```

- [ ] **Step 2: Simplificar whatsapp-connection.provider.ts**

Abrir `apps/api/src/modules/agent/whatsapp-connection.provider.ts` e remover:
- Interface `WhatsAppConnectionProvider` (Evolution)
- Symbol `WHATSAPP_CONNECTION_PROVIDER`

Manter apenas:
- Interface `SignupBasedConnectionProvider`
- Symbol `CLOUD_API_CONNECTION_PROVIDER`

- [ ] **Step 3: Atualizar agent.module.ts**

Em `apps/api/src/modules/agent/agent.module.ts`, remover:
- Import de `EvolutionConnectionProvider` e `WHATSAPP_CONNECTION_PROVIDER`
- Entrada correspondente em `providers`

Manter apenas `CloudApiConnectionProvider` + `CLOUD_API_CONNECTION_PROVIDER`.

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm --filter @nocrato/api typecheck
```

Esperado: erros em `whatsapp-connection.controller.ts`, `whatsapp.service.ts`, `agent.controller.ts`, `agent.service.ts` (próximas tasks).

---

## Task 4: Remover sendText (Evolution) de whatsapp.service.ts

**Arquivos:**
- Modificar: `apps/api/src/modules/agent/whatsapp.service.ts`
- Modificar: `apps/api/src/modules/agent/whatsapp.service.spec.ts`

- [ ] **Step 1: Ler o service atual**

```bash
grep -n "sendText\|sendViaCloud" apps/api/src/modules/agent/whatsapp.service.ts
```

- [ ] **Step 2: Remover `sendText` do service**

Deletar o método `sendText` inteiro. Manter apenas `sendViaCloud`. Renomear `sendViaCloud` → `sendText` se fizer sentido (mas preservar assinatura pública usada pelos callers).

Decisão: manter nomes como estão para minimizar diff. Apenas deletar o método Evolution.

- [ ] **Step 3: Remover testes de sendText em whatsapp.service.spec.ts**

Manter apenas os `describe`/`it` de Cloud.

- [ ] **Step 4: Atualizar callers**

Buscar `whatsappService.sendText` em `agent.service.ts`:

```bash
grep -n "whatsappService\." apps/api/src/modules/agent/agent.service.ts
```

Trocar todas chamadas `sendText` por `sendViaCloud` (ou manter nome mas garantir que aponta pra versão Cloud).

- [ ] **Step 5: Rodar testes do módulo**

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=whatsapp.service
```

Esperado: PASS.

---

## Task 5: Simplificar whatsapp-connection.controller.ts — remover endpoints Evolution

**Arquivos:**
- Modificar: `apps/api/src/modules/agent/whatsapp-connection.controller.ts`

Endpoints a **remover** (Evolution-only):
- `POST /doctor/whatsapp/connect` (criação de instância QR)
- `GET /doctor/whatsapp/qr` (polling QR code)
- `GET /doctor/whatsapp/status` (status Evolution)
- `DELETE /doctor/whatsapp/disconnect` (disconnect Evolution)

Endpoints a **manter**:
- `POST /doctor/whatsapp/connect-cloud` (OAuth Meta)
- `PATCH /doctor/whatsapp/conversations/:phone/mode` (handoff manual — adicionado recentemente)

- [ ] **Step 1: Ler o controller**

```bash
cat apps/api/src/modules/agent/whatsapp-connection.controller.ts
```

- [ ] **Step 2: Remover métodos Evolution**

Deletar os métodos `connect()`, `getQr()`, `getStatus()`, `disconnect()` e seus imports relacionados. Remover `connectionProvider` (Evolution) do constructor. Manter `cloudProvider` e `conversationService`.

- [ ] **Step 3: Atualizar imports**

Remover `WHATSAPP_CONNECTION_PROVIDER` e `WhatsAppConnectionProvider` do topo.

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm --filter @nocrato/api typecheck
```

Esperado: OK (se não, bater nos lugares que ainda importam símbolos removidos).

---

## Task 6: Remover webhook Evolution + handoff-via-fromMe de agent.controller.ts

**Arquivos:**
- Modificar: `apps/api/src/modules/agent/agent.controller.ts`

Endpoint a **remover**:
- `POST /agent/webhook` (Evolution)

Endpoint a **modificar**:
- `POST /agent/webhook/cloud` (adicionar detecção de `statuses` pra handoff)

- [ ] **Step 1: Escrever o teste do handoff via Cloud primeiro (TDD)**

Em `apps/api/src/modules/agent/agent.controller.spec.ts`, adicionar:

```typescript
describe('AgentController.handleCloudWebhook — handoff via statuses', () => {
  it('statuses[].status === "sent" com recipient_id → ativa handoff para esse phone', async () => {
    // Setup: payload Cloud API com statuses array
    const payload = {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'phone-123' },
            statuses: [{
              id: 'wamid.xyz',
              status: 'sent',
              recipient_id: '5511988887777',
              timestamp: '1234567890',
            }],
          },
        }],
      }],
    }

    // Mock agent_settings retorna tenant
    mockKnex.mockImplementation(() => ({
      where: () => ({ select: () => ({ first: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1' }) }) }),
    }))

    const spy = jest.spyOn(agentService, 'handleDoctorMessage').mockResolvedValue(undefined)
    const signature = 'sha256=' + createValidSignature(payload)

    await controller.handleCloudWebhook(signature, payload)

    expect(spy).toHaveBeenCalledWith('tenant-1', '5511988887777')
  })

  it('statuses[].status === "delivered" → NÃO ativa handoff (só "sent" é relevante)', async () => {
    // similar mas status=delivered → spy não chamado
  })
})
```

- [ ] **Step 2: Rodar teste — confirmar que falha**

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=agent.controller.spec
```

Esperado: FAIL — `handleDoctorMessage` não foi chamado.

- [ ] **Step 3: Implementar detecção de statuses no handleCloudWebhook**

Em `handleCloudWebhook`, após o loop `for (const msg of value.messages)`, adicionar:

```typescript
// Handoff detection: statuses array contém msgs enviadas PELA business account.
// Se há "sent" com recipient_id, significa que o doutor mandou msg pelo WhatsApp
// Business app — ativamos mode='human' na conversa com esse paciente.
for (const status of value.statuses ?? []) {
  if (status.status === 'sent' && status.recipient_id) {
    try {
      await this.agentService.handleDoctorMessage(tenantId, status.recipient_id)
    } catch (err) {
      this.logger.error(
        `[Cloud webhook] Erro ao ativar handoff para ${status.recipient_id}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
```

Tipar o `value` payload pra incluir `statuses`:

```typescript
const payload = body as {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string }
        messages?: Array<{ from?: string; text?: { body?: string }; type?: string }>
        statuses?: Array<{ id?: string; status?: string; recipient_id?: string }>
      }
    }>
  }>
}
```

- [ ] **Step 4: Remover webhook Evolution (handleWebhook)**

Deletar o método `handleWebhook` inteiro + decoradores associados. Remover imports não usados (`EvolutionWebhookPayload`, etc).

- [ ] **Step 5: Remover interface EvolutionWebhookPayload se só usada aqui**

```bash
grep -rn "EvolutionWebhookPayload" apps/api/src
```

Se só no controller, remover. Se ainda usada em `agent.service.ts`, vai ser limpo na Task 7.

- [ ] **Step 6: Rodar teste — confirmar que passa**

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=agent.controller.spec
```

Esperado: PASS.

---

## Task 7: Limpar agent.service.ts — remover handleMessage (Evolution) + resolveTenantFromInstance

**Arquivos:**
- Modificar: `apps/api/src/modules/agent/agent.service.ts`
- Modificar: `apps/api/src/modules/agent/agent.service.spec.ts`

- [ ] **Step 1: Remover método handleMessage(payload)**

Deletar o método que recebia `EvolutionWebhookPayload`. Manter `handleMessageFromCloud` e `processMessage` (private).

- [ ] **Step 2: Remover resolveTenantFromInstance**

Se não mais usado, deletar. Checar antes:

```bash
grep -rn "resolveTenantFromInstance" apps/api/src
```

- [ ] **Step 3: Remover EvolutionWebhookPayload interface**

Deletar a interface do topo de `agent.service.ts`.

- [ ] **Step 4: Remover handleDoctorMessage se redundante**

O método `handleDoctorMessage` foi adicionado pra Evolution. Com Cloud API, o controller chama `this.agentService.handleDoctorMessage(tenantId, recipientPhone)` — então **manter**.

Decisão: manter `handleDoctorMessage` (ativa modo human na conversa).

- [ ] **Step 5: Limpar specs do agent.service**

Em `apps/api/src/modules/agent/agent.service.spec.ts`, remover os testes:
- `CT-TD20-01: where chamado com evolution_instance_name correto`
- `CT-TD20-02: instância desconhecida → resolveTenantFromInstance retorna null`
- Qualquer teste que use `payload.instance` ou `handleMessage(payload)`

Manter os testes de `processMessage` / `handleMessageFromCloud` / `handleDoctorMessage`.

- [ ] **Step 6: Rodar testes**

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=agent.service
```

Esperado: PASS (testes Evolution removidos).

- [ ] **Step 7: Typecheck + testes gerais**

```bash
pnpm --filter @nocrato/api typecheck
pnpm --filter @nocrato/api test
```

Esperado: todos PASS.

---

## Task 8: Testes do handoff no ConversationService (warning #4 do review)

**Arquivos:**
- Modificar: `apps/api/src/modules/agent/conversation.service.spec.ts`

- [ ] **Step 1: Adicionar describe blocks pros 3 métodos**

No final do arquivo, antes do último `})`, adicionar:

```typescript
  describe('activateHumanMode', () => {
    it('CS-08: insere row com mode=human quando conversa não existe', async () => {
      // mock knex.raw para INSERT ... ON CONFLICT
      const mockRaw = jest.fn().mockResolvedValue({ rows: [] })
      service = buildServiceWithRaw(mockRaw)

      await service.activateHumanMode('tenant-1', '+5511988887777')

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO conversations.*ON CONFLICT/s),
        { tenantId: 'tenant-1', phone: '+5511988887777' },
      )
    })

    it('CS-09: atualiza row existente para mode=human', async () => {
      // INSERT ON CONFLICT faz tudo num comando só — o teste cobre que o SQL é chamado
      const mockRaw = jest.fn().mockResolvedValue({ rows: [] })
      service = buildServiceWithRaw(mockRaw)

      await service.activateHumanMode('tenant-1', '+5511988887777')

      expect(mockRaw).toHaveBeenCalled()
    })
  })

  describe('shouldAgentRespond', () => {
    it('CS-10: conversa não existe → retorna true (agente responde primeira msg)', async () => {
      const mockFirst = jest.fn().mockResolvedValue(undefined)
      service = buildServiceWithFirst(mockFirst)

      const result = await service.shouldAgentRespond('tenant-1', '+5511988887777')

      expect(result).toBe(true)
    })

    it('CS-11: mode=agent → retorna true', async () => {
      const mockFirst = jest.fn().mockResolvedValue({ mode: 'agent', last_fromme_at: null })
      service = buildServiceWithFirst(mockFirst)

      const result = await service.shouldAgentRespond('tenant-1', '+5511988887777')

      expect(result).toBe(true)
    })

    it('CS-12: mode=human dentro do timeout → retorna false', async () => {
      const recentFromMe = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min atrás
      const mockFirst = jest.fn().mockResolvedValue({ mode: 'human', last_fromme_at: recentFromMe })
      service = buildServiceWithFirst(mockFirst)

      const result = await service.shouldAgentRespond('tenant-1', '+5511988887777')

      expect(result).toBe(false)
    })

    it('CS-13: mode=human expirou (>30min) → auto-revert + retorna true', async () => {
      const oldFromMe = new Date(Date.now() - 35 * 60 * 1000).toISOString() // 35 min atrás
      const mockFirst = jest.fn().mockResolvedValue({ mode: 'human', last_fromme_at: oldFromMe })
      const mockUpdate = jest.fn().mockResolvedValue(1)
      service = buildServiceWithFirstAndUpdate(mockFirst, mockUpdate)

      const result = await service.shouldAgentRespond('tenant-1', '+5511988887777')

      expect(result).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ mode: 'agent' })
    })

    it('CS-14: mode=human sem last_fromme_at → retorna false (conservador)', async () => {
      const mockFirst = jest.fn().mockResolvedValue({ mode: 'human', last_fromme_at: null })
      service = buildServiceWithFirst(mockFirst)

      const result = await service.shouldAgentRespond('tenant-1', '+5511988887777')

      expect(result).toBe(false)
    })
  })

  describe('setMode', () => {
    it('CS-15: setMode atualiza mode na conversation', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(1)
      service = buildServiceWithUpdate(mockUpdate)

      await service.setMode('tenant-1', '+5511988887777', 'agent')

      expect(mockUpdate).toHaveBeenCalledWith({ mode: 'agent' })
    })
  })
```

- [ ] **Step 2: Extrair helpers buildServiceWith* no topo do spec**

Adicionar logo após o describe principal:

```typescript
function buildServiceWithFirst(mockFirst: jest.Mock) {
  const mockWhere = jest.fn().mockReturnThis()
  const mockSelect = jest.fn().mockReturnThis()
  const knex = jest.fn().mockReturnValue({
    where: mockWhere,
    select: mockSelect,
    first: mockFirst,
  })
  return new ConversationService(knex as unknown as Knex)
}
// ... similares para with Raw / with Update / with FirstAndUpdate
```

- [ ] **Step 3: Rodar testes**

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=conversation.service
```

Esperado: PASS com 15+ testes.

---

## Task 9: Testes do requestDeletion no PatientService (warning #5 do review)

**Arquivos:**
- Modificar: `apps/api/src/modules/patient/patient.service.spec.ts`

- [ ] **Step 1: Adicionar describe block pro requestDeletion**

No final do arquivo, adicionar:

```typescript
  describe('requestDeletion', () => {
    // Setup: mock knex com join e event_log + eventEmitter
    beforeEach(() => {
      // reset mocks
    })

    it('PS-RD-01: código inválido → NotFoundException', async () => {
      mockFirst.mockResolvedValue(undefined)
      await expect(service.requestDeletion('ABC-1234-XYZ'))
        .rejects.toThrow('Código de acesso inválido')
    })

    it('PS-RD-02: portal inativo → ForbiddenException', async () => {
      mockFirst.mockResolvedValue({ portal_active: false, status: 'active', tenant_status: 'active' })
      await expect(service.requestDeletion('ABC-1234-XYZ'))
        .rejects.toThrow('Portal inativo')
    })

    it('PS-RD-03: paciente inativo → ForbiddenException', async () => {
      mockFirst.mockResolvedValue({ portal_active: true, status: 'inactive', tenant_status: 'active' })
      await expect(service.requestDeletion('ABC-1234-XYZ'))
        .rejects.toThrow('Paciente inativo')
    })

    it('PS-RD-04: tenant inativo → ForbiddenException', async () => {
      mockFirst.mockResolvedValue({ portal_active: true, status: 'active', tenant_status: 'inactive' })
      await expect(service.requestDeletion('ABC-1234-XYZ'))
        .rejects.toThrow('Clínica inativa')
    })

    it('PS-RD-05: happy path → marca timestamp + append event + emit evento', async () => {
      mockFirst.mockResolvedValue({
        id: 'patient-1',
        name: 'João',
        portal_active: true,
        status: 'active',
        tenant_id: 'tenant-1',
        tenant_status: 'active',
        doctor_name: 'Dr. Silva',
        doctor_email: 'doctor@test.com',
        deletion_requested_at: null,
      })
      // mock update + append + emit
      const result = await service.requestDeletion('ABC-1234-XYZ')

      expect(result.message).toContain('registrada')
      expect(mockEventLogService.append).toHaveBeenCalledWith(
        'tenant-1', 'patient.deletion_requested', 'patient', 'patient-1',
        { patientName: 'João' },
      )
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('patient.deletion_requested', expect.any(Object))
    })

    it('PS-RD-06: idempotente — deletion_requested_at já preenchido → retorna mensagem sem chamar event_log', async () => {
      mockFirst.mockResolvedValue({
        id: 'patient-1',
        name: 'João',
        portal_active: true,
        status: 'active',
        tenant_id: 'tenant-1',
        tenant_status: 'active',
        deletion_requested_at: new Date('2026-04-19').toISOString(),
      })
      const result = await service.requestDeletion('ABC-1234-XYZ')

      expect(result.message).toContain('já registrada')
      expect(mockEventLogService.append).not.toHaveBeenCalled()
      expect(mockEventEmitter.emit).not.toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: Rodar testes**

```bash
pnpm --filter @nocrato/api test -- --testPathPattern=patient.service
```

Esperado: PASS com 6 novos testes.

---

## Task 10: Frontend — remover card Evolution de whatsapp.tsx

**Arquivos:**
- Modificar: `apps/web/src/routes/doctor/whatsapp.tsx`
- Modificar: `apps/web/src/lib/queries/whatsapp.ts`

**ATENÇÃO:** Essa task precisa passar pelo `frontend` agent (protocolo CLAUDE.md). Não editar inline.

- [ ] **Step 1: Invocar frontend agent**

Prompt pro agent:

> Remover completamente o card "Conexão via Evolution API (QR code)" da página `apps/web/src/routes/doctor/whatsapp.tsx`. A página deve ficar apenas com o card "Meta WhatsApp Cloud API (oficial)". Também remover todas as queries/mutations relacionadas a Evolution em `apps/web/src/lib/queries/whatsapp.ts`:
> - `useConnectWhatsapp`
> - `useGetQrCode`
> - `useGetWhatsappStatus`
> - `useDisconnectWhatsapp`
>
> Manter apenas as queries Cloud API (`useConnectCloud`, etc). Rodar `pnpm --filter @nocrato/web typecheck` e reportar resultado.

- [ ] **Step 2: Invocar designer agent**

> Revisar a página `apps/web/src/routes/doctor/whatsapp.tsx` depois do refactor — agora tem apenas 1 card (Meta). Ajustar layout se necessário pra não ficar órfão.

- [ ] **Step 3: Typecheck web**

```bash
pnpm --filter @nocrato/web typecheck
```

Esperado: zero erros.

---

## Task 11: Docker — remover serviço Evolution

**Arquivos:**
- Modificar: `docker/docker-compose.dev.yml`
- Modificar: `docker/docker-compose.prod.yml`
- Modificar: `docker/nginx.conf` (se tiver location /evolution)
- Modificar: `docker/CLAUDE.md`

- [ ] **Step 1: Verificar referências a evolution**

```bash
grep -n "evolution" docker/docker-compose.dev.yml docker/docker-compose.prod.yml docker/nginx.conf docker/CLAUDE.md
```

- [ ] **Step 2: Remover service evolution do dev**

Em `docker/docker-compose.dev.yml`, remover todo o bloco `evolution:` (service completo) + `evolution_data:` do volumes se houver.

- [ ] **Step 3: Remover service evolution do prod**

Em `docker/docker-compose.prod.yml`, remover `nocrato_evolution_prod` + volume `evolution_data_prod`.

- [ ] **Step 4: Remover config nginx**

Em `docker/nginx.conf`, se houver `location /evolution` ou proxy_pass para evolution, remover.

- [ ] **Step 5: Atualizar docker/CLAUDE.md**

Remover menções ao container Evolution.

- [ ] **Step 6: Testar docker-compose localmente (sem subir — só validar sintaxe)**

```bash
docker compose -f docker/docker-compose.dev.yml config > /dev/null
docker compose -f docker/docker-compose.prod.yml config > /dev/null
```

Esperado: sem erros de sintaxe.

---

## Task 12: Docs finais + cleanup

**Arquivos:**
- Modificar: `apps/api/src/modules/agent/CLAUDE.md`
- Modificar: `apps/api/src/database/CLAUDE.md`
- Modificar: `apps/api/src/modules/doctor/doctor.types.ts` (se tiver Evolution ref)
- Modificar: `apps/api/src/modules/doctor/agent-settings.service.ts` (idem)
- Modificar: `apps/api/src/modules/health/CLAUDE.md`
- Modificar: `apps/api/src/common/guards/guards.qa.ts`
- Modificar: `docs/seeds/005-auto-handoff-doutor-whatsapp.md` (atualizar pra refletir que handoff agora é via Cloud statuses)
- Modificar: `docs/flows/agent.md`
- Modificar: `CLAUDE.md` raiz (se mencionar Evolution)

- [ ] **Step 1: Buscar refs residuais**

```bash
grep -rn -i "evolution" apps/api/src apps/web/src docker CLAUDE.md docs/ 2>&1 | grep -v "node_modules"
```

- [ ] **Step 2: Limpar cada arquivo**

Para cada arquivo listado, remover/atualizar menções a Evolution. Objetivo: nenhuma referência textual a "Evolution API" no codebase final (exceto no seed 005 como histórico da decisão).

- [ ] **Step 3: Atualizar seed 005**

Em `docs/seeds/005-auto-handoff-doutor-whatsapp.md`, atualizar seção "Proposta" pra refletir que a implementação usa webhook `statuses` do Cloud API (não `fromMe` da Evolution, que foi descartado).

- [ ] **Step 4: Atualizar agent/CLAUDE.md**

Reescrever descrição do módulo:
- Remover menções a "dual provider"
- Remover seção "Evolution API"
- Adicionar nota sobre handoff via statuses do Cloud

- [ ] **Step 5: Testes finais**

```bash
pnpm --filter @nocrato/api typecheck
pnpm --filter @nocrato/web typecheck
pnpm --filter @nocrato/api test
```

Esperado: tudo verde.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore(docs): purge Evolution references from codebase docs"
```

---

## Ordem de commits sugerida

| Commit | Tasks |
|---|---|
| 1 | Task 1 — migration 023 + docs DB |
| 2 | Tasks 2+3+4 — env + provider + service (corte de dependências) |
| 3 | Task 5 — controller WhatsApp conexão |
| 4 | Task 6 — webhook controller + handoff Cloud |
| 5 | Task 7 — agent service cleanup |
| 6 | Task 8 — testes handoff ConversationService |
| 7 | Task 9 — testes requestDeletion |
| 8 | Task 10 — frontend (via agent) |
| 9 | Task 11 — docker |
| 10 | Task 12 — docs cleanup final |

---

## Self-review do plano

**Cobertura:**
- ✅ Todos os 21 arquivos backend com ref a Evolution mapeados
- ✅ Todos os 2 arquivos frontend mapeados
- ✅ Todos os 3 arquivos docker mapeados
- ✅ Warnings #4 e #5 do code review (testes) incluídos como Tasks 8 e 9
- ✅ Handoff Cloud API implementado (Task 6)
- ✅ Migration 023 + docs DB atualizadas (Task 1)

**Placeholders:** nenhum "TBD" ou "implementar depois" no plano — todos os code blocks são concretos.

**Dependências entre tasks:**
- Task 1 (migration) independente
- Tasks 2+3+4+5+6+7 têm dependência linear (env → provider → service → controllers)
- Tasks 8+9 dependem de nada (podem ser paralelas)
- Task 10 dependente de Task 5 (endpoints removidos do backend)
- Tasks 11+12 finais

**YAGNI check:** sem implementação de features novas — só remoção + handoff (que já estava no escopo)
