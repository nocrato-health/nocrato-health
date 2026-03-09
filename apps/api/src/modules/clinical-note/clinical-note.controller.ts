import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ClinicalNoteService } from './clinical-note.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@/modules/auth/strategies/jwt.strategy'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { CreateClinicalNoteSchema, CreateClinicalNoteDto } from './dto/create-clinical-note.dto'
import { ListClinicalNotesSchema, ListClinicalNotesDto } from './dto/list-clinical-notes.dto'

@ApiTags('Doctor Clinical Notes')
@ApiBearerAuth()
@Controller('doctor/clinical-notes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class ClinicalNoteController {
  constructor(private readonly clinicalNoteService: ClinicalNoteService) {}

  // US-6.2: Listar notas clínicas por consulta ou por paciente, com paginação
  // IMPORTANTE: @Get() deve estar ANTES de qualquer @Get(':id') para não ser capturado como parâmetro
  @Get()
  @ApiOperation({ summary: 'Listar notas clínicas por consulta ou por paciente com paginação' })
  @ApiQuery({ name: 'appointmentId', required: false, type: String, description: 'UUID da consulta (tem precedência sobre patientId)' })
  @ApiQuery({ name: 'patientId', required: false, type: String, description: 'UUID do paciente' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Lista paginada de notas clínicas' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  listClinicalNotes(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListClinicalNotesSchema)) query: ListClinicalNotesDto,
  ) {
    return this.clinicalNoteService.listClinicalNotes(tenantId, query)
  }

  // US-6.1: Criar nota clínica vinculada a consulta e paciente do tenant autenticado
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Criar nota clínica vinculada a uma consulta e paciente' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['appointmentId', 'patientId', 'content'],
      properties: {
        appointmentId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
        patientId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440001' },
        content: { type: 'string', example: 'Paciente apresentou melhora significativa.' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Nota clínica criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (content vazio, IDs inválidos)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Consulta ou paciente não encontrado no tenant' })
  createClinicalNote(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateClinicalNoteSchema)) dto: CreateClinicalNoteDto,
  ) {
    return this.clinicalNoteService.createClinicalNote(tenantId, user.sub, dto)
  }
}
