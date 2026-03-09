import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { join } from 'node:path'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { PatientService } from './patient.service'
import { GetPortalAccessSchema, type GetPortalAccessDto } from './dto/get-portal-access.dto'

/**
 * Portal do paciente — rotas públicas autenticadas via código de acesso.
 * Sem JwtAuthGuard / TenantGuard: a autenticação é feita pelo portal_access_code.
 */
@ApiTags('Patient Portal')
@Controller('patient/portal')
export class PatientPortalController {
  constructor(private readonly patientService: PatientService) {}

  /**
   * POST /api/v1/patient/portal/access
   *
   * Autentica o paciente pelo código de acesso e retorna os dados do portal:
   * patient, doctor, tenant, appointments e documents.
   * clinical_notes NUNCA são retornadas.
   */
  @Post('access')
  @ApiOperation({ summary: 'Autenticar paciente pelo código de acesso e retornar dados do portal' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', example: 'ABC-1234-XYZ', description: 'Código de acesso no formato AAA-NNNN-BBB' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Acesso autorizado. Retorna patient, doctor, tenant, appointments e documents (sem clinical_notes)',
  })
  @ApiResponse({ status: 401, description: 'Código de acesso inválido ou portal inativo' })
  access(@Body(new ZodValidationPipe(GetPortalAccessSchema)) dto: GetPortalAccessDto) {
    return this.patientService.getPatientPortalData(dto.code)
  }

  /**
   * GET /api/v1/patient/portal/documents/:id?code=<code>
   *
   * Faz o download de um documento do paciente. Autenticado via query param `code`.
   * O file_url armazenado é relativo ao cwd (ex: /uploads/{tenantId}/{filename}).
   */
  @Get('documents/:id')
  @ApiOperation({ summary: 'Download de documento do paciente autenticado via código de acesso' })
  @ApiParam({ name: 'id', description: 'UUID do documento' })
  @ApiQuery({ name: 'code', required: true, description: 'Código de acesso do paciente' })
  @ApiResponse({ status: 200, description: 'Arquivo enviado via download' })
  @ApiResponse({ status: 401, description: 'Código de acesso inválido ou documento não pertence ao paciente' })
  @ApiResponse({ status: 404, description: 'Documento não encontrado' })
  async downloadDocument(
    @Param('id') id: string,
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    const doc = await this.patientService.getPatientDocument(code, id)
    const filePath = join(process.cwd(), doc.file_url as string)
    res.download(filePath, doc.file_name as string)
  }
}
