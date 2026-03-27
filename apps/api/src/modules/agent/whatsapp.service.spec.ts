/**
 * US-9.2 — WhatsAppService.sendText
 * TD-20 — sendText recebe instanceName como 3º argumento
 *
 * Casos de teste cobertos:
 *  WS-01: sendText faz POST com headers corretos e corpo correto
 *  WS-02: Evolution API retorna 2xx → resolve sem erro
 *  WS-03: Evolution API retorna 4xx → lança Error com HTTP status
 *  WS-04: Evolution API retorna 5xx → lança Error com HTTP status
 *  SEC-TD20-01: sendText rejeita instanceName com caracteres inválidos (path traversal)
 *  SEC-TD20-03: telefone mascarado no log de erro (LGPD)
 */

jest.mock('@/config/env', () => ({
  env: {
    EVOLUTION_API_URL: 'http://evolution.test',
    EVOLUTION_API_KEY: 'api-key-secreta',
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
      service.sendText('5511999999999', 'Olá, sua consulta foi confirmada!', 'dr-marcos-instance'),
    ).resolves.toBeUndefined()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://evolution.test/message/sendText/dr-marcos-instance',
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
      service.sendText('5511999999999', 'Mensagem teste', 'dr-marcos-instance'),
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
      service.sendText('5511988888888', 'Outra mensagem', 'dr-carlos-instance'),
    ).rejects.toThrow('Evolution API retornou HTTP 503')
  })

  // SEC-TD20-01: instanceName inválido → lança Error (previne path injection)
  it('SEC-TD20-01: instanceName com caracteres inválidos → lança Error', async () => {
    await expect(
      service.sendText('5511999999999', 'Mensagem', '../../../etc/passwd'),
    ).rejects.toThrow('Nome de instância inválido')

    await expect(
      service.sendText('5511999999999', 'Mensagem', 'instance@malicious'),
    ).rejects.toThrow('Nome de instância inválido')

    await expect(
      service.sendText('5511999999999', 'Mensagem', 'instance name with spaces'),
    ).rejects.toThrow('Nome de instância inválido')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  // SEC-TD20-03: telefone mascarado no log de erro (LGPD)
  it('SEC-TD20-03: erro HTTP → telefone mascarado no log (mostra apenas últimos 4 dígitos)', async () => {
    const loggerErrorSpy = jest.spyOn(service['logger'], 'error')

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    })

    await expect(
      service.sendText('5511999887766', 'Mensagem teste', 'dr-instance'),
    ).rejects.toThrow('Evolution API retornou HTTP 500')

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('****7766'),
    )
    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('5511999887766'),
    )
  })
})
