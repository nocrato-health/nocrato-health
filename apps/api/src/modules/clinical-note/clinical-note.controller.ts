import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
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

@Controller('doctor/clinical-notes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class ClinicalNoteController {
  constructor(private readonly clinicalNoteService: ClinicalNoteService) {}

  // US-6.2: Listar notas clínicas por consulta ou por paciente, com paginação
  // IMPORTANTE: @Get() deve estar ANTES de qualquer @Get(':id') para não ser capturado como parâmetro
  @Get()
  listClinicalNotes(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListClinicalNotesSchema)) query: ListClinicalNotesDto,
  ) {
    return this.clinicalNoteService.listClinicalNotes(tenantId, query)
  }

  // US-6.1: Criar nota clínica vinculada a consulta e paciente do tenant autenticado
  @Post()
  @HttpCode(201)
  createClinicalNote(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateClinicalNoteSchema)) dto: CreateClinicalNoteDto,
  ) {
    return this.clinicalNoteService.createClinicalNote(tenantId, user.sub, dto)
  }
}
