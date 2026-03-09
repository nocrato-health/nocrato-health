/**
 * US-9.2 — Receber mensagens do WhatsApp via webhook
 * TD-20 — Validação do campo instance no payload
 *
 * Casos de teste cobertos:
 *  CT-92-01: webhook válido (apikey correta, messages.upsert, fromMe=false) → HTTP 200, handleMessage chamado
 *  CT-92-02: apikey inválida → HTTP 401 UnauthorizedException
 *  CT-92-03: fromMe=true → HTTP 200, handleMessage NÃO chamado (anti-loop)
 *  CT-92-04: sem header apikey → HTTP 401 UnauthorizedException
 *  CT-92-05: evento diferente de messages.upsert → HTTP 200, handleMessage não chamado
 *  CT-92-06: payload sem campo instance → HTTP 200, handleMessage não chamado
 *  CT-TD21-03: handleMessage lança exceção inesperada → controller captura e retorna 200 (não propaga)
 */

jest.mock('@/config/env', () => ({
  env: {
    EVOLUTION_WEBHOOK_TOKEN: 'test-token-secreto',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'

describe('AgentController', () => {
  let controller: AgentController
  let agentService: { handleMessage: jest.Mock }

  beforeEach(async () => {
    agentService = {
      handleMessage: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: agentService,
        },
      ],
    }).compile()

    controller = module.get<AgentController>(AgentController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  const validBody = {
    event: 'messages.upsert',
    instance: 'dr-marcos-instance',
    data: {
      key: {
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'Quero agendar uma consulta',
      },
      pushName: 'Joao Santos',
    },
  }

  // CT-92-01 — webhook válido dispara processamento
  it('CT-92-01: apikey correta + messages.upsert + fromMe=false → chama handleMessage', async () => {
    await controller.handleWebhook('test-token-secreto', validBody)

    expect(agentService.handleMessage).toHaveBeenCalledTimes(1)
    expect(agentService.handleMessage).toHaveBeenCalledWith(validBody)
  })

  // CT-92-02 — apikey inválida → 401
  it('CT-92-02: apikey inválida → lança UnauthorizedException', async () => {
    await expect(
      controller.handleWebhook('token-errado', validBody),
    ).rejects.toThrow(UnauthorizedException)

    expect(agentService.handleMessage).not.toHaveBeenCalled()
  })

  // CT-92-03 — fromMe=true → ignorado silenciosamente
  it('CT-92-03: fromMe=true → retorna sem chamar handleMessage', async () => {
    const fromMeBody = {
      ...validBody,
      data: {
        ...validBody.data,
        key: {
          ...validBody.data.key,
          fromMe: true,
        },
      },
    }

    await controller.handleWebhook('test-token-secreto', fromMeBody)

    expect(agentService.handleMessage).not.toHaveBeenCalled()
  })

  // CT-92-04 — sem header apikey → 401
  it('CT-92-04: sem header apikey → lança UnauthorizedException', async () => {
    await expect(
      controller.handleWebhook(undefined, validBody),
    ).rejects.toThrow(UnauthorizedException)

    expect(agentService.handleMessage).not.toHaveBeenCalled()
  })

  // CT-92-05 — evento diferente de messages.upsert → ignorado
  it('CT-92-05: event=connection.update → retorna sem chamar handleMessage', async () => {
    const connectionUpdateBody = {
      event: 'connection.update',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
        },
      },
    }

    await controller.handleWebhook('test-token-secreto', connectionUpdateBody)

    expect(agentService.handleMessage).not.toHaveBeenCalled()
  })

  // CT-92-06 — payload sem campo instance → ignorado silenciosamente
  it('CT-92-06: payload sem campo instance → retorna sem chamar handleMessage', async () => {
    const bodyWithoutInstance = {
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
        },
        message: {
          conversation: 'Quero agendar',
        },
      },
    }

    await controller.handleWebhook('test-token-secreto', bodyWithoutInstance)

    expect(agentService.handleMessage).not.toHaveBeenCalled()
  })

  // Edge case: body sem estrutura válida → ignorado silenciosamente
  it('body sem campos obrigatórios → retorna sem chamar handleMessage', async () => {
    await controller.handleWebhook('test-token-secreto', null)

    expect(agentService.handleMessage).not.toHaveBeenCalled()
  })

  // CT-TD21-03: handleMessage lança exceção inesperada → controller não propaga (webhook retorna 200)
  it('CT-TD21-03: handleMessage rejeita com exceção inesperada → controller captura e retorna sem relançar', async () => {
    agentService.handleMessage.mockRejectedValueOnce(new Error('Erro inesperado no service'))

    await expect(
      controller.handleWebhook('test-token-secreto', validBody),
    ).resolves.toBeUndefined()

    expect(agentService.handleMessage).toHaveBeenCalledTimes(1)
  })
})
