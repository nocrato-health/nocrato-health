import { Inject, Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { Knex } from 'knex'
import OpenAI from 'openai'
import { KNEX } from '@/database/knex.provider'
import { env } from '@/config/env'
import { PatientService, type PatientPublicRow } from '@/modules/patient/patient.service'
import { BookingService } from '@/modules/booking/booking.service'
import { AppointmentService } from '@/modules/appointment/appointment.service'
import { ConversationService, type ConversationMessage } from './conversation.service'
import { WhatsAppService } from './whatsapp.service'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
    }
    message?: {
      conversation?: string
      extendedTextMessage?: { text?: string }
    }
    pushName?: string
  }
}

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

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly patientService: PatientService,
    private readonly bookingService: BookingService,
    private readonly appointmentService: AppointmentService,
    private readonly conversationService: ConversationService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  // ---------------------------------------------------------------------------
  // handleMessage — ponto de entrada para cada mensagem recebida via webhook
  // ---------------------------------------------------------------------------

  async handleMessage(payload: EvolutionWebhookPayload): Promise<void> {
    // 1. Extrair dados da mensagem
    const remoteJid = payload.data.key.remoteJid // "5511999999999@s.whatsapp.net"
    const phone = remoteJid.replace('@s.whatsapp.net', '')
    const messageText =
      payload.data.message?.conversation ??
      payload.data.message?.extendedTextMessage?.text ??
      ''

    if (!messageText.trim()) {
      return // ignora mensagens sem texto (imagens, áudios, etc.)
    }

    // 2. Resolver tenant pela instância Evolution que recebeu a mensagem
    const tenantId = await this.resolveTenantFromInstance(payload.instance)
    if (!tenantId) {
      this.logger.warn(
        `[AgentService] Instância Evolution "${payload.instance}" não mapeada para nenhum tenant ativo`,
      )
      return
    }

    // 3. Buscar contexto do paciente (pode não existir ainda)
    const patient = await this.patientService.findByPhone(tenantId, phone)

    // 4. Carregar configurações do agente e dados do doutor
    const agentCtx = await this.loadAgentContext(tenantId)
    if (!agentCtx) {
      this.logger.warn(`[AgentService] Configurações do agente não encontradas para tenant ${tenantId}`)
      return
    }

    // 5. Buscar ou criar conversa para este phone
    const conversation = await this.conversationService.getOrCreate(tenantId, phone)

    // 6. Montar system prompt
    const systemPrompt = this.buildSystemPrompt(agentCtx, patient)

    // 7. Montar messages para OpenAI (histórico + nova mensagem do usuário)
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

    // 8. Chamar OpenAI com tools
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

    let response: OpenAI.Chat.Completions.ChatCompletion
    let iterations = 0

    try {
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...openaiMessages],
        tools: this.getTools(agentCtx.bookingMode),
        tool_choice: 'auto',
      })
    } catch (err) {
      this.logger.error(
        `[AgentService] Falha na chamada inicial à OpenAI — tenant=${tenantId} phone=${phone}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    // 9. Loop de execução de tools (máx MAX_TOOL_ITERATIONS para evitar loop infinito)
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    while (response.choices[0].message.tool_calls?.length && iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      const assistantMsg = response.choices[0].message

      // Adicionar mensagem do assistente com tool_calls ao contexto
      toolMessages.push(assistantMsg)

      // Executar todas as tool_calls em paralelo
      // Filtra apenas function tool calls (type guard contra ChatCompletionMessageCustomToolCall)
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

      // Nova chamada ao LLM com os resultados das tools
      try {
        response = await openai.chat.completions.create({
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
          `[AgentService] Falha na chamada à OpenAI após ${iterations} iteração(ões) de tool_calls — tenant=${tenantId} phone=${phone}: ${err instanceof Error ? err.message : String(err)}`,
        )
        return
      }
    }

    // 10. Extrair resposta final
    const responseText =
      response.choices[0].message.content ??
      'Desculpe, não consegui processar sua mensagem no momento.'

    // 11. Persistir mensagens no histórico
    const newMessages: ConversationMessage[] = [
      { role: 'user', content: messageText, timestamp: new Date().toISOString() },
      { role: 'assistant', content: responseText, timestamp: new Date().toISOString() },
    ]
    await this.conversationService.appendMessages(conversation.id, newMessages)

    // 12. Enviar resposta via WhatsApp
    await this.whatsappService.sendText(phone, responseText)
  }

  // ---------------------------------------------------------------------------
  // Métodos auxiliares privados
  // ---------------------------------------------------------------------------

  /**
   * Resolve o tenant_id a partir do nome da instância Evolution que recebeu a mensagem.
   *
   * Cada doutor configura seu próprio `evolution_instance_name` em agent_settings.
   * A resolução filtra por `enabled=true AND evolution_instance_name=instanceName`,
   * garantindo isolamento de tenant: mensagens de uma instância nunca são processadas
   * com o contexto de outro tenant.
   *
   * Retorna null (sem lançar exceção) se nenhum tenant ativo for encontrado para a instância,
   * permitindo que o webhook handler retorne 200 silenciosamente (não quebra o fluxo).
   */
  private async resolveTenantFromInstance(instanceName: string): Promise<string | null> {
    if (!instanceName) {
      return null
    }

    const row = await this.knex('agent_settings')
      .where({ enabled: true, evolution_instance_name: instanceName })
      .select('tenant_id')
      .first()

    return (row?.tenant_id as string | undefined) ?? null
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

    // Instruções sobre booking_mode
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

    // Contexto do paciente (se já cadastrado)
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
   * Usamos ChatCompletionFunctionTool (subset do union) para acessar .function.name com segurança.
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

    // Filtrar tools por booking_mode
    // allTools é ChatCompletionFunctionTool[] — .function.name é seguro aqui
    const linkNames = new Set(['list_slots', 'generate_booking_link', 'cancel_appointment'])
    const chatNames = new Set(['list_slots', 'book_appointment', 'cancel_appointment'])

    if (bookingMode === 'link') {
      return allTools.filter((t) => linkNames.has(t.function.name))
    }

    if (bookingMode === 'chat') {
      return allTools.filter((t) => chatNames.has(t.function.name))
    }

    // 'both': todas as tools disponíveis
    return allTools
  }

  // ---------------------------------------------------------------------------
  // @OnEvent handlers — notificações proativas ao paciente via WhatsApp
  // Todos são fire-and-forget seguro: exceções capturadas e logadas, nunca propagadas
  // ---------------------------------------------------------------------------

  @OnEvent('appointment.created')
  async onAppointmentCreated(payload: {
    tenantId: string
    patientId: string
    phone: string
    dateTime: string
    patientName: string
  }): Promise<void> {
    try {
      const formatted = new Date(payload.dateTime).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
      const message = `Olá ${payload.patientName}! Sua consulta foi agendada para ${formatted}. Aguardamos você!`
      await this.whatsappService.sendText(payload.phone, message)
    } catch (err) {
      this.logger.error(
        'Erro ao enviar confirmação de agendamento via WhatsApp',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  @OnEvent('appointment.cancelled')
  async onAppointmentCancelled(payload: {
    tenantId: string
    appointmentId: string
    patientId: string
    dateTime: string
    reason?: string
  }): Promise<void> {
    try {
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
      await this.whatsappService.sendText(row.phone as string, message)
    } catch (err) {
      this.logger.error(
        'Erro ao enviar aviso de cancelamento via WhatsApp',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  @OnEvent('appointment.status_changed')
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

    try {
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
      await this.whatsappService.sendText(row.phone as string, message)
    } catch (err) {
      this.logger.error(
        'Erro ao enviar notificação de status via WhatsApp',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  @OnEvent('patient.portal_activated')
  async onPortalActivated(payload: {
    tenantId: string
    patientId: string
    phone: string | undefined
    portalAccessCode: string
  }): Promise<void> {
    try {
      if (!payload.phone) {
        this.logger.warn(
          `Paciente sem telefone — não foi possível enviar código do portal via WhatsApp. patientId=${payload.patientId}`,
        )
        return
      }
      const message = `Seu portal de saúde está pronto! Acesse ${env.FRONTEND_URL}/patient e use o código: ${payload.portalAccessCode}`
      await this.whatsappService.sendText(payload.phone, message)
    } catch (err) {
      this.logger.error(
        'Erro ao enviar código de acesso ao portal via WhatsApp',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  // ---------------------------------------------------------------------------
  // executeTool — helper privado do handleMessage
  // ---------------------------------------------------------------------------

  /**
   * Executa uma tool call e retorna a mensagem de resultado no formato OpenAI.
   */
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
      // Erros das tools são retornados como resultado de erro — não devem quebrar o fluxo
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
