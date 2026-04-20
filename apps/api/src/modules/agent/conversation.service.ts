import { Inject, Injectable } from '@nestjs/common'
import type { Knex } from 'knex'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string // para tool results
  name?: string // para tool results
  timestamp: string // ISO 8601
}

export type ConversationMode = 'agent' | 'human'

export interface Conversation {
  id: string
  tenantId: string
  phone: string
  messages: ConversationMessage[]
  mode: ConversationMode
  lastFrommeAt: Date | null
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

// Máximo de mensagens mantidas no histórico JSONB
const MAX_HISTORY_MESSAGES = 20

// Timeout para auto-revert de 'human' → 'agent' (30 minutos)
const HANDOFF_TIMEOUT_MS = 30 * 60 * 1000

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ConversationService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  /**
   * Busca a conversa existente ou cria uma nova para o par (tenantId, phone).
   * Usa INSERT … ON CONFLICT DO UPDATE para garantir atomicidade.
   */
  async getOrCreate(tenantId: string, phone: string): Promise<Conversation> {
    const [row] = await this.knex.raw<{ rows: ConversationRow[] }>(
      `
      INSERT INTO conversations (tenant_id, phone, messages, last_message_at, created_at, updated_at)
      VALUES (:tenantId, :phone, '[]'::jsonb, now(), now(), now())
      ON CONFLICT (tenant_id, phone)
      DO UPDATE SET updated_at = now()
      RETURNING *
      `,
      { tenantId, phone },
    ).then((result) => result.rows)

    return mapRow(row)
  }

  /**
   * Marca a conversa como 'human' (doutor assumiu) e registra o timestamp.
   * Chamado quando o webhook detecta mensagem enviada pelo doutor.
   *
   * Usa INSERT ... ON CONFLICT pra cobrir o caso onde o doutor escreve
   * PRIMEIRO (sem o paciente ter iniciado conversa) — nesse cenario a row
   * nao existe ainda e um UPDATE puro nao afetaria nada.
   */
  async activateHumanMode(tenantId: string, phone: string): Promise<void> {
    await this.knex.raw(
      `
      INSERT INTO conversations (tenant_id, phone, messages, mode, last_fromme_at, last_message_at, created_at, updated_at)
      VALUES (:tenantId, :phone, '[]'::jsonb, 'human', now(), now(), now(), now())
      ON CONFLICT (tenant_id, phone)
      DO UPDATE SET mode = 'human', last_fromme_at = now(), updated_at = now()
      `,
      { tenantId, phone },
    )
  }

  /**
   * Verifica se o agente deve processar a mensagem.
   * Retorna true se mode='agent' ou se o timeout de 30min expirou (auto-revert).
   */
  async shouldAgentRespond(tenantId: string, phone: string): Promise<boolean> {
    const row = await this.knex('conversations')
      .where({ tenant_id: tenantId, phone })
      .select(['mode', 'last_fromme_at'])
      .first()

    if (!row) return true // conversa nova → agente responde

    if (row.mode === 'agent') return true

    // mode === 'human' — checar timeout
    if (row.last_fromme_at) {
      const elapsed = Date.now() - new Date(row.last_fromme_at as string).getTime()
      if (elapsed > HANDOFF_TIMEOUT_MS) {
        // Auto-revert para 'agent'
        await this.knex('conversations')
          .where({ tenant_id: tenantId, phone })
          .update({ mode: 'agent' })
        return true
      }
    }

    return false // doutor ativo, agente não responde
  }

  /**
   * Seta o modo manualmente (endpoint do doutor).
   */
  async setMode(tenantId: string, phone: string, mode: ConversationMode): Promise<void> {
    await this.knex('conversations')
      .where({ tenant_id: tenantId, phone })
      .update({ mode })
  }

  /**
   * Adiciona novas mensagens ao histórico da conversa.
   * Mantém no máximo MAX_HISTORY_MESSAGES mensagens (as mais recentes).
   */
  async appendMessages(conversationId: string, newMessages: ConversationMessage[]): Promise<void> {
    // Buscar mensagens atuais
    const row = await this.knex('conversations')
      .where({ id: conversationId })
      .select('messages')
      .first()

    if (!row) {
      return
    }

    const current: ConversationMessage[] = (row.messages as ConversationMessage[]) ?? []

    // Concatenar novas mensagens ao final e truncar para o limite
    const merged = [...current, ...newMessages]
    const trimmed = merged.slice(-MAX_HISTORY_MESSAGES)

    await this.knex('conversations').where({ id: conversationId }).update({
      messages: JSON.stringify(trimmed),
      last_message_at: this.knex.fn.now(),
      updated_at: this.knex.fn.now(),
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string
  tenant_id: string
  phone: string
  messages: ConversationMessage[]
  mode: ConversationMode
  last_fromme_at: Date | string | null
  last_message_at: Date | string
  created_at: Date | string
  updated_at: Date | string
}

function mapRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    phone: row.phone,
    messages: row.messages ?? [],
    mode: row.mode ?? 'agent',
    lastFrommeAt: row.last_fromme_at ? new Date(row.last_fromme_at) : null,
    lastMessageAt: new Date(row.last_message_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
