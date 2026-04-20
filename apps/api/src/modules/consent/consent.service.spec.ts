jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '7d',
    FRONTEND_URL: 'http://localhost:5173',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'test@nocrato.com',
    DOCUMENT_ENCRYPTION_KEY: 'a'.repeat(64),
  },
}))

import { Test } from '@nestjs/testing'
import { ConsentService } from './consent.service'
import { KNEX } from '@/database/knex.provider'

describe('ConsentService', () => {
  let service: ConsentService
  let mockInsert: jest.Mock
  let mockWhere: jest.Mock
  let mockSelect: jest.Mock
  let mockCount: jest.Mock
  let mockFirst: jest.Mock
  let mockOrderBy: jest.Mock
  let mockKnex: jest.Mock

  beforeEach(async () => {
    mockInsert = jest.fn().mockResolvedValue([1])
    mockFirst = jest.fn()
    mockOrderBy = jest.fn().mockReturnThis()
    mockCount = jest.fn().mockReturnThis()
    mockSelect = jest.fn().mockReturnThis()
    mockWhere = jest.fn().mockReturnThis()

    mockKnex = jest.fn().mockReturnValue({
      insert: mockInsert,
      where: mockWhere,
      select: mockSelect,
      count: mockCount,
      first: mockFirst,
      orderBy: mockOrderBy,
    })

    const module = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: KNEX, useValue: mockKnex },
      ],
    }).compile()

    service = module.get(ConsentService)
  })

  describe('registerConsent', () => {
    it('insere registro de consentimento com todos os campos', async () => {
      await service.registerConsent({
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consentType: 'privacy_policy',
        consentVersion: '1.0',
        source: 'booking',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })

      expect(mockKnex).toHaveBeenCalledWith('patient_consents')
      expect(mockInsert).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        consent_type: 'privacy_policy',
        consent_version: '1.0',
        source: 'booking',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      })
    })

    it('usa defaults para campos opcionais (ipAddress=null, userAgent=null, version=1.0)', async () => {
      await service.registerConsent({
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consentType: 'data_processing',
        source: 'whatsapp_agent',
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          consent_version: '1.0',
          ip_address: null,
          user_agent: null,
          source: 'whatsapp_agent',
        }),
      )
    })
  })

  describe('hasConsent', () => {
    it('retorna true quando existe consentimento', async () => {
      mockFirst.mockResolvedValue({ count: '1' })

      const result = await service.hasConsent('tenant-1', 'patient-1', 'privacy_policy')

      expect(mockKnex).toHaveBeenCalledWith('patient_consents')
      expect(mockWhere).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        consent_type: 'privacy_policy',
        consent_version: '1.0',
      })
      expect(result).toBe(true)
    })

    it('retorna false quando não existe consentimento', async () => {
      mockFirst.mockResolvedValue({ count: '0' })

      const result = await service.hasConsent('tenant-1', 'patient-1', 'privacy_policy')

      expect(result).toBe(false)
    })

    it('aceita versão customizada', async () => {
      mockFirst.mockResolvedValue({ count: '1' })

      await service.hasConsent('tenant-1', 'patient-1', 'privacy_policy', '2.0')

      expect(mockWhere).toHaveBeenCalledWith(
        expect.objectContaining({ consent_version: '2.0' }),
      )
    })
  })

  describe('listConsents', () => {
    it('retorna consentimentos ordenados por accepted_at desc', async () => {
      const mockConsents = [
        { id: 'c2', consent_type: 'privacy_policy', consent_version: '1.0', accepted_at: '2026-04-20', source: 'booking' },
        { id: 'c1', consent_type: 'data_processing', consent_version: '1.0', accepted_at: '2026-04-19', source: 'whatsapp_agent' },
      ]
      mockOrderBy.mockResolvedValue(mockConsents)

      const result = await service.listConsents('tenant-1', 'patient-1')

      expect(mockKnex).toHaveBeenCalledWith('patient_consents')
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1', patient_id: 'patient-1' })
      expect(mockSelect).toHaveBeenCalledWith(['id', 'consent_type', 'consent_version', 'accepted_at', 'source'])
      expect(mockOrderBy).toHaveBeenCalledWith('accepted_at', 'desc')
      expect(result).toEqual(mockConsents)
    })
  })
})
