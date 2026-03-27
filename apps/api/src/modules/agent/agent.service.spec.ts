/**
 * US-9.3 — AgentService.handleMessage
 * TD-20 — resolveTenantFromInstance com multitenancy por instanceName
 *
 * Casos de teste cobertos:
 *  CT-93-01: Mensagem simples sem tool_calls → LLM responde → sendText chamado → appendMessages chamado
 *  CT-93-02: LLM retorna tool_call list_slots → getSlotsInternal chamado → 2ª chamada LLM → resposta enviada
 *  CT-93-03: LLM retorna tool_call generate_booking_link → generateToken chamado → resposta enviada
 *  CT-93-04: LLM retorna tool_call cancel_appointment → updateAppointmentStatus('cancelled') chamado
 *  CT-93-05: Paciente não encontrado → handleMessage continua → system prompt menciona "novo paciente"
 *  CT-93-06: appendMessages chamado com trim: 19 msgs + 2 novas = 20 persistidas
 *  CT-93-07: resolveTenantFromInstance retorna null → handleMessage retorna early sem chamar OpenAI
 *  CT-93-08: Mensagem vazia (messageText = '') → handleMessage retorna early
 *  CT-93-09: agentCtx.enabled = false (loadAgentContext retorna null) → retorna early
 *  CT-93-10: Erro na tool executeTool → retorna JSON de erro → fluxo continua sem quebrar
 *  CT-TD20-01: resolveTenantFromInstance filtra por evolution_instance_name correta → retorna tenantId
 *  CT-TD20-02: resolveTenantFromInstance com instância desconhecida → retorna null → early return
 *  CT-TD20-03: payload sem campo instance → early return silencioso
 *  CT-TD21-01: OpenAI rejeita na chamada inicial → retorna sem enviar mensagem (não propaga exceção)
 *  CT-TD21-02: OpenAI rejeita dentro do loop de tool_calls → retorna sem enviar mensagem (não propaga exceção)
 */

// ---------------------------------------------------------------------------
// Mocks ANTES de qualquer import
// ---------------------------------------------------------------------------

jest.mock('@/config/env', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test-key-valida',
    EVOLUTION_API_URL: 'http://evolution.test',
    EVOLUTION_API_KEY: 'api-key-fake-para-testes',
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

// Mock do módulo OpenAI — controla o que chat.completions.create retorna
const mockOpenAICreate = jest.fn()
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    })),
  }
})

import { Test, TestingModule } from '@nestjs/testing'
import { AgentService, type EvolutionWebhookPayload } from './agent.service'
import { PatientService } from '@/modules/patient/patient.service'
import { BookingService } from '@/modules/booking/booking.service'
import { AppointmentService } from '@/modules/appointment/appointment.service'
import { ConversationService } from './conversation.service'
import { WhatsAppService } from './whatsapp.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-xpto'
const PHONE = '5511999990001'
const CONVERSATION_ID = 'conv-uuid-abc'
const INSTANCE_NAME = 'dr-marcos-instance'

const makePayload = (overrides: Partial<EvolutionWebhookPayload['data']> = {}, instance = INSTANCE_NAME): EvolutionWebhookPayload => ({
  event: 'messages.upsert',
  instance,
  data: {
    key: {
      remoteJid: `${PHONE}@s.whatsapp.net`,
      fromMe: false,
    },
    message: {
      conversation: 'Quero agendar uma consulta',
    },
    pushName: 'Carlos Oliveira',
    ...overrides,
  },
})

const makeConversation = (messages: unknown[] = []) => ({
  id: CONVERSATION_ID,
  tenantId: TENANT_ID,
  phone: PHONE,
  messages,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makePatient = () => ({
  id: 'patient-uuid-1',
  name: 'Carlos Oliveira',
  phone: PHONE,
  email: 'carlos@example.com',
  source: 'agent',
  status: 'active',
  created_at: new Date(),
})

// Resposta OpenAI sem tool_calls (resposta simples)
const makeSimpleResponse = (content: string) => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content,
        tool_calls: undefined,
      },
    },
  ],
})

// Resposta OpenAI com tool_call
const makeToolCallResponse = (name: string, args: Record<string, unknown>, toolCallId = 'tc-001') => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: toolCallId,
            type: 'function',
            function: {
              name,
              arguments: JSON.stringify(args),
            },
          },
        ],
      },
    },
  ],
})

// Contexto do agente padrão
const makeAgentSettings = () => ({
  personality: 'Atendente amigável e profissional',
  appointment_rules: 'Consultas de 30 minutos',
  faq: 'Aceitamos planos de saúde',
  booking_mode: 'both',
  welcome_message: 'Bem-vindo ao consultório!',
  enabled: true,
  evolution_instance_name: INSTANCE_NAME,
})

const makeDoctorRow = () => ({
  name: 'Dr. Marcos Ferreira',
  specialty: 'Clínico Geral',
})

// ---------------------------------------------------------------------------
// Mock Knex para resolveTenantFromInstance e loadAgentContext
// ---------------------------------------------------------------------------

// Controle por tabela e chamada
const mockAgentSettingsQB = {
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn(),
}
const mockDoctorQB = {
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn(),
}

const mockKnex = jest.fn().mockImplementation((table: string) => {
  if (table === 'agent_settings') {
    return mockAgentSettingsQB
  }
  if (table === 'doctors') {
    return mockDoctorQB
  }
  return mockAgentSettingsQB
})

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockPatientService = {
  findByPhone: jest.fn(),
}

const mockConversationService = {
  getOrCreate: jest.fn(),
  appendMessages: jest.fn().mockResolvedValue(undefined),
}

const mockBookingService = {
  getSlotsInternal: jest.fn(),
  generateToken: jest.fn(),
  bookInChat: jest.fn(),
}

const mockAppointmentService = {
  cancelByAgent: jest.fn(),
}

const mockWhatsAppService = {
  sendText: jest.fn().mockResolvedValue(undefined),
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AgentService', () => {
  let service: AgentService

  beforeEach(async () => {
    jest.clearAllMocks()

    // Reset padrão: tenant resolvido + agentSettings enabled
    mockAgentSettingsQB.first
      .mockResolvedValueOnce({ tenant_id: TENANT_ID }) // resolveTenantFromInstance
      .mockResolvedValueOnce(makeAgentSettings())      // loadAgentContext — agent_settings
    mockDoctorQB.first.mockResolvedValue(makeDoctorRow())

    // Paciente encontrado por padrão
    mockPatientService.findByPhone.mockResolvedValue(makePatient())

    // Conversa existente por padrão
    mockConversationService.getOrCreate.mockResolvedValue(makeConversation([]))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: KNEX, useValue: mockKnex },
        { provide: PatientService, useValue: mockPatientService },
        { provide: BookingService, useValue: mockBookingService },
        { provide: AppointmentService, useValue: mockAppointmentService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
      ],
    }).compile()

    service = module.get<AgentService>(AgentService)
  })

  // CT-93-01: Mensagem simples sem tool_calls
  it('CT-93-01: mensagem simples → LLM responde sem tools → sendText + appendMessages chamados', async () => {
    const resposta = 'Claro! Temos horários disponíveis na terça-feira.'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessage(makePayload())

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, resposta, INSTANCE_NAME)
    expect(mockConversationService.appendMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Quero agendar uma consulta' }),
        expect.objectContaining({ role: 'assistant', content: resposta }),
      ]),
    )
    // appendMessages recebe exatamente 2 mensagens (user + assistant)
    const appendArg = mockConversationService.appendMessages.mock.calls[0][1] as unknown[]
    expect(appendArg).toHaveLength(2)
  })

  // CT-93-02: LLM retorna tool_call list_slots
  it('CT-93-02: tool_call list_slots → getSlotsInternal chamado → 2ª resposta enviada', async () => {
    const slots = [{ start: '09:00', end: '09:30' }, { start: '10:00', end: '10:30' }]
    mockBookingService.getSlotsInternal.mockResolvedValue({ slots })

    const respostaFinal = 'Temos horários às 09:00 e 10:00.'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('list_slots', { date: '2025-03-15' }))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await service.handleMessage(makePayload())

    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)
    expect(mockBookingService.getSlotsInternal).toHaveBeenCalledWith(TENANT_ID, '2025-03-15')
    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, respostaFinal, INSTANCE_NAME)
  })

  // CT-93-03: LLM retorna tool_call generate_booking_link
  it('CT-93-03: tool_call generate_booking_link → generateToken chamado → link enviado', async () => {
    const tokenResult = { bookingUrl: 'http://localhost:5173/book/dr-marcos?token=abc123', token: 'abc123' }
    mockBookingService.generateToken.mockResolvedValue(tokenResult)

    const respostaFinal = 'Aqui está seu link de agendamento: http://localhost:5173/book/dr-marcos?token=abc123'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('generate_booking_link', {}))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await service.handleMessage(makePayload())

    expect(mockBookingService.generateToken).toHaveBeenCalledWith(TENANT_ID, PHONE)
    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, respostaFinal, INSTANCE_NAME)
  })

  // CT-93-04: LLM retorna tool_call cancel_appointment
  it('CT-93-04: tool_call cancel_appointment → cancelByAgent chamado com tenantId, appointmentId e reason', async () => {
    const appointmentId = 'appt-uuid-999'
    mockAppointmentService.cancelByAgent.mockResolvedValue(undefined)

    const respostaFinal = 'Consulta cancelada com sucesso.'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('cancel_appointment', {
        appointmentId,
        reason: 'Paciente não pode comparecer',
      }))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await service.handleMessage(makePayload())

    expect(mockAppointmentService.cancelByAgent).toHaveBeenCalledWith(
      TENANT_ID,
      appointmentId,
      'Paciente não pode comparecer',
    )
    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, respostaFinal, INSTANCE_NAME)
  })

  // CT-93-05: Paciente não encontrado → fluxo continua e system prompt menciona "novo paciente"
  it('CT-93-05: paciente não encontrado → handleMessage continua e passa patient=null para buildSystemPrompt', async () => {
    mockPatientService.findByPhone.mockResolvedValue(null)

    const resposta = 'Olá! Para agendar, preciso do seu nome completo.'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessage(makePayload())

    // Fluxo não deve abortar — OpenAI deve ser chamado
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)

    // System prompt deve mencionar "novo paciente" ou "não cadastrado"
    const openaiCall = mockOpenAICreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const systemMessage = openaiCall.messages.find((m) => m.role === 'system')
    expect(systemMessage?.content).toMatch(/não cadastrado|novo paciente/i)

    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, resposta, INSTANCE_NAME)
  })

  // CT-93-06: appendMessages chamado com trim (19 msgs + 2 novas = apenas 20 persistidas)
  // Nota: o trim ocorre dentro do ConversationService — aqui validamos que appendMessages
  // recebe as 2 novas mensagens e que o ConversationService.appendMessages é chamado 1 vez.
  it('CT-93-06: histórico com 19 msgs existentes → appendMessages recebe as 2 novas mensagens', async () => {
    const existingMessages = Array.from({ length: 19 }, (_, i) => ({
      role: 'user' as const,
      content: `Mensagem antiga ${i + 1}`,
      timestamp: new Date().toISOString(),
    }))
    mockConversationService.getOrCreate.mockResolvedValue(makeConversation(existingMessages))

    const resposta = 'Aqui estão os horários disponíveis!'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessage(makePayload())

    // appendMessages deve ser chamado com exatamente as 2 novas mensagens
    const newMessages = mockConversationService.appendMessages.mock.calls[0][1] as unknown[]
    expect(newMessages).toHaveLength(2)
    expect(newMessages[0]).toMatchObject({ role: 'user' })
    expect(newMessages[1]).toMatchObject({ role: 'assistant', content: resposta })
  })

  // CT-93-07: resolveTenantFromInstance retorna null → early return
  it('CT-93-07: instância Evolution não mapeada → retorna early sem chamar OpenAI', async () => {
    // Sobrescrever: primeira chamada ao agent_settings retorna undefined (sem tenant)
    mockAgentSettingsQB.first
      .mockReset()
      .mockResolvedValueOnce(undefined) // resolveTenantFromInstance retorna null

    await service.handleMessage(makePayload())

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
    expect(mockConversationService.getOrCreate).not.toHaveBeenCalled()
  })

  // CT-93-08: Mensagem vazia → early return
  it('CT-93-08: messageText vazia → retorna early sem chamar OpenAI ou sendText', async () => {
    const payloadSemTexto = makePayload({ message: { conversation: '' } })

    await service.handleMessage(payloadSemTexto)

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
    // resolveTenantFromInstance não deve ser chamado
    expect(mockPatientService.findByPhone).not.toHaveBeenCalled()
  })

  // CT-93-09: agentCtx null (agente desabilitado) → early return
  it('CT-93-09: agente desabilitado (enabled=false) → loadAgentContext retorna null → early return', async () => {
    // Sobrescrever: agentSettings com enabled=false
    mockAgentSettingsQB.first
      .mockReset()
      .mockResolvedValueOnce({ tenant_id: TENANT_ID }) // resolveTenantFromInstance ok
      .mockResolvedValueOnce({ ...makeAgentSettings(), enabled: false }) // loadAgentContext → null

    await service.handleMessage(makePayload())

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
  })

  // CT-93-10: Erro na tool executeTool → retorna JSON de erro → fluxo continua
  it('CT-93-10: erro na tool → executeTool retorna JSON de erro → fluxo continua sem quebrar', async () => {
    mockBookingService.getSlotsInternal.mockRejectedValue(new Error('Serviço de agendamento indisponível'))

    const respostaFinal = 'Desculpe, não consegui verificar os horários no momento.'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('list_slots', { date: '2025-03-15' }, 'tc-erro-001'))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    // Não deve lançar exceção
    await expect(service.handleMessage(makePayload())).resolves.toBeUndefined()

    // OpenAI deve ser chamado 2x — 1ª com tool_call, 2ª com resultado de erro
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)

    // A 2ª chamada ao OpenAI deve conter a mensagem de tool com conteúdo de erro
    const secondCall = mockOpenAICreate.mock.calls[1][0] as {
      messages: Array<{ role: string; content?: string; tool_call_id?: string }>
    }
    const toolResultMsg = secondCall.messages.find(
      (m) => m.role === 'tool' && m.tool_call_id === 'tc-erro-001',
    )
    expect(toolResultMsg).toBeDefined()
    expect(toolResultMsg?.content).toContain('error')

    // Resposta final deve ser enviada mesmo assim
    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, respostaFinal, INSTANCE_NAME)
  })

  // CT-TD21-01: falha na chamada inicial à OpenAI → retorna silenciosamente (sem enviar mensagem)
  it('CT-TD21-01: OpenAI rejeita na chamada inicial → retorna sem enviar mensagem (não propaga exceção)', async () => {
    mockOpenAICreate.mockRejectedValue(new Error('Connection timeout'))

    await expect(service.handleMessage(makePayload())).resolves.toBeUndefined()

    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
    expect(mockConversationService.appendMessages).not.toHaveBeenCalled()
  })

  // CT-TD21-02: falha na chamada OpenAI dentro do loop de tool_calls → retorna silenciosamente
  it('CT-TD21-02: OpenAI rejeita dentro do loop de tool_calls → retorna sem enviar mensagem (não propaga exceção)', async () => {
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('list_slots', { date: '2025-03-15' }))
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))

    mockBookingService.getSlotsInternal.mockResolvedValue({ slots: [] })

    await expect(service.handleMessage(makePayload())).resolves.toBeUndefined()

    // Primeira chamada (inicial) foi bem sucedida, segunda (pós-tool) falhou
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)
    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
    expect(mockConversationService.appendMessages).not.toHaveBeenCalled()
  })

  // Extra: mensagem via extendedTextMessage (path alternativo)
  it('extendedTextMessage → texto extraído corretamente e processado', async () => {
    const resposta = 'Olá! Posso ajudar.'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    const payloadExtended = makePayload({
      message: {
        extendedTextMessage: { text: 'Boa tarde, preciso de informações' },
      },
    })

    await service.handleMessage(payloadExtended)

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const openaiCall = mockOpenAICreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content?: string }>
    }
    const userMsg = openaiCall.messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toBe('Boa tarde, preciso de informações')
  })

  // CT-TD20-01: resolveTenantFromInstance filtra por evolution_instance_name correta
  it('CT-TD20-01: where chamado com evolution_instance_name correto → tenant resolvido e fluxo continua', async () => {
    const resposta = 'Olá! Como posso ajudar?'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessage(makePayload())

    // Verificar que o where foi chamado com o nome da instância para resolveTenantFromInstance
    expect(mockAgentSettingsQB.where).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, evolution_instance_name: INSTANCE_NAME }),
    )
    expect(mockWhatsAppService.sendText).toHaveBeenCalledWith(PHONE, resposta, INSTANCE_NAME)
  })

  // CT-TD20-02: instância desconhecida → resolveTenantFromInstance retorna null → early return
  it('CT-TD20-02: instância Evolution desconhecida → resolveTenantFromInstance retorna null → early return sem OpenAI', async () => {
    mockAgentSettingsQB.first
      .mockReset()
      .mockResolvedValueOnce(undefined) // instância não mapeada para nenhum tenant

    await service.handleMessage(makePayload({}, 'instancia-nao-configurada'))

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
    expect(mockConversationService.getOrCreate).not.toHaveBeenCalled()
  })

  // CT-TD20-03: payload sem campo instance → early return silencioso
  it('CT-TD20-03: payload com instance string vazia → resolveTenantFromInstance retorna null → early return', async () => {
    mockAgentSettingsQB.first.mockReset().mockResolvedValueOnce(undefined)

    await service.handleMessage(makePayload({}, ''))

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendText).not.toHaveBeenCalled()
  })

  // TD-20 testes adicionais: getInstanceName
  describe('getInstanceName', () => {
    it('getInstanceName resolve corretamente quando agente está habilitado e instanceName configurado', async () => {
      mockAgentSettingsQB.first.mockReset().mockResolvedValue({
        evolution_instance_name: 'dr-silva-instance',
      })

      // Usar método privado via any cast (apenas para teste)
      const instanceName = await (service as any).getInstanceName('tenant-abc')

      expect(instanceName).toBe('dr-silva-instance')
      expect(mockAgentSettingsQB.where).toHaveBeenCalledWith({
        tenant_id: 'tenant-abc',
        enabled: true,
      })
    })

    it('getInstanceName retorna null se evolution_instance_name não estiver configurado', async () => {
      mockAgentSettingsQB.first.mockReset().mockResolvedValue({
        evolution_instance_name: null,
      })

      const instanceName = await (service as any).getInstanceName('tenant-xyz')

      expect(instanceName).toBeNull()
    })

    it('getInstanceName retorna null se registro não for encontrado', async () => {
      mockAgentSettingsQB.first.mockReset().mockResolvedValue(undefined)

      const instanceName = await (service as any).getInstanceName('tenant-inexistente')

      expect(instanceName).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Suite: @OnEvent handlers
// ---------------------------------------------------------------------------

describe('AgentService — @OnEvent handlers', () => {
  let service: AgentService

  // Mock Knex local para os handlers (busca direta na tabela patients)
  const mockPatientsQB = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
  }

  const mockKnexHandlers = jest.fn().mockImplementation((table: string) => {
    if (table === 'patients') return mockPatientsQB
    if (table === 'agent_settings') return mockAgentSettingsQB
    if (table === 'doctors') return mockDoctorQB
    return mockAgentSettingsQB
  })

  const mockWhatsappSendText = mockWhatsAppService.sendText

  beforeEach(async () => {
    jest.clearAllMocks()

    mockPatientsQB.first.mockResolvedValue({ phone: '+5511999999999', name: 'João' })

    // Mock padrão para getInstanceName: retornar INSTANCE_NAME
    mockAgentSettingsQB.first.mockResolvedValue({
      evolution_instance_name: INSTANCE_NAME,
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: KNEX, useValue: mockKnexHandlers },
        { provide: PatientService, useValue: mockPatientService },
        { provide: BookingService, useValue: mockBookingService },
        { provide: AppointmentService, useValue: mockAppointmentService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
      ],
    }).compile()

    service = module.get<AgentService>(AgentService)
  })

  // CT-94-01: onAppointmentCreated envia confirmação para o paciente
  it('CT-94-01: onAppointmentCreated → envia mensagem de confirmação com data formatada', async () => {
    await service.onAppointmentCreated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511888880001',
      dateTime: '2025-06-15T13:00:00.000Z',
      patientName: 'Maria Silva',
    })

    expect(mockWhatsappSendText).toHaveBeenCalledTimes(1)
    const [phone, message, instanceName] = mockWhatsappSendText.mock.calls[0] as [string, string, string]
    expect(phone).toBe('+5511888880001')
    expect(message).toContain('Maria Silva')
    expect(message).toContain('Sua consulta foi agendada para')
    expect(message).toContain('Aguardamos você!')
    expect(instanceName).toBe(INSTANCE_NAME)
  })

  // CT-94-02: onPortalActivated envia código de acesso
  it('CT-94-02: onPortalActivated → envia mensagem com URL do portal e código de acesso', async () => {
    await service.onPortalActivated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511777770001',
      portalAccessCode: 'ABC123',
    })

    expect(mockWhatsappSendText).toHaveBeenCalledTimes(1)
    const [phone, message, instanceName] = mockWhatsappSendText.mock.calls[0] as [string, string, string]
    expect(phone).toBe('+5511777770001')
    expect(message).toContain('http://localhost:5173/patient')
    expect(message).toContain('ABC123')
    expect(instanceName).toBe(INSTANCE_NAME)
  })

  // CT-94-03: onAppointmentStatusChanged com waiting envia notificação
  it('CT-94-03: onAppointmentStatusChanged com newStatus=waiting → busca phone e envia mensagem', async () => {
    await service.onAppointmentStatusChanged({
      tenantId: TENANT_ID,
      appointmentId: 'appt-uuid-001',
      patientId: 'patient-uuid-1',
      oldStatus: 'scheduled',
      newStatus: 'waiting',
    })

    expect(mockPatientsQB.select).toHaveBeenCalledWith('phone', 'name')
    expect(mockPatientsQB.where).toHaveBeenCalledWith({ id: 'patient-uuid-1', tenant_id: TENANT_ID })
    expect(mockWhatsappSendText).toHaveBeenCalledTimes(1)
    const [phone, message, instanceName] = mockWhatsappSendText.mock.calls[0] as [string, string, string]
    expect(phone).toBe('+5511999999999')
    expect(message).toContain('consultório está pronto para te receber')
    expect(instanceName).toBe(INSTANCE_NAME)
  })

  // CT-94-04: onAppointmentStatusChanged com outro status não envia mensagem
  it('CT-94-04: onAppointmentStatusChanged com newStatus != waiting → retorna early sem enviar mensagem', async () => {
    await service.onAppointmentStatusChanged({
      tenantId: TENANT_ID,
      appointmentId: 'appt-uuid-001',
      patientId: 'patient-uuid-1',
      oldStatus: 'scheduled',
      newStatus: 'in_progress',
    })

    expect(mockWhatsappSendText).not.toHaveBeenCalled()
    expect(mockPatientsQB.select).not.toHaveBeenCalled()
  })

  // CT-94-05: onAppointmentCancelled envia aviso com motivo
  it('CT-94-05: onAppointmentCancelled com reason → envia mensagem com motivo', async () => {
    await service.onAppointmentCancelled({
      tenantId: TENANT_ID,
      appointmentId: 'appt-uuid-002',
      patientId: 'patient-uuid-1',
      dateTime: '2025-06-20T10:00:00.000Z',
      reason: 'Agenda lotada',
    })

    expect(mockWhatsappSendText).toHaveBeenCalledTimes(1)
    const [phone, message, instanceName] = mockWhatsappSendText.mock.calls[0] as [string, string, string]
    expect(phone).toBe('+5511999999999')
    expect(message).toContain('foi cancelada')
    expect(message).toContain('Motivo: Agenda lotada')
    expect(message).toContain('Em caso de dúvidas')
    expect(instanceName).toBe(INSTANCE_NAME)
  })

  // CT-94-06: falha no WhatsApp não propaga exceção
  it('CT-94-06: sendText rejeita → handler não propaga exceção', async () => {
    mockWhatsappSendText.mockRejectedValueOnce(new Error('timeout'))

    await expect(
      service.onAppointmentCreated({
        tenantId: TENANT_ID,
        patientId: 'patient-uuid-1',
        phone: '+5511888880001',
        dateTime: '2025-06-15T13:00:00.000Z',
        patientName: 'Maria Silva',
      }),
    ).resolves.toBeUndefined()
  })

  // TD-20: Handler não envia quando instanceName é null
  it('Handler @OnEvent não envia mensagem quando getInstanceName retorna null', async () => {
    // Sobrescrever mock para retornar null (agente desabilitado ou sem instanceName)
    mockAgentSettingsQB.first.mockReset().mockResolvedValue(undefined)

    await service.onAppointmentCreated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511888880001',
      dateTime: '2025-06-15T13:00:00.000Z',
      patientName: 'Maria Silva',
    })

    // Não deve chamar sendText
    expect(mockWhatsappSendText).not.toHaveBeenCalled()
  })
})
