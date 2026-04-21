/**
 * AgentController — Meta Cloud API webhook
 *
 * Casos de teste cobertos:
 *  CT-cloud-01: GET /webhook/cloud com verify_token correto → retorna challenge
 *  CT-cloud-02: GET /webhook/cloud com verify_token errado → 401
 *  CT-cloud-03: POST /webhook/cloud com assinatura HMAC válida + mensagem de texto → handleMessageFromCloud chamado
 *  CT-cloud-04: POST /webhook/cloud com assinatura HMAC inválida → 401
 *  CT-cloud-05: POST /webhook/cloud sem assinatura → 401
 *  CT-cloud-06: POST /webhook/cloud com statuses[].status='sent' → handleDoctorMessage chamado com tenantId e phone
 *  CT-cloud-07: POST /webhook/cloud com statuses[].status='delivered' → handleDoctorMessage NÃO chamado
 *  CT-cloud-08: POST /webhook/cloud com statuses múltiplos (sent + delivered) → handleDoctorMessage chamado 1x (só sent)
 */

// ---------------------------------------------------------------------------
// Mocks ANTES de qualquer import
// ---------------------------------------------------------------------------

const APP_SECRET = 'test-app-secret-16chars'
const VERIFY_TOKEN = 'test-verify-token-16ch'
const PHONE_NUMBER_ID = 'phone-number-id-123'
const TENANT_ID = 'tenant-uuid-abc'

jest.mock('@/config/env', () => ({
  env: {
    META_APP_SECRET: APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
    META_GRAPH_API_VERSION: 'v19.0',
    FRONTEND_URL: 'http://localhost:5173',
  },
}))

import { createHmac } from 'node:crypto'
import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { KNEX } from '@/database/knex.provider'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHmacSignature(body: unknown): string {
  const raw = JSON.stringify(body)
  const hash = createHmac('sha256', APP_SECRET).update(raw).digest('hex')
  return `sha256=${hash}`
}

function makeCloudMessagePayload(from: string, text: string, phoneNumberId = PHONE_NUMBER_ID) {
  return {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: phoneNumberId },
          messages: [{ from, text: { body: text }, type: 'text' }],
        },
      }],
    }],
  }
}

function makeCloudStatusPayload(statuses: Array<{ status: string; recipient_id: string }>, phoneNumberId = PHONE_NUMBER_ID) {
  return {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: phoneNumberId },
          statuses,
        },
      }],
    }],
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AgentController — Cloud webhook', () => {
  let controller: AgentController
  let agentService: jest.Mocked<Pick<AgentService, 'handleMessageFromCloud' | 'handleDoctorMessage'>>
  let mockKnex: jest.Mock

  beforeEach(async () => {
    agentService = {
      handleMessageFromCloud: jest.fn().mockResolvedValue(undefined),
      handleDoctorMessage: jest.fn().mockResolvedValue(undefined),
    }

    // Mock knex: agent_settings query para resolver tenant por phone_number_id
    const mockFirst = jest.fn().mockResolvedValue({ tenant_id: TENANT_ID })
    const mockWhere = jest.fn().mockReturnThis()
    const mockSelect = jest.fn().mockReturnThis()
    mockKnex = jest.fn().mockReturnValue({ select: mockSelect, where: mockWhere, first: mockFirst })

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: agentService,
        },
        {
          provide: KNEX,
          useValue: mockKnex,
        },
      ],
    }).compile()

    controller = module.get<AgentController>(AgentController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // CT-cloud-01: GET verificação de webhook — challenge correto
  it('CT-cloud-01: verify_token correto → retorna challenge', () => {
    const result = controller.verifyCloudWebhook('subscribe', VERIFY_TOKEN, 'hub-challenge-abc')
    expect(result).toBe('hub-challenge-abc')
  })

  // CT-cloud-02: GET verificação com token errado → 401
  it('CT-cloud-02: verify_token inválido → lança UnauthorizedException', () => {
    expect(() => controller.verifyCloudWebhook('subscribe', 'token-errado', 'challenge')).toThrow(UnauthorizedException)
  })

  // CT-cloud-03: POST webhook com mensagem de texto válida → handleMessageFromCloud chamado
  it('CT-cloud-03: mensagem de texto com assinatura válida → handleMessageFromCloud chamado', async () => {
    const body = makeCloudMessagePayload('5511999990001', 'Quero agendar')
    const sig = makeHmacSignature(body)

    await controller.handleCloudWebhook(sig, body)

    expect(agentService.handleMessageFromCloud).toHaveBeenCalledWith(TENANT_ID, '5511999990001', 'Quero agendar')
  })

  // CT-cloud-04: POST webhook com assinatura inválida → 401
  it('CT-cloud-04: assinatura HMAC inválida → lança UnauthorizedException', async () => {
    const body = makeCloudMessagePayload('5511999990001', 'Quero agendar')

    await expect(
      controller.handleCloudWebhook('sha256=assinatura-invalida-qualquer', body),
    ).rejects.toThrow(UnauthorizedException)

    expect(agentService.handleMessageFromCloud).not.toHaveBeenCalled()
  })

  // CT-cloud-05: POST webhook sem assinatura → 401
  it('CT-cloud-05: sem header x-hub-signature-256 → lança UnauthorizedException', async () => {
    const body = makeCloudMessagePayload('5511999990001', 'Quero agendar')

    await expect(
      controller.handleCloudWebhook(undefined, body),
    ).rejects.toThrow(UnauthorizedException)
  })

  // CT-cloud-06: statuses[].status='sent' → handleDoctorMessage chamado com tenantId e phone do recipient
  it('CT-cloud-06: statuses.status=sent → handleDoctorMessage chamado com tenantId e recipient_id', async () => {
    const body = makeCloudStatusPayload([{ status: 'sent', recipient_id: '5511999990002' }])
    const sig = makeHmacSignature(body)

    await controller.handleCloudWebhook(sig, body)

    expect(agentService.handleDoctorMessage).toHaveBeenCalledWith(TENANT_ID, '5511999990002')
    expect(agentService.handleMessageFromCloud).not.toHaveBeenCalled()
  })

  // CT-cloud-07: statuses[].status='delivered' → handleDoctorMessage NÃO chamado
  it('CT-cloud-07: statuses.status=delivered → handleDoctorMessage NÃO chamado', async () => {
    const body = makeCloudStatusPayload([{ status: 'delivered', recipient_id: '5511999990003' }])
    const sig = makeHmacSignature(body)

    await controller.handleCloudWebhook(sig, body)

    expect(agentService.handleDoctorMessage).not.toHaveBeenCalled()
  })

  // CT-cloud-08: múltiplos statuses (sent + delivered) → handleDoctorMessage chamado 1x apenas para o sent
  it('CT-cloud-08: statuses com sent + delivered → handleDoctorMessage chamado apenas para sent', async () => {
    const body = makeCloudStatusPayload([
      { status: 'sent', recipient_id: '5511999990004' },
      { status: 'delivered', recipient_id: '5511999990004' },
    ])
    const sig = makeHmacSignature(body)

    await controller.handleCloudWebhook(sig, body)

    expect(agentService.handleDoctorMessage).toHaveBeenCalledTimes(1)
    expect(agentService.handleDoctorMessage).toHaveBeenCalledWith(TENANT_ID, '5511999990004')
  })
})
