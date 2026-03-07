import { Injectable } from '@nestjs/common'

export interface EvolutionWebhookPayload {
  event: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
    }
    message?: {
      conversation?: string
    }
    pushName?: string
  }
}

@Injectable()
export class AgentService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleMessage(_payload: EvolutionWebhookPayload): Promise<void> {
    // TODO: implementar em US-9.3
    // - Resolver tenantId pela instância Evolution
    // - Buscar ou criar paciente via PatientService
    // - Buscar ou criar conversa via ConversationService
    // - Chamar OpenAI SDK (gpt-4o-mini) com tools
    // - Executar tool_calls: list_slots, book_appointment, generate_booking_link, cancel_appointment
    // - Atualizar histórico da conversa
    // - Enviar resposta via WhatsAppService.sendText()
  }
}
