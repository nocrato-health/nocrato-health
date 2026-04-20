import { Inject, Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { RetryOnError } from '@/common/decorators/retry-on-error.decorator'
import { redactPiiInString } from '@/common/logging/redact-pii'
import type { Knex } from 'knex'
import OpenAI from 'openai'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { PatientService, type PatientPublicRow } from '@/modules/patient/patient.service'
import { BookingService } from '@/modules/booking/booking.service'
import { AppointmentService } from '@/modules/appointment/appointment.service'
import { ConsentService } from '@/modules/consent/consent.service'
import { ConversationService, type ConversationMessage } from './conversation.service'
import { WhatsAppService } from './whatsapp.service'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface AgentContext {
  doctorName: string
  specialty: string | null
  personality: string | null
  appointmentRules: string | null
  faq: string | null
  bookingMode: 'link' | 'chat' | 'both'
  welcomeMessage: string | null
}

// ---------------------------------------------------------------------------
// Máximo de iterações do loop de tool calls (anti-loop infinito)
// ---------------------------------------------------------------------------
const MAX_TOOL_ITERATIONS = 5

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)
  private readonly openai: OpenAI

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly patientService: PatientService,
    private readonly bookingService: BookingService,
    private readonly appointmentService: AppointmentService,
    private readonly conversationService: ConversationService,
    private readonly whatsappService: WhatsAppService,
    private readonly consentService: ConsentService,
  ) {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  }

  // ---------------------------------------------------------------------------
  // handleMessageFromCloud — entrypoint para Cloud API (Meta)
  // O tenant já vem resolvido pelo controller (via phone_number_id → agent_settings).
  // ---------------------------------------------------------------------------

  async handleMessageFromCloud(tenantId: string, phone: string, messageText: string): Promise<void> {
    if (!messageText.trim()) return
    await this.processMessage(tenantId, phone, messageText)
  }

  /**
   * Registra que o doutor enviou uma mensagem → ativa modo 'human' (handoff).
   * Chamado pelo controller quando `statuses[].status === 'sent'` aparece no webhook Cloud.
   */
  async handleDoctorMessage(tenantId: string, phone: string): Promise<void> {
    await this.conversationService.activateHumanMode(tenantId, phone)
    this.logger.log(`[AgentService] Handoff → human mode ativado para phone=${phone} tenant=${tenantId}`)
  }

  // ---------------------------------------------------------------------------
  // processMessage — core do agente, agnóstico de provider
  // ---------------------------------------------------------------------------

  private async processMessage(tenantId: string, phone: string, messageText: string): Promise<void> {
    // 1. Checar se o agente deve responder (handoff doutor↔agente)
    const shouldRespond = await this.conversationService.shouldAgentRespond(tenantId, phone)
    if (!shouldRespond) {
      this.logger.log(`[AgentService] Modo 'human' ativo para phone=${phone} — agente não responde`)
      return
    }

    // 2. Buscar contexto do paciente (pode não existir ainda)
    const patient = await this.patientService.findByPhone(tenantId, phone)

    // 2b. LGPD: verificar se é primeira interação (sem consentimento registrado)
    let isFirstInteraction = true
    if (patient) {
      const hasConsent = await this.consentService.hasConsent(tenantId, patient.id, 'privacy_policy')
      if (!hasConsent) {
        await this.consentService.registerConsent({
          tenantId,
          patientId: patient.id,
          consentType: 'privacy_policy',
          source: 'whatsapp_agent',
        })
      } else {
        isFirstInteraction = false
      }
    }

    // 3. Carregar configurações do agente e dados do doutor
    const agentCtx = await this.loadAgentContext(tenantId)
    if (!agentCtx) {
      this.logger.warn(`[AgentService] Configurações do agente não encontradas para tenant ${tenantId}`)
      return
    }

    // 4. Buscar ou criar conversa para este phone
    const conversation = await this.conversationService.getOrCreate(tenantId, phone)

    // 5. Montar system prompt
    const systemPrompt = this.buildSystemPrompt(agentCtx, patient)

    // 6. Montar messages para OpenAI (histórico + nova mensagem do usuário)
    const historyMessages = conversation.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...historyMessages,
      { role: 'user', content: messageText },
    ]

    // 6b. LGPD: na primeira interação, injetar instrução para incluir link da política
    if (isFirstInteraction) {
      openaiMessages.push({
        role: 'system',
        content: `IMPORTANTE: Esta é a primeira interação deste paciente. Inclua na sua resposta: "Ao continuar esta conversa, você concorda com nossa política de privacidade: ${env.FRONTEND_URL}/politica-de-privacidade. Se desejar parar, envie SAIR."`,
      })
    }

    // 7. Chamar OpenAI com tools
    let response: OpenAI.Chat.Completions.ChatCompletion
    let iterations = 0

    try {
      response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...openaiMessages],
        tools: this.getTools(agentCtx.bookingMode),
        tool_choice: 'auto',
      })
    } catch (err) {
      this.logger.error(
        redactPiiInString(
          `[AgentService] Falha na chamada inicial à OpenAI — tenant=${tenantId} phone=${phone}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      return
    }

    // 8. Loop de execução de tools (máx MAX_TOOL_ITERATIONS para evitar loop infinito)
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    while (response.choices[0].message.tool_calls?.length && iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      const assistantMsg = response.choices[0].message

      toolMessages.push(assistantMsg)

      const functionToolCalls = (assistantMsg.tool_calls ?? []).filter(
        (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
          tc.type === 'function',
      )
      const toolResultMessages = await Promise.all(
        functionToolCalls.map((tc) =>
          this.executeTool(tc, tenantId, phone, patient),
        ),
      )
      toolMessages.push(...toolResultMessages)

      try {
        response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...openaiMessages,
            ...toolMessages,
          ],
          tools: this.getTools(agentCtx.bookingMode),
          tool_choice: 'auto',
        })
      } catch (err) {
        this.logger.error(
          redactPiiInString(
            `[AgentService] Falha na chamada à OpenAI após ${iterations} iteração(ões) de tool_calls — tenant=${tenantId} phone=${phone}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        )
        return
      }
    }

    // 9. Extrair resposta final
    const responseText =
      response.choices[0].message.content ??
      'Desculpe, não consegui processar sua mensagem no momento.'

    // 10. Persistir mensagens no histórico
    const newMessages: ConversationMessage[] = [
      { role: 'user', content: messageText, timestamp: new Date().toISOString() },
      { role: 'assistant', content: responseText, timestamp: new Date().toISOString() },
    ]
    await this.conversationService.appendMessages(conversation.id, newMessages)

    // 11. Enviar resposta via Cloud API
    await this.sendWhatsAppMessage(tenantId, phone, responseText)
  }

  // ---------------------------------------------------------------------------
  // Métodos auxiliares privados
  // ---------------------------------------------------------------------------

  /**
   * Retorna o whatsapp_phone_number_id configurado para o tenant.
   * Usado pelos handlers @OnEvent para enviar notificações via WhatsApp.
   * Retorna null se o agente não estiver habilitado ou se phone_number_id não estiver configurado.
   */
  private async getPhoneNumberId(tenantId: string): Promise<string | null> {
    const row = await this.knex('agent_settings')
      .where({ tenant_id: tenantId, enabled: true })
      .select('whatsapp_phone_number_id')
      .first()
    return (row?.whatsapp_phone_number_id as string | undefined) ?? null
  }

  /**
   * Envia mensagem via Cloud API buscando o phone_number_id do tenant.
   */
  private async sendWhatsAppMessage(
    tenantId: string,
    phone: string,
    text: string,
  ): Promise<void> {
    const phoneNumberId = await this.getPhoneNumberId(tenantId)
    if (!phoneNumberId) {
      this.logger.warn(`[AgentService] whatsapp_phone_number_id não configurado para tenant ${tenantId} — mensagem não enviada`)
      return
    }
    await this.whatsappService.sendViaCloud(phoneNumberId, phone, text)
  }

  /**
   * Carrega as configurações do agente e dados do doutor para o tenant.
   */
  private async loadAgentContext(tenantId: string): Promise<AgentContext | null> {
    const [agentSettings, doctor] = await Promise.all([
      this.knex('agent_settings')
        .where({ tenant_id: tenantId })
        .select(
          'personality',
          'appointment_rules',
          'faq',
          'booking_mode',
          'welcome_message',
          'enabled',
        )
        .first(),
      this.knex('doctors')
        .where({ tenant_id: tenantId, status: 'active' })
        .select('name', 'specialty')
        .first(),
    ])

    if (!agentSettings || !agentSettings.enabled) {
      return null
    }

    return {
      doctorName: (doctor?.name as string | undefined) ?? 'Médico',
      specialty: (doctor?.specialty as string | null | undefined) ?? null,
      personality: (agentSettings.personality as string | null | undefined) ?? null,
      appointmentRules: (agentSettings.appointment_rules as string | null | undefined) ?? null,
      faq: (agentSettings.faq as string | null | undefined) ?? null,
      bookingMode: (agentSettings.booking_mode as 'link' | 'chat' | 'both') ?? 'both',
      welcomeMessage: (agentSettings.welcome_message as string | null | undefined) ?? null,
    }
  }

  /**
   * Constrói o system prompt com base nas configurações do agente e contexto do paciente.
   */
  private buildSystemPrompt(ctx: AgentContext, patient: PatientPublicRow | null): string {
    const lines: string[] = [
      `Você é o assistente virtual do consultório do Dr(a). ${ctx.doctorName}${ctx.specialty ? ` — ${ctx.specialty}` : ''}.`,
      `Sua função é atender pacientes via WhatsApp, responder dúvidas e auxiliar no agendamento de consultas.`,
      `Responda sempre em português brasileiro, de forma clara e empática.`,
    ]

    if (ctx.personality) {
      lines.push(`\n== Personalidade e tom ==\n${ctx.personality}`)
    }

    if (ctx.appointmentRules) {
      lines.push(`\n== Regras de agendamento ==\n${ctx.appointmentRules}`)
    }

    if (ctx.faq) {
      lines.push(`\n== Perguntas frequentes ==\n${ctx.faq}`)
    }

    if (ctx.bookingMode === 'link') {
      lines.push(
        `\n== Modo de agendamento ==\nSempre gere um link de agendamento ao invés de agendar diretamente no chat. Use a tool generate_booking_link.`,
      )
    } else if (ctx.bookingMode === 'chat') {
      lines.push(
        `\n== Modo de agendamento ==\nAgende as consultas diretamente no chat usando as tools list_slots e book_appointment. Não gere links externos.`,
      )
    } else {
      lines.push(
        `\n== Modo de agendamento ==\nVocê pode agendar diretamente no chat ou gerar um link, conforme a preferência do paciente.`,
      )
    }

    if (patient) {
      lines.push(`\n== Paciente identificado ==`)
      lines.push(`Nome: ${patient.name}`)
      lines.push(`Telefone: ${patient.phone}`)
      if (patient.email) lines.push(`E-mail: ${patient.email}`)
    } else {
      lines.push(
        `\n== Paciente não cadastrado ==\nEste paciente ainda não está no sistema. Se for agendar uma consulta, colete o nome completo.`,
      )
    }

    lines.push(
      `\n== Instruções gerais ==`,
      `- Não invente informações sobre o médico, horários ou procedimentos.`,
      `- Para ver horários disponíveis, use a tool list_slots com uma data específica (YYYY-MM-DD).`,
      `- Para cancelar uma consulta, solicite o ID da consulta ao paciente e use cancel_appointment.`,
      `- Nunca compartilhe dados de outros pacientes.`,
    )

    return lines.join('\n')
  }

  /**
   * Retorna as tools disponíveis para o LLM, filtradas pelo booking_mode.
   */
  private getTools(
    bookingMode: 'link' | 'chat' | 'both',
  ): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
    const allTools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = [
      {
        type: 'function',
        function: {
          name: 'list_slots',
          description:
            'Lista os horários disponíveis para agendamento em uma data específica. Retorna uma lista de slots livres (start e end em HH:MM).',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Data no formato YYYY-MM-DD (ex: 2025-03-15)',
              },
            },
            required: ['date'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'book_appointment',
          description:
            'Agenda uma consulta diretamente no chat para o paciente. Usar apenas quando booking_mode for "chat" ou "both". Requer data/hora no formato ISO 8601 e nome do paciente.',
          parameters: {
            type: 'object',
            properties: {
              dateTime: {
                type: 'string',
                description:
                  'Data e hora da consulta no formato ISO 8601 (ex: 2025-03-15T10:00:00.000Z)',
              },
              patientName: {
                type: 'string',
                description: 'Nome completo do paciente',
              },
            },
            required: ['dateTime', 'patientName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generate_booking_link',
          description:
            'Gera um link de agendamento válido por 24h para o paciente acessar a página de booking. Usar quando booking_mode for "link" ou quando o paciente preferir o link.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_appointment',
          description:
            'Cancela uma consulta agendada. Requer o ID da consulta (UUID). O paciente deve fornecer esse ID ou o assistente deve confirmá-lo antes.',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'UUID da consulta a ser cancelada',
              },
              reason: {
                type: 'string',
                description: 'Motivo do cancelamento (opcional)',
              },
            },
            required: ['appointmentId'],
          },
        },
      },
    ]

    const linkNames = new Set(['list_slots', 'generate_booking_link', 'cancel_appointment'])
    const chatNames = new Set(['list_slots', 'book_appointment', 'cancel_appointment'])

    if (bookingMode === 'link') {
      return allTools.filter((t) => linkNames.has(t.function.name))
    }

    if (bookingMode === 'chat') {
      return allTools.filter((t) => chatNames.has(t.function.name))
    }

    return allTools
  }

  // ---------------------------------------------------------------------------
  // @OnEvent handlers — notificações proativas ao paciente via WhatsApp
  // @RetryOnError() garante retry com backoff exponencial; após esgotar tentativas, loga e descarta
  // ---------------------------------------------------------------------------

  @OnEvent('appointment.created')
  @RetryOnError()
  async onAppointmentCreated(payload: {
    tenantId: string
    patientId: string
    phone: string
    dateTime: string
    patientName: string
  }): Promise<void> {
    const phoneNumberId = await this.getPhoneNumberId(payload.tenantId)
    if (!phoneNumberId) {
      this.logger.warn(`[AgentService] whatsapp_phone_number_id não configurado para tenant ${payload.tenantId}`)
      return
    }

    const formatted = new Date(payload.dateTime).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    })
    const message = `Olá ${payload.patientName}! Sua consulta foi agendada para ${formatted}. Aguardamos você!`
    await this.whatsappService.sendViaCloud(phoneNumberId, payload.phone, message)
  }

  @OnEvent('appointment.cancelled')
  @RetryOnError()
  async onAppointmentCancelled(payload: {
    tenantId: string
    appointmentId: string
    patientId: string
    dateTime: string
    reason?: string
  }): Promise<void> {
    const phoneNumberId = await this.getPhoneNumberId(payload.tenantId)
    if (!phoneNumberId) {
      this.logger.warn(`[AgentService] whatsapp_phone_number_id não configurado para tenant ${payload.tenantId}`)
      return
    }

    const row = await this.knex('patients')
      .select('phone', 'name')
      .where({ id: payload.patientId, tenant_id: payload.tenantId })
      .first()

    if (!row) {
      this.logger.error(
        'Paciente não encontrado para envio de cancelamento',
        `patientId=${payload.patientId}`,
      )
      return
    }

    const formatted = new Date(payload.dateTime).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    })
    const motivo = payload.reason ? ` Motivo: ${payload.reason}` : ''
    const message = `Olá! Sua consulta marcada para ${formatted} foi cancelada.${motivo} Em caso de dúvidas, entre em contato.`
    await this.whatsappService.sendViaCloud(phoneNumberId, row.phone as string, message)
  }

  @OnEvent('appointment.status_changed')
  @RetryOnError()
  async onAppointmentStatusChanged(payload: {
    tenantId: string
    appointmentId: string
    patientId: string
    oldStatus: string
    newStatus: string
    reason?: string
  }): Promise<void> {
    if (payload.newStatus !== 'waiting') {
      return
    }

    const phoneNumberId = await this.getPhoneNumberId(payload.tenantId)
    if (!phoneNumberId) {
      this.logger.warn(`[AgentService] whatsapp_phone_number_id não configurado para tenant ${payload.tenantId}`)
      return
    }

    const row = await this.knex('patients')
      .select('phone', 'name')
      .where({ id: payload.patientId, tenant_id: payload.tenantId })
      .first()

    if (!row) {
      this.logger.error(
        'Paciente não encontrado para envio de notificação de status',
        `patientId=${payload.patientId}`,
      )
      return
    }

    const message = `Olá! O consultório está pronto para te receber. Por favor, dirija-se à recepção.`
    await this.whatsappService.sendViaCloud(phoneNumberId, row.phone as string, message)
  }

  @OnEvent('patient.portal_activated')
  @RetryOnError()
  async onPortalActivated(payload: {
    tenantId: string
    patientId: string
    phone: string | undefined
    portalAccessCode: string
  }): Promise<void> {
    const phoneNumberId = await this.getPhoneNumberId(payload.tenantId)
    if (!phoneNumberId) {
      this.logger.warn(`[AgentService] whatsapp_phone_number_id não configurado para tenant ${payload.tenantId}`)
      return
    }

    if (!payload.phone) {
      this.logger.warn(
        `Paciente sem telefone — não foi possível enviar código do portal via WhatsApp. patientId=${payload.patientId}`,
      )
      return
    }
    const message = `Seu portal de saúde está pronto! Acesse ${env.FRONTEND_URL}/patient e use o código: ${payload.portalAccessCode}`
    await this.whatsappService.sendViaCloud(phoneNumberId, payload.phone, message)
  }

  // ---------------------------------------------------------------------------
  // executeTool — helper privado de processMessage
  // ---------------------------------------------------------------------------

  private async executeTool(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall,
    tenantId: string,
    phone: string,
    patient: PatientPublicRow | null,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
    let result: unknown

    try {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

      switch (toolCall.function.name) {
        case 'list_slots': {
          result = await this.bookingService.getSlotsInternal(tenantId, args.date as string)
          break
        }

        case 'book_appointment': {
          const patientName =
            (args.patientName as string | undefined) ??
            patient?.name ??
            'Paciente'

          result = await this.bookingService.bookInChat(tenantId, {
            dateTime: args.dateTime as string,
            name: patientName,
            phone,
          })
          break
        }

        case 'generate_booking_link': {
          result = await this.bookingService.generateToken(tenantId, phone)
          break
        }

        case 'cancel_appointment': {
          await this.appointmentService.cancelByAgent(
            tenantId,
            args.appointmentId as string,
            (args.reason as string | undefined) ?? 'Cancelado pelo paciente via WhatsApp',
          )
          result = { success: true, message: 'Consulta cancelada com sucesso' }
          break
        }

        default: {
          result = { error: `Tool desconhecida: ${toolCall.function.name}` }
        }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Erro ao executar a ação solicitada'
      this.logger.error(
        `[AgentService] Erro ao executar tool ${toolCall.function.name}: ${message}`,
      )
      result = { error: message }
    }

    return {
      role: 'tool',
      content: JSON.stringify(result),
      tool_call_id: toolCall.id,
    }
  }
}
