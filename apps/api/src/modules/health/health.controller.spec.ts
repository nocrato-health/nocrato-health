/**
 * TD-07 — Testes unitários do HealthController
 *
 * Casos cobertos:
 *  - Happy path: retorna { status: 'ok', timestamp } e chama knex.raw('SELECT 1')
 *  - Propagação de erro: exceção do banco é relançada sem swallow
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
// env.ts chama process.exit(1) se vars estiverem ausentes — não pode rodar em testes.
jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-16-chars',
    DATABASE_URL: 'postgres://test',
    RESEND_API_KEY: 'test',
    FRONTEND_URL: 'http://localhost:5173',
    OPENAI_API_KEY: 'test',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { HealthController } from './health.controller'
import { KNEX } from '@/database/knex.provider'

describe('HealthController', () => {
  let controller: HealthController
  let mockKnex: { raw: jest.Mock }

  beforeEach(async () => {
    mockKnex = { raw: jest.fn().mockResolvedValue(undefined) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: KNEX, useValue: mockKnex }],
    }).compile()

    controller = moduleRef.get<HealthController>(HealthController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('check', () => {
    it('should return ok status and call knex.raw', async () => {
      const result = await controller.check()
      expect(mockKnex.raw).toHaveBeenCalledWith('SELECT 1')
      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      })
    })

    it('should return a valid ISO 8601 timestamp', async () => {
      const result = await controller.check()
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
    })

    it('should propagate database errors', async () => {
      mockKnex.raw.mockRejectedValue(new Error('connection refused'))
      await expect(controller.check()).rejects.toThrow('connection refused')
    })
  })
})
