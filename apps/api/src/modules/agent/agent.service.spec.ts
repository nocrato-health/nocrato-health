/**
 * AgentService — Cloud API only
 *
 * Casos de teste cobertos:
 *  CT-93-01: Mensagem simples sem tool_calls → LLM responde → sendViaCloud chamado → appendMessages chamado
 *  CT-93-02: LLM retorna tool_call list_slots → getSlotsInternal chamado → 2ª chamada LLM → resposta enviada
 *  CT-93-03: LLM retorna tool_call generate_booking_link → generateToken chamado → resposta enviada
 *  CT-93-04: LLM retorna tool_call cancel_appointment → cancelByAgent chamado
 *  CT-93-05: Paciente não encontrado → handleMessageFromCloud continua → system prompt menciona "novo paciente"
 *  CT-93-06: appendMessages chamado com trim: 19 msgs + 2 novas
 *  CT-93-07: messageText vazia → handleMessageFromCloud retorna early
 *  CT-93-08: agente desabilitado (enabled=false) → loadAgentContext retorna null → early return
 *  CT-93-09: Erro na tool executeTool → retorna JSON de erro → fluxo continua sem quebrar
 *  CT-TD21-01: OpenAI rejeita na chamada inicial → retorna sem enviar mensagem
 *  CT-TD21-02: OpenAI rejeita dentro do loop de tool_calls → retorna sem enviar mensagem
 *  CT-cloud-svc-01: handleDoctorMessage → conversationService.activateHumanMode chamado
 *  CT-cloud-svc-02: whatsapp_phone_number_id não configurado → sendViaCloud NÃO chamado
 */

// ---------------------------------------------------------------------------
// Mocks ANTES de qualquer import
// ---------------------------------------------------------------------------

jest.mock('@/config/env', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test-key-valida',
    META_SYSTEM_USER_TOKEN: 'test-system-user-token',
    META_GRAPH_API_VERSION: 'v19.0',
    FRONTEND_URL: 'http://localhost:5173',
  },
}))

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
import { AgentService } from './agent.service'
import { PatientService } from '@/modules/patient/patient.service'
import { BookingService } from '@/modules/booking/booking.service'
import { AppointmentService } from '@/modules/appointment/appointment.service'
import { ConsentService } from '@/modules/consent/consent.service'
import { ConversationService } from './conversation.service'
import { WhatsAppService } from './whatsapp.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-xpto'
const PHONE = '5511999990001'
const PHONE_NUMBER_ID = 'phone-number-id-abc'
const CONVERSATION_ID = 'conv-uuid-abc'

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

const makeSimpleResponse = (content: string) => ({
  choices: [{ message: { role: 'assistant', content, tool_calls: undefined } }],
})

const makeToolCallResponse = (name: string, args: Record<string, unknown>, toolCallId = 'tc-001') => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: toolCallId, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      },
    },
  ],
})

const makeAgentSettings = () => ({
  personality: 'Atendente amigável',
  appointment_rules: 'Consultas de 30 min',
  faq: 'Aceitamos planos',
  booking_mode: 'both',
  welcome_message: 'Bem-vindo!',
  enabled: true,
})

const makeDoctorRow = () => ({
  name: 'Dr. Marcos Ferreira',
  specialty: 'Clínico Geral',
})

// ---------------------------------------------------------------------------
// Mock Knex
// ---------------------------------------------------------------------------

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
  if (table === 'doctors') return mockDoctorQB
  return mockAgentSettingsQB
})

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockPatientService = { findByPhone: jest.fn() }
const mockConversationService = {
  getOrCreate: jest.fn(),
  appendMessages: jest.fn(),
  shouldAgentRespond: jest.fn(),
  activateHumanMode: jest.fn(),
}
const mockBookingService = {
  getSlotsInternal: jest.fn(),
  generateToken: jest.fn(),
  bookInChat: jest.fn(),
}
const mockAppointmentService = { cancelByAgent: jest.fn() }
const mockWhatsAppService = { sendViaCloud: jest.fn() }
const mockConsentService = {
  hasConsent: jest.fn(),
  registerConsent: jest.fn(),
}

// ---------------------------------------------------------------------------
// Suite principal: handleMessageFromCloud
// ---------------------------------------------------------------------------

describe('AgentService — handleMessageFromCloud', () => {
  let service: AgentService

  beforeEach(async () => {
    jest.clearAllMocks()

    // Re-configurar todas as chains e implementações padrão após clearAllMocks
    // (necessário pois mockReset() em algum teste pode ter removido implementações)
    mockAgentSettingsQB.where.mockReturnThis()
    mockAgentSettingsQB.select.mockReturnThis()
    mockDoctorQB.where.mockReturnThis()
    mockDoctorQB.select.mockReturnThis()

    // Reset padrão: agentSettings enabled (loadAgentContext) + phone_number_id (getPhoneNumberId)
    // Ordem de chamada em processMessage: loadAgentContext → ... → getPhoneNumberId
    mockAgentSettingsQB.first
      .mockReset()
      .mockResolvedValueOnce(makeAgentSettings())                           // loadAgentContext
      .mockResolvedValueOnce({ whatsapp_phone_number_id: PHONE_NUMBER_ID }) // getPhoneNumberId (sendWhatsAppMessage)
    mockDoctorQB.first.mockResolvedValue(makeDoctorRow())
    mockPatientService.findByPhone.mockResolvedValue(makePatient())
    mockConversationService.getOrCreate.mockResolvedValue(makeConversation([]))
    mockConversationService.appendMessages.mockResolvedValue(undefined)
    mockConversationService.shouldAgentRespond.mockResolvedValue(true)
    mockConsentService.hasConsent.mockResolvedValue(true)
    mockConsentService.registerConsent.mockResolvedValue(undefined)
    mockWhatsAppService.sendViaCloud.mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: KNEX, useValue: mockKnex },
        { provide: PatientService, useValue: mockPatientService },
        { provide: BookingService, useValue: mockBookingService },
        { provide: AppointmentService, useValue: mockAppointmentService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
        { provide: ConsentService, useValue: mockConsentService },
      ],
    }).compile()

    service = module.get<AgentService>(AgentService)
  })

  // CT-93-01: Mensagem simples sem tool_calls
  it('CT-93-01: mensagem simples → LLM responde → sendViaCloud + appendMessages chamados', async () => {
    const resposta = 'Claro! Temos horários disponíveis na terça-feira.'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero agendar uma consulta')

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledWith(PHONE_NUMBER_ID, PHONE, resposta)
    expect(mockConversationService.appendMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Quero agendar uma consulta' }),
        expect.objectContaining({ role: 'assistant', content: resposta }),
      ]),
    )
    const appendArg = mockConversationService.appendMessages.mock.calls[0][1] as unknown[]
    expect(appendArg).toHaveLength(2)
  })

  // CT-93-02: LLM retorna tool_call list_slots
  it('CT-93-02: tool_call list_slots → getSlotsInternal chamado → 2ª resposta enviada', async () => {
    const slots = [{ start: '09:00', end: '09:30' }]
    mockBookingService.getSlotsInternal.mockResolvedValue({ slots })

    const respostaFinal = 'Temos horários às 09:00.'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('list_slots', { date: '2025-03-15' }))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero agendar')

    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)
    expect(mockBookingService.getSlotsInternal).toHaveBeenCalledWith(TENANT_ID, '2025-03-15')
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledWith(PHONE_NUMBER_ID, PHONE, respostaFinal)
  })

  // CT-93-03: LLM retorna tool_call generate_booking_link
  it('CT-93-03: tool_call generate_booking_link → generateToken chamado → link enviado', async () => {
    const tokenResult = { bookingUrl: 'http://localhost:5173/book/dr-marcos?token=abc123', token: 'abc123' }
    mockBookingService.generateToken.mockResolvedValue(tokenResult)

    const respostaFinal = 'Aqui está seu link: http://localhost:5173/book/dr-marcos?token=abc123'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('generate_booking_link', {}))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero o link')

    expect(mockBookingService.generateToken).toHaveBeenCalledWith(TENANT_ID, PHONE)
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledWith(PHONE_NUMBER_ID, PHONE, respostaFinal)
  })

  // CT-93-04: LLM retorna tool_call cancel_appointment
  it('CT-93-04: tool_call cancel_appointment → cancelByAgent chamado', async () => {
    const appointmentId = 'appt-uuid-999'
    mockAppointmentService.cancelByAgent.mockResolvedValue(undefined)

    const respostaFinal = 'Consulta cancelada com sucesso.'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('cancel_appointment', { appointmentId, reason: 'Não pode comparecer' }))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Cancelar consulta')

    expect(mockAppointmentService.cancelByAgent).toHaveBeenCalledWith(TENANT_ID, appointmentId, 'Não pode comparecer')
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledWith(PHONE_NUMBER_ID, PHONE, respostaFinal)
  })

  // CT-93-05: Paciente não encontrado → fluxo continua
  it('CT-93-05: paciente não encontrado → fluxo continua com patient=null', async () => {
    mockPatientService.findByPhone.mockResolvedValue(null)

    const resposta = 'Olá! Para agendar, preciso do seu nome.'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero agendar')

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const openaiCall = mockOpenAICreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const systemMessage = openaiCall.messages.find((m) => m.role === 'system')
    expect(systemMessage?.content).toMatch(/não cadastrado|novo paciente/i)
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalled()
  })

  // CT-93-06: appendMessages recebe exatamente as 2 novas mensagens
  it('CT-93-06: histórico com 19 msgs existentes → appendMessages recebe as 2 novas mensagens', async () => {
    const existingMessages = Array.from({ length: 19 }, (_, i) => ({
      role: 'user' as const,
      content: `Mensagem antiga ${i + 1}`,
      timestamp: new Date().toISOString(),
    }))
    mockConversationService.getOrCreate.mockResolvedValue(makeConversation(existingMessages))

    const resposta = 'Aqui estão os horários!'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero agendar')

    const newMessages = mockConversationService.appendMessages.mock.calls[0][1] as unknown[]
    expect(newMessages).toHaveLength(2)
    expect(newMessages[0]).toMatchObject({ role: 'user' })
    expect(newMessages[1]).toMatchObject({ role: 'assistant', content: resposta })
  })

  // CT-93-07: messageText vazia → early return
  it('CT-93-07: messageText vazia → retorna early sem chamar OpenAI', async () => {
    await service.handleMessageFromCloud(TENANT_ID, PHONE, '')

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
  })

  // CT-93-08: agente desabilitado → early return
  it('CT-93-08: agente desabilitado (enabled=false) → loadAgentContext retorna null → early return', async () => {
    // Sobrescrever mock: agente desabilitado
    mockAgentSettingsQB.first
      .mockReset()
      .mockResolvedValue({ ...makeAgentSettings(), enabled: false })

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero agendar')

    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
  })

  // CT-93-09: Erro na tool → retorna JSON de erro → fluxo continua
  it('CT-93-09: erro na tool → executeTool retorna JSON de erro → fluxo continua sem quebrar', async () => {
    mockBookingService.getSlotsInternal.mockRejectedValue(new Error('Serviço indisponível'))

    const respostaFinal = 'Desculpe, não consegui verificar os horários.'
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('list_slots', { date: '2025-03-15' }, 'tc-erro-001'))
      .mockResolvedValueOnce(makeSimpleResponse(respostaFinal))

    await expect(service.handleMessageFromCloud(TENANT_ID, PHONE, 'Horários?')).resolves.toBeUndefined()

    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)

    const secondCall = mockOpenAICreate.mock.calls[1][0] as {
      messages: Array<{ role: string; content?: string; tool_call_id?: string }>
    }
    const toolResultMsg = secondCall.messages.find(
      (m) => m.role === 'tool' && m.tool_call_id === 'tc-erro-001',
    )
    expect(toolResultMsg).toBeDefined()
    expect(toolResultMsg?.content).toContain('error')

    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledWith(PHONE_NUMBER_ID, PHONE, respostaFinal)
  })

  // CT-TD21-01: falha na chamada inicial → retorna sem enviar mensagem
  it('CT-TD21-01: OpenAI rejeita na chamada inicial → retorna sem enviar mensagem', async () => {
    mockOpenAICreate.mockRejectedValue(new Error('Connection timeout'))

    await expect(service.handleMessageFromCloud(TENANT_ID, PHONE, 'Quero agendar')).resolves.toBeUndefined()

    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
    expect(mockConversationService.appendMessages).not.toHaveBeenCalled()
  })

  // CT-TD21-02: falha na chamada dentro do loop de tool_calls → retorna sem enviar mensagem
  it('CT-TD21-02: OpenAI rejeita dentro do loop de tool_calls → retorna sem enviar mensagem', async () => {
    mockOpenAICreate
      .mockResolvedValueOnce(makeToolCallResponse('list_slots', { date: '2025-03-15' }))
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))

    mockBookingService.getSlotsInternal.mockResolvedValue({ slots: [] })

    await expect(service.handleMessageFromCloud(TENANT_ID, PHONE, 'Horários?')).resolves.toBeUndefined()

    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)
    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
    expect(mockConversationService.appendMessages).not.toHaveBeenCalled()
  })

  // CT-cloud-svc-01: handleDoctorMessage → activateHumanMode chamado
  it('CT-cloud-svc-01: handleDoctorMessage → conversationService.activateHumanMode chamado', async () => {
    await service.handleDoctorMessage(TENANT_ID, PHONE)

    expect(mockConversationService.activateHumanMode).toHaveBeenCalledWith(TENANT_ID, PHONE)
  })

  // CT-cloud-svc-02: phone_number_id não configurado → sendViaCloud NÃO chamado
  it('CT-cloud-svc-02: whatsapp_phone_number_id null → sendViaCloud NÃO chamado', async () => {
    // Sobrescrever: primeiro getPhoneNumberId retorna null → sendViaCloud não chamado
    // Nota: loadAgentContext é chamado antes de sendWhatsAppMessage, mas aqui o agente
    // já carregou o contexto e a mensagem já foi gerada — só o envio que falha
    mockAgentSettingsQB.first
      .mockReset()
      .mockResolvedValueOnce(makeAgentSettings())                  // loadAgentContext
      .mockResolvedValueOnce({ whatsapp_phone_number_id: null })   // getPhoneNumberId

    const resposta = 'Olá!'
    mockOpenAICreate.mockResolvedValue(makeSimpleResponse(resposta))

    await service.handleMessageFromCloud(TENANT_ID, PHONE, 'Oi')

    // Resposta gerada mas não enviada (sem phone_number_id)
    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Suite: @OnEvent handlers
// ---------------------------------------------------------------------------

describe('AgentService — @OnEvent handlers', () => {
  let service: AgentService

  const mockPatientsQB = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
  }

  const mockKnexHandlers = jest.fn().mockImplementation((table: string) => {
    if (table === 'patients') return mockPatientsQB
    if (table === 'doctors') return mockDoctorQB
    return mockAgentSettingsQB
  })

  const PHONE_NUMBER_ID_HANDLER = 'phone-num-id-handler'

  beforeEach(async () => {
    jest.clearAllMocks()

    // Restaurar chains após possível mockReset() em testes anteriores
    mockAgentSettingsQB.where.mockReturnThis()
    mockAgentSettingsQB.select.mockReturnThis()
    mockPatientsQB.select.mockReturnThis()
    mockPatientsQB.where.mockReturnThis()

    mockPatientsQB.first.mockResolvedValue({ phone: '+5511999999999', name: 'João' })
    mockAgentSettingsQB.first.mockResolvedValue({ whatsapp_phone_number_id: PHONE_NUMBER_ID_HANDLER })
    mockDoctorQB.first.mockResolvedValue(makeDoctorRow())
    mockWhatsAppService.sendViaCloud.mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: KNEX, useValue: mockKnexHandlers },
        { provide: PatientService, useValue: mockPatientService },
        { provide: BookingService, useValue: mockBookingService },
        { provide: AppointmentService, useValue: mockAppointmentService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
        { provide: ConsentService, useValue: mockConsentService },
      ],
    }).compile()

    service = module.get<AgentService>(AgentService)
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // CT-94-01: onAppointmentCreated envia confirmação
  it('CT-94-01: onAppointmentCreated → envia mensagem de confirmação via sendViaCloud', async () => {
    await service.onAppointmentCreated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511888880001',
      dateTime: '2025-06-15T13:00:00.000Z',
      patientName: 'Maria Silva',
    })

    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledTimes(1)
    const [phoneNumberId, phone, message] = mockWhatsAppService.sendViaCloud.mock.calls[0] as [string, string, string]
    expect(phoneNumberId).toBe(PHONE_NUMBER_ID_HANDLER)
    expect(phone).toBe('+5511888880001')
    expect(message).toContain('Maria Silva')
    expect(message).toContain('Sua consulta foi agendada para')
    expect(message).toContain('Aguardamos você!')
  })

  // CT-94-02: onPortalActivated envia código de acesso
  it('CT-94-02: onPortalActivated → envia mensagem com URL do portal e código via sendViaCloud', async () => {
    await service.onPortalActivated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511777770001',
      portalAccessCode: 'ABC123',
    })

    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledTimes(1)
    const [phoneNumberId, phone, message] = mockWhatsAppService.sendViaCloud.mock.calls[0] as [string, string, string]
    expect(phoneNumberId).toBe(PHONE_NUMBER_ID_HANDLER)
    expect(phone).toBe('+5511777770001')
    expect(message).toContain('http://localhost:5173/patient')
    expect(message).toContain('ABC123')
  })

  // CT-94-03: onAppointmentStatusChanged com waiting envia notificação
  it('CT-94-03: onAppointmentStatusChanged com newStatus=waiting → busca phone e envia via sendViaCloud', async () => {
    await service.onAppointmentStatusChanged({
      tenantId: TENANT_ID,
      appointmentId: 'appt-uuid-001',
      patientId: 'patient-uuid-1',
      oldStatus: 'scheduled',
      newStatus: 'waiting',
    })

    expect(mockPatientsQB.select).toHaveBeenCalledWith('phone', 'name')
    expect(mockPatientsQB.where).toHaveBeenCalledWith({ id: 'patient-uuid-1', tenant_id: TENANT_ID })
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledTimes(1)
    const [phoneNumberId, phone, message] = mockWhatsAppService.sendViaCloud.mock.calls[0] as [string, string, string]
    expect(phoneNumberId).toBe(PHONE_NUMBER_ID_HANDLER)
    expect(phone).toBe('+5511999999999')
    expect(message).toContain('consultório está pronto para te receber')
  })

  // CT-94-04: onAppointmentStatusChanged com outro status não envia mensagem
  it('CT-94-04: onAppointmentStatusChanged com newStatus != waiting → retorna early sem enviar', async () => {
    await service.onAppointmentStatusChanged({
      tenantId: TENANT_ID,
      appointmentId: 'appt-uuid-001',
      patientId: 'patient-uuid-1',
      oldStatus: 'scheduled',
      newStatus: 'in_progress',
    })

    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
    expect(mockPatientsQB.select).not.toHaveBeenCalled()
  })

  // CT-94-05: onAppointmentCancelled envia aviso com motivo
  it('CT-94-05: onAppointmentCancelled com reason → envia mensagem com motivo via sendViaCloud', async () => {
    await service.onAppointmentCancelled({
      tenantId: TENANT_ID,
      appointmentId: 'appt-uuid-002',
      patientId: 'patient-uuid-1',
      dateTime: '2025-06-20T10:00:00.000Z',
      reason: 'Agenda lotada',
    })

    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledTimes(1)
    const [phoneNumberId, phone, message] = mockWhatsAppService.sendViaCloud.mock.calls[0] as [string, string, string]
    expect(phoneNumberId).toBe(PHONE_NUMBER_ID_HANDLER)
    expect(phone).toBe('+5511999999999')
    expect(message).toContain('foi cancelada')
    expect(message).toContain('Motivo: Agenda lotada')
    expect(message).toContain('Em caso de dúvidas')
  })

  // CT-94-06: falha no WhatsApp não propaga exceção (decorator retries e loga)
  it('CT-94-06: sendViaCloud rejeita → decorator retries e não propaga exceção', async () => {
    mockWhatsAppService.sendViaCloud.mockRejectedValue(new Error('timeout'))

    const promise = service.onAppointmentCreated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511888880001',
      dateTime: '2025-06-15T13:00:00.000Z',
      patientName: 'Maria Silva',
    })
    await jest.runAllTimersAsync()
    await expect(promise).resolves.toBeUndefined()

    // 4 tentativas: 1 original + 3 retries (default maxRetries=3)
    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledTimes(4)
  })

  // CT-94-07: sendViaCloud falha 2x, sucesso na 3a — handler completa com sucesso
  it('CT-94-07: sendViaCloud falha 2x e sucesso na 3a → mensagem enviada via retry', async () => {
    mockWhatsAppService.sendViaCloud
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(undefined)

    const promise = service.onAppointmentCreated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511888880001',
      dateTime: '2025-06-15T13:00:00.000Z',
      patientName: 'Maria Silva',
    })
    await jest.runAllTimersAsync()
    await promise

    expect(mockWhatsAppService.sendViaCloud).toHaveBeenCalledTimes(3)
  })

  // phone_number_id null → handler não envia
  it('Handler @OnEvent não envia quando getPhoneNumberId retorna null', async () => {
    mockAgentSettingsQB.first.mockResolvedValue({ whatsapp_phone_number_id: null })

    await service.onAppointmentCreated({
      tenantId: TENANT_ID,
      patientId: 'patient-uuid-1',
      phone: '+5511888880001',
      dateTime: '2025-06-15T13:00:00.000Z',
      patientName: 'Maria Silva',
    })

    expect(mockWhatsAppService.sendViaCloud).not.toHaveBeenCalled()
  })
})
