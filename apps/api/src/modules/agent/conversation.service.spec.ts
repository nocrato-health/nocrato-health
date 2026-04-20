/**
 * US-9.3 — ConversationService
 *
 * Casos de teste cobertos:
 *  CS-01: getOrCreate — conversa existente (ON CONFLICT retorna registro atual)
 *  CS-02: getOrCreate — conversa nova (INSERT retorna novo registro)
 *  CS-03: appendMessages — histórico pequeno (2 existentes + 2 novas = 4 total)
 *  CS-04: appendMessages — trim (19 existentes + 2 novas = apenas 20 mantidas)
 *  CS-05: appendMessages — conversa não encontrada (retorna sem erro)
 *  CS-06: Isolamento — getOrCreate passa tenant_id para a query raw
 *  CS-07: appendMessages — usa conversationId (não tenant_id) para buscar e atualizar
 *  CS-08: activateHumanMode — chama knex.raw com INSERT…ON CONFLICT e bindings corretos
 *  CS-09: activateHumanMode — idempotente (segunda chamada não lança exceção)
 *  CS-10: shouldAgentRespond — conversa não existe → retorna true
 *  CS-11: shouldAgentRespond — mode='agent' → retorna true
 *  CS-12: shouldAgentRespond — mode='human', last_fromme_at dentro do timeout → retorna false
 *  CS-13: shouldAgentRespond — mode='human', last_fromme_at expirado → auto-revert e retorna true
 *  CS-14: shouldAgentRespond — mode='human', last_fromme_at=null → retorna false (conservador)
 *  CS-15: setMode — mode='agent' → chama update({ mode: 'agent' }) com where correto
 *  CS-16: setMode — mode='human' → chama update({ mode: 'human' })
 */

jest.mock('@/config/env', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test-key',
    EVOLUTION_API_URL: 'http://evolution.test',
    EVOLUTION_API_KEY: 'api-key-secreta',
    EVOLUTION_INSTANCE: 'instancia-teste',
    EVOLUTION_WEBHOOK_TOKEN: 'webhook-token-teste',
    FRONTEND_URL: 'http://localhost:5173',
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_NAME: 'nocrato_test',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { ConversationService, type ConversationMessage } from './conversation.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-abc'
const PHONE = '5511999990000'
const CONVERSATION_ID = 'conv-uuid-001'

const makeConversationRow = (overrides: Record<string, unknown> = {}) => ({
  id: CONVERSATION_ID,
  tenant_id: TENANT_ID,
  phone: PHONE,
  messages: [],
  last_message_at: new Date('2024-03-01T10:00:00Z'),
  created_at: new Date('2024-03-01T09:00:00Z'),
  updated_at: new Date('2024-03-01T10:00:00Z'),
  ...overrides,
})

const makeMsg = (role: 'user' | 'assistant' | 'tool', content: string): ConversationMessage => ({
  role,
  content,
  timestamp: new Date().toISOString(),
})

// ---------------------------------------------------------------------------
// Mock Knex
// ---------------------------------------------------------------------------

const mockUpdate = jest.fn().mockResolvedValue(1)
const mockFirst = jest.fn()
const mockSelect = jest.fn().mockReturnThis()
const mockWhere = jest.fn().mockReturnThis()
const mockRaw = jest.fn()

// mockKnex retorna query builder para chamadas de tabela
// e também expõe .raw para o getOrCreate
const mockKnex = Object.assign(
  jest.fn().mockReturnValue({
    where: mockWhere,
    select: mockSelect,
    first: mockFirst,
    update: mockUpdate,
  }),
  {
    raw: mockRaw,
    fn: { now: jest.fn().mockReturnValue('now()') },
  },
)

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ConversationService', () => {
  let service: ConversationService

  beforeEach(async () => {
    jest.clearAllMocks()

    // Restaurar encadeamento padrão
    mockWhere.mockReturnThis()
    mockSelect.mockReturnThis()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = module.get<ConversationService>(ConversationService)
  })

  // CS-01: getOrCreate — retorna conversa existente (ON CONFLICT DO UPDATE)
  it('CS-01: getOrCreate — conversa existente → retorna sem segunda inserção', async () => {
    const row = makeConversationRow({ messages: [makeMsg('user', 'Olá')] })
    mockRaw.mockResolvedValue({ rows: [row] })

    const result = await service.getOrCreate(TENANT_ID, PHONE)

    expect(mockRaw).toHaveBeenCalledTimes(1)
    expect(result.id).toBe(CONVERSATION_ID)
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.phone).toBe(PHONE)
    expect(result.messages).toEqual(row.messages)
  })

  // CS-02: getOrCreate — conversa nova (INSERT insere nova linha)
  it('CS-02: getOrCreate — conversa nova → retorna registro recém-criado', async () => {
    const row = makeConversationRow({ messages: [] })
    mockRaw.mockResolvedValue({ rows: [row] })

    const result = await service.getOrCreate(TENANT_ID, '5521988880000')

    expect(result.id).toBe(CONVERSATION_ID)
    expect(result.messages).toEqual([])
    expect(result.lastMessageAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  // CS-06: Isolamento — getOrCreate passa tenantId e phone para a query raw
  it('CS-06: getOrCreate — passa tenantId e phone corretos para a query SQL', async () => {
    const row = makeConversationRow()
    mockRaw.mockResolvedValue({ rows: [row] })

    await service.getOrCreate('outro-tenant-id', '5519900000000')

    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conversations'),
      expect.objectContaining({ tenantId: 'outro-tenant-id', phone: '5519900000000' }),
    )
  })

  // CS-03: appendMessages — histórico pequeno (2 existentes + 2 novas = 4 total)
  it('CS-03: appendMessages — histórico pequeno → concatena sem truncar', async () => {
    const existingMessages = [makeMsg('user', 'Msg 1'), makeMsg('assistant', 'Resp 1')]
    mockFirst.mockResolvedValue({ messages: existingMessages })

    const newMessages = [makeMsg('user', 'Msg 2'), makeMsg('assistant', 'Resp 2')]

    await service.appendMessages(CONVERSATION_ID, newMessages)

    expect(mockWhere).toHaveBeenCalledWith({ id: CONVERSATION_ID })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: JSON.stringify([...existingMessages, ...newMessages]),
      }),
    )

    const updateArg = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    const saved = JSON.parse(updateArg.messages as string) as ConversationMessage[]
    expect(saved).toHaveLength(4)
  })

  // CS-04: appendMessages — trim (19 existentes + 2 novas = apenas 20 mantidas)
  it('CS-04: appendMessages — 19 msgs existentes + 2 novas → mantém apenas últimas 20', async () => {
    const existingMessages: ConversationMessage[] = Array.from({ length: 19 }, (_, i) =>
      makeMsg('user', `Mensagem existente ${i + 1}`),
    )
    mockFirst.mockResolvedValue({ messages: existingMessages })

    const newMessages: ConversationMessage[] = [
      makeMsg('user', 'Nova mensagem 1'),
      makeMsg('assistant', 'Nova resposta 1'),
    ]

    await service.appendMessages(CONVERSATION_ID, newMessages)

    const updateArg = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    const saved = JSON.parse(updateArg.messages as string) as ConversationMessage[]

    // 19 + 2 = 21, truncado para 20 (slice(-20))
    expect(saved).toHaveLength(20)
    // A última mensagem deve ser a mais recente (nova resposta do assistente)
    expect(saved[saved.length - 1].content).toBe('Nova resposta 1')
    // A primeira mensagem deve ser a segunda das existentes (a primeira foi removida)
    expect(saved[0].content).toBe('Mensagem existente 2')
  })

  // CS-05: appendMessages — conversa não encontrada → retorna sem erro
  it('CS-05: appendMessages — conversa não encontrada → retorna sem lançar exceção', async () => {
    mockFirst.mockResolvedValue(undefined)

    await expect(
      service.appendMessages('conv-inexistente', [makeMsg('user', 'Olá')]),
    ).resolves.toBeUndefined()

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // CS-07: appendMessages — usa conversationId no WHERE, não tenant_id
  it('CS-07: appendMessages — WHERE usa conversationId (isolamento por linha, não por tenant)', async () => {
    mockFirst.mockResolvedValue({ messages: [] })

    await service.appendMessages('conv-especifica-123', [makeMsg('user', 'Teste')])

    expect(mockWhere).toHaveBeenCalledWith({ id: 'conv-especifica-123' })
  })

  // ---------------------------------------------------------------------------
  // activateHumanMode
  // ---------------------------------------------------------------------------

  // CS-08: chama knex.raw com INSERT…ON CONFLICT e bindings corretos
  it('CS-08: activateHumanMode — chama knex.raw com SQL de upsert e bindings corretos', async () => {
    mockRaw.mockResolvedValue(undefined)

    await service.activateHumanMode(TENANT_ID, PHONE)

    expect(mockRaw).toHaveBeenCalledTimes(1)
    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conversations'),
      expect.objectContaining({ tenantId: TENANT_ID, phone: PHONE }),
    )
    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      expect.anything(),
    )
    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining("mode = 'human'"),
      expect.anything(),
    )
  })

  // CS-09: idempotente — segunda chamada não lança exceção
  it('CS-09: activateHumanMode — idempotente (segunda chamada não lança)', async () => {
    mockRaw.mockResolvedValue(undefined)

    await expect(service.activateHumanMode(TENANT_ID, PHONE)).resolves.toBeUndefined()
    await expect(service.activateHumanMode(TENANT_ID, PHONE)).resolves.toBeUndefined()

    expect(mockRaw).toHaveBeenCalledTimes(2)
  })

  // ---------------------------------------------------------------------------
  // shouldAgentRespond
  // ---------------------------------------------------------------------------

  // CS-10: conversa não existe → retorna true (agente responde à primeira mensagem)
  it('CS-10: shouldAgentRespond — conversa inexistente → retorna true', async () => {
    mockFirst.mockResolvedValue(undefined)

    const result = await service.shouldAgentRespond(TENANT_ID, PHONE)

    expect(result).toBe(true)
    expect(mockWhere).toHaveBeenCalledWith({ tenant_id: TENANT_ID, phone: PHONE })
  })

  // CS-11: mode='agent' → retorna true
  it('CS-11: shouldAgentRespond — mode=agent → retorna true', async () => {
    mockFirst.mockResolvedValue({ mode: 'agent', last_fromme_at: null })

    const result = await service.shouldAgentRespond(TENANT_ID, PHONE)

    expect(result).toBe(true)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // CS-12: mode='human', last_fromme_at dentro do timeout (5 min atrás) → retorna false
  it('CS-12: shouldAgentRespond — mode=human, timeout não expirado → retorna false', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    mockFirst.mockResolvedValue({ mode: 'human', last_fromme_at: fiveMinutesAgo })

    const result = await service.shouldAgentRespond(TENANT_ID, PHONE)

    expect(result).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // CS-13: mode='human', last_fromme_at expirado (35 min atrás) → auto-revert e retorna true
  it('CS-13: shouldAgentRespond — mode=human, timeout expirado → auto-revert para agent e retorna true', async () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    mockFirst.mockResolvedValue({ mode: 'human', last_fromme_at: thirtyFiveMinutesAgo })
    mockUpdate.mockResolvedValue(1)

    const result = await service.shouldAgentRespond(TENANT_ID, PHONE)

    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({ mode: 'agent' })
  })

  // CS-14: mode='human', last_fromme_at=null → retorna false (conservador)
  it('CS-14: shouldAgentRespond — mode=human, last_fromme_at=null → retorna false (conservador)', async () => {
    mockFirst.mockResolvedValue({ mode: 'human', last_fromme_at: null })

    const result = await service.shouldAgentRespond(TENANT_ID, PHONE)

    expect(result).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // setMode
  // ---------------------------------------------------------------------------

  // CS-15: setMode('agent') → chama update({ mode: 'agent' }) com where correto
  it('CS-15: setMode — mode=agent → chama update com where tenant_id+phone', async () => {
    mockUpdate.mockResolvedValue(1)

    await service.setMode(TENANT_ID, PHONE, 'agent')

    expect(mockWhere).toHaveBeenCalledWith({ tenant_id: TENANT_ID, phone: PHONE })
    expect(mockUpdate).toHaveBeenCalledWith({ mode: 'agent' })
  })

  // CS-16: setMode('human') → chama update({ mode: 'human' })
  it('CS-16: setMode — mode=human → chama update com mode=human', async () => {
    mockUpdate.mockResolvedValue(1)

    await service.setMode(TENANT_ID, PHONE, 'human')

    expect(mockWhere).toHaveBeenCalledWith({ tenant_id: TENANT_ID, phone: PHONE })
    expect(mockUpdate).toHaveBeenCalledWith({ mode: 'human' })
  })
})
