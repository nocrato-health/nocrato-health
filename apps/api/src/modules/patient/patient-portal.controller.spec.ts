/**
 * US-10.2 — PatientPortalController spec
 *
 * CT-102-11: POST /patient/portal/access → chama getPatientPortalData e retorna resultado
 * CT-102-12: GET /patient/portal/documents/:id → chama getPatientDocument e invoca res.download
 *
 * Estratégia: testar que os handlers delegam ao PatientService com os argumentos corretos.
 * Sem guards (o controller não usa JwtAuthGuard/TenantGuard — autenticação via portal_access_code).
 */

// Mockar env ANTES de qualquer import que o carregue transitivamente.
// env.ts chama process.exit(1) se vars estiverem ausentes — não pode rodar em testes.
jest.mock('@/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_NAME: 'nocrato_test',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
  },
}))

import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { E2eAwareThrottlerGuard } from '@/common/guards/e2e-throttler.guard'
import { join } from 'path'
import { PatientPortalController } from './patient-portal.controller'
import { PatientService } from './patient.service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CODE = 'MRS-5678-PAC'
const DOC_ID = 'doc-uuid-1'

const makePortalData = () => ({
  patient: {
    id: 'patient-uuid-1',
    name: 'Maria Oliveira',
    phone: '11988880001',
    email: 'maria.oliveira@example.com',
    date_of_birth: '1985-03-20',
    portal_active: true,
    status: 'active',
  },
  doctor: {
    name: 'Dr. João Silva',
    specialty: 'Clínica Geral',
    timezone: 'America/Sao_Paulo',
  },
  tenant: {
    name: 'Clínica Dr. Silva',
    slug: 'dr-silva',
    primary_color: '#1D4ED8',
    logo_url: null,
    status: 'active',
  },
  appointments: [],
  documents: [],
})

const makeDocumentRow = () => ({
  id: DOC_ID,
  type: 'prescription',
  file_url: '/uploads/tenant-uuid/receita.pdf',
  file_name: 'receita_2024.pdf',
  description: 'Receita médica',
  created_at: new Date('2024-03-10T15:20:00Z'),
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PatientPortalController', () => {
  let controller: PatientPortalController
  let service: jest.Mocked<Partial<PatientService>>

  beforeEach(async () => {
    jest.clearAllMocks()

    service = {
      getPatientPortalData: jest.fn(),
      getPatientDocument: jest.fn(),
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PatientPortalController],
      providers: [{ provide: PatientService, useValue: service }],
    })
      .overrideGuard(E2eAwareThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile()

    controller = moduleRef.get<PatientPortalController>(PatientPortalController)
  })

  // -------------------------------------------------------------------------
  // CT-102-11: POST /patient/portal/access
  // -------------------------------------------------------------------------

  describe('CT-102-11: POST /patient/portal/access', () => {
    it('should call getPatientPortalData with the code from body', async () => {
      const expected = makePortalData()
      ;(service.getPatientPortalData as jest.Mock).mockResolvedValue(expected)

      const result = await controller.access({ code: CODE })

      expect(service.getPatientPortalData).toHaveBeenCalledWith(CODE)
      expect(result).toBe(expected)
    })

    it('should return the service result directly', async () => {
      const expected = makePortalData()
      ;(service.getPatientPortalData as jest.Mock).mockResolvedValue(expected)

      const result = await controller.access({ code: CODE })

      expect(result).toEqual(expected)
    })

    it('should propagate NotFoundException when code is invalid', async () => {
      ;(service.getPatientPortalData as jest.Mock).mockRejectedValue(
        new NotFoundException('Código de acesso inválido'),
      )

      await expect(controller.access({ code: 'XXX-0000-ZZZ' })).rejects.toThrow(NotFoundException)
    })

    it('should propagate ForbiddenException when portal is inactive', async () => {
      ;(service.getPatientPortalData as jest.Mock).mockRejectedValue(
        new ForbiddenException('Portal inativo'),
      )

      await expect(controller.access({ code: CODE })).rejects.toThrow(ForbiddenException)
    })

    it('should propagate ForbiddenException when patient is inactive', async () => {
      ;(service.getPatientPortalData as jest.Mock).mockRejectedValue(
        new ForbiddenException('Paciente inativo'),
      )

      await expect(controller.access({ code: CODE })).rejects.toThrow('Paciente inativo')
    })

    it('should propagate ForbiddenException when tenant is inactive', async () => {
      ;(service.getPatientPortalData as jest.Mock).mockRejectedValue(
        new ForbiddenException('Clínica inativa'),
      )

      await expect(controller.access({ code: CODE })).rejects.toThrow('Clínica inativa')
    })
  })

  // -------------------------------------------------------------------------
  // CT-102-12: GET /patient/portal/documents/:id
  // -------------------------------------------------------------------------

  describe('CT-102-12: GET /patient/portal/documents/:id', () => {
    it('should call getPatientDocument with code and documentId', async () => {
      const doc = makeDocumentRow()
      ;(service.getPatientDocument as jest.Mock).mockResolvedValue(doc)

      const mockRes = { download: jest.fn() }
      await controller.downloadDocument(DOC_ID, CODE, mockRes as unknown as import('express').Response)

      expect(service.getPatientDocument).toHaveBeenCalledWith(CODE, DOC_ID)
    })

    it('should call res.download with the correct file path and file name', async () => {
      const doc = makeDocumentRow()
      ;(service.getPatientDocument as jest.Mock).mockResolvedValue(doc)

      const mockRes = { download: jest.fn() }
      await controller.downloadDocument(DOC_ID, CODE, mockRes as unknown as import('express').Response)

      const expectedPath = join(process.cwd(), doc.file_url)
      expect(mockRes.download).toHaveBeenCalledWith(expectedPath, doc.file_name)
    })

    it('should propagate NotFoundException when document not found', async () => {
      ;(service.getPatientDocument as jest.Mock).mockRejectedValue(
        new NotFoundException('Documento não encontrado'),
      )

      const mockRes = { download: jest.fn() }
      await expect(
        controller.downloadDocument(DOC_ID, CODE, mockRes as unknown as import('express').Response),
      ).rejects.toThrow(NotFoundException)
    })

    it('should propagate NotFoundException when code is invalid', async () => {
      ;(service.getPatientDocument as jest.Mock).mockRejectedValue(
        new NotFoundException('Código de acesso inválido'),
      )

      const mockRes = { download: jest.fn() }
      await expect(
        controller.downloadDocument(DOC_ID, 'INVALID-CODE', mockRes as unknown as import('express').Response),
      ).rejects.toThrow('Código de acesso inválido')
    })

    it('should NOT call res.download when service throws', async () => {
      ;(service.getPatientDocument as jest.Mock).mockRejectedValue(
        new NotFoundException('Documento não encontrado'),
      )

      const mockRes = { download: jest.fn() }
      await expect(
        controller.downloadDocument(DOC_ID, CODE, mockRes as unknown as import('express').Response),
      ).rejects.toThrow()

      expect(mockRes.download).not.toHaveBeenCalled()
    })
  })
})
