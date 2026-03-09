import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { PatientService } from './patient.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { ListPatientsQuerySchema, ListPatientsQueryDto } from './dto/list-patients.dto'
import { createPatientSchema, CreatePatientDto } from './dto/create-patient.dto'
import { UpdatePatientSchema, UpdatePatientDto } from './dto/update-patient.dto'

@ApiTags('Doctor Patients')
@ApiBearerAuth()
@Controller('doctor/patients')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  // US-4.1: Listagem paginada de pacientes do doutor autenticado
  @Get()
  @ApiOperation({ summary: 'Listar pacientes do tenant com busca e paginação' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Busca por nome ou telefone (ILIKE)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'], description: 'Filtrar por status' })
  @ApiResponse({ status: 200, description: 'Lista paginada de pacientes' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  listPatients(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListPatientsQuerySchema)) query: ListPatientsQueryDto,
  ) {
    return this.patientService.listPatients(tenantId, query)
  }

  // US-4.2: Perfil completo do paciente com appointments, notas clínicas e documentos
  @Get(':id')
  @ApiOperation({ summary: 'Perfil completo do paciente com histórico de consultas, notas clínicas e documentos' })
  @ApiParam({ name: 'id', description: 'UUID do paciente' })
  @ApiResponse({ status: 200, description: 'Perfil completo do paciente (sem cpf e portal_access_code)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado' })
  getPatientProfile(
    @TenantId() tenantId: string,
    @Param('id', new ZodValidationPipe(z.string().uuid())) patientId: string,
  ) {
    return this.patientService.getPatientProfile(tenantId, patientId)
  }

  // US-4.3: Criar paciente manualmente pelo doutor autenticado
  @Post()
  @ApiOperation({ summary: 'Criar paciente manualmente (source=manual, status=active)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'phone'],
      properties: {
        name: { type: 'string', example: 'Maria da Silva' },
        phone: { type: 'string', example: '11999990000', description: '10 ou 11 dígitos sem formatação' },
        cpf: { type: 'string', example: '12345678901' },
        email: { type: 'string', format: 'email', example: 'maria@email.com' },
        dateOfBirth: { type: 'string', format: 'date', example: '1985-05-20' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Paciente criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 409, description: 'Telefone já cadastrado para outro paciente no mesmo tenant' })
  createPatient(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(createPatientSchema)) dto: CreatePatientDto,
  ) {
    return this.patientService.createPatient(tenantId, dto)
  }

  // US-4.4: Edição parcial de paciente pelo doutor autenticado
  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar parcialmente dados de um paciente' })
  @ApiParam({ name: 'id', description: 'UUID do paciente' })
  @ApiBody({
    schema: {
      type: 'object',
      description: 'Ao menos um campo deve ser informado',
      properties: {
        name: { type: 'string', example: 'Maria da Silva Santos' },
        phone: { type: 'string', example: '11988880000' },
        cpf: { type: 'string', example: '12345678901' },
        email: { type: 'string', format: 'email' },
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Paciente atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou body vazio' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado' })
  @ApiResponse({ status: 409, description: 'Telefone já cadastrado para outro paciente' })
  updatePatient(
    @TenantId() tenantId: string,
    @Param('id', new ZodValidationPipe(z.string().uuid())) patientId: string,
    @Body(new ZodValidationPipe(UpdatePatientSchema)) dto: UpdatePatientDto,
  ) {
    return this.patientService.updatePatient(tenantId, patientId, dto)
  }
}
