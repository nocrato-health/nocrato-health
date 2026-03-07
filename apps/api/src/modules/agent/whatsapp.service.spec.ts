/**
 * US-9.2 — WhatsAppService.sendText
 *
 * Casos de teste cobertos:
 *  WS-01: sendText faz POST com headers corretos e corpo correto
 *  WS-02: Evolution API retorna 2xx → resolve sem erro
 *  WS-03: Evolution API retorna 4xx → lança Error com HTTP status
 *  WS-04: Evolution API retorna 5xx → lança Error com HTTP status
 */

jest.mock('@/config/env', () => ({
  env: {
    EVOLUTION_API_URL: 'http://evolution.test',
    EVOLUTION_API_KEY: 'api-key-secreta',
    EVOLUTION_INSTANCE: 'instancia-teste',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
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

  // WS-01 + WS-02: happy path — POST correto, headers corretos
  it('WS-01/02: faz POST com headers e body corretos → resolve sem erro', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    })

    await expect(
      service.sendText('5511999999999', 'Olá, sua consulta foi confirmada!'),
    ).resolves.toBeUndefined()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://evolution.test/message/sendText/instancia-teste',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: 'api-key-secreta',
        },
        body: JSON.stringify({
          number: '5511999999999',
          text: 'Olá, sua consulta foi confirmada!',
        }),
      },
    )
  })

  // WS-03: Evolution retorna 4xx → lança Error
  it('WS-03: Evolution API retorna 400 → lança Error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('Bad Request'),
    })

    await expect(
      service.sendText('5511999999999', 'Mensagem teste'),
    ).rejects.toThrow('Evolution API retornou HTTP 400')
  })

  // WS-04: Evolution retorna 5xx → lança Error
  it('WS-04: Evolution API retorna 503 → lança Error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('Service Unavailable'),
    })

    await expect(
      service.sendText('5511988888888', 'Outra mensagem'),
    ).rejects.toThrow('Evolution API retornou HTTP 503')
  })
})
