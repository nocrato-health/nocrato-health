/**
 * WhatsAppService.sendViaCloud — Meta Cloud API
 *
 * Casos de teste cobertos:
 *  WS-01: sendViaCloud faz POST com headers corretos e corpo correto
 *  WS-02: Meta Cloud API retorna 2xx → resolve sem erro
 *  WS-03: Meta Cloud API retorna 4xx → lança Error com HTTP status
 *  WS-04: Meta Cloud API retorna 5xx → lança Error com HTTP status
 *  WS-05: META_SYSTEM_USER_TOKEN ausente → lança InternalServerErrorException
 *  WS-06: telefone mascarado no log de erro (LGPD)
 */

jest.mock('@/config/env', () => ({
  env: {
    META_SYSTEM_USER_TOKEN: 'test-system-user-token',
    META_GRAPH_API_VERSION: 'v19.0',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { InternalServerErrorException } from '@nestjs/common'
import { WhatsAppService } from './whatsapp.service'

describe('WhatsAppService', () => {
  let service: WhatsAppService
  let mockFetch: jest.Mock

  beforeEach(async () => {
    mockFetch = jest.fn()
    global.fetch = mockFetch

    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppService],
    }).compile()

    service = module.get<WhatsAppService>(WhatsAppService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // WS-01 + WS-02: happy path — POST correto com headers e corpo certos
  it('WS-01/02: faz POST para graph.facebook.com com headers e body corretos → resolve sem erro', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    })

    await expect(
      service.sendViaCloud('phone-number-id-123', '5511999999999', 'Olá, sua consulta foi confirmada!'),
    ).resolves.toBeUndefined()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/phone-number-id-123/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-system-user-token',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '5511999999999',
          type: 'text',
          text: { body: 'Olá, sua consulta foi confirmada!' },
        }),
      },
    )
  })

  // WS-03: Cloud API retorna 4xx → lança Error
  it('WS-03: Meta Cloud API retorna 400 → lança Error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('Bad Request'),
    })

    await expect(
      service.sendViaCloud('phone-number-id-123', '5511999999999', 'Mensagem teste'),
    ).rejects.toThrow('Meta Cloud API retornou HTTP 400')
  })

  // WS-04: Cloud API retorna 5xx → lança Error
  it('WS-04: Meta Cloud API retorna 503 → lança Error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('Service Unavailable'),
    })

    await expect(
      service.sendViaCloud('phone-number-id-456', '5511988888888', 'Outra mensagem'),
    ).rejects.toThrow('Meta Cloud API retornou HTTP 503')
  })

  // WS-05: META_SYSTEM_USER_TOKEN ausente → lança InternalServerErrorException
  it('WS-05: META_SYSTEM_USER_TOKEN ausente → lança InternalServerErrorException', async () => {
    const envModule = jest.requireMock('@/config/env') as { env: { META_SYSTEM_USER_TOKEN?: string } }
    const originalToken = envModule.env.META_SYSTEM_USER_TOKEN
    envModule.env.META_SYSTEM_USER_TOKEN = undefined

    await expect(
      service.sendViaCloud('phone-number-id-123', '5511999999999', 'Mensagem'),
    ).rejects.toThrow(InternalServerErrorException)

    envModule.env.META_SYSTEM_USER_TOKEN = originalToken
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // WS-06: telefone mascarado no log de erro (LGPD)
  it('WS-06: erro HTTP → telefone mascarado no log (mostra apenas últimos 4 dígitos)', async () => {
    const loggerErrorSpy = jest.spyOn(service['logger'], 'error')

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    })

    await expect(
      service.sendViaCloud('phone-number-id-123', '5511999887766', 'Mensagem teste'),
    ).rejects.toThrow('Meta Cloud API retornou HTTP 500')

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('****7766'),
    )
    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('5511999887766'),
    )
  })
})
