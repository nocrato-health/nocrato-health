import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AppointmentService } from './appointment.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@/modules/auth/strategies/jwt.strategy'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { ListAppointmentsQuerySchema, ListAppointmentsDto } from './dto/list-appointments.dto'
import { CreateAppointmentSchema, CreateAppointmentDto } from './dto/create-appointment.dto'
import { UpdateAppointmentStatusSchema, UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto'

@ApiTags('Doctor Appointments')
@ApiBearerAuth()
@Controller('doctor/appointments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  // US-5.1: Listagem paginada de consultas do doutor autenticado com filtros opcionais
  @Get()
  @ApiOperation({ summary: 'Listar consultas do tenant com filtros e paginação' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['scheduled', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'] })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Data no formato YYYY-MM-DD' })
  @ApiQuery({ name: 'patientId', required: false, type: String, description: 'UUID do paciente para filtrar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de consultas' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  listAppointments(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListAppointmentsQuerySchema)) query: ListAppointmentsDto,
  ) {
    return this.appointmentService.listAppointments(tenantId, query)
  }

  // US-5.2: Criar consulta manualmente pelo doutor autenticado
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Criar consulta manualmente (status=scheduled, created_by=doctor)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['patientId', 'dateTime'],
      properties: {
        patientId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
        dateTime: { type: 'string', format: 'date-time', example: '2026-03-15T10:00:00.000Z' },
        durationMinutes: { type: 'number', example: 30, description: 'Se omitido usa appointment_duration do doutor (fallback 30)' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Consulta criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado' })
  @ApiResponse({ status: 409, description: 'Conflito de horário: paciente já possui consulta no mesmo período' })
  createAppointment(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
  ) {
    return this.appointmentService.createAppointment(tenantId, dto)
  }

  // US-5.5: Dashboard do doutor — consultas de hoje, total de pacientes ativos e follow-ups pendentes
  // IMPORTANTE: @Get('dashboard') deve estar ANTES de @Get(':id') para não ser capturado como parâmetro
  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard do doutor: consultas de hoje, total de pacientes ativos e follow-ups pendentes' })
  @ApiResponse({
    status: 200,
    description: 'Dados do dashboard',
    schema: {
      type: 'object',
      properties: {
        todayAppointments: { type: 'array', items: { type: 'object' } },
        totalPatients: { type: 'number' },
        pendingFollowUps: { type: 'number', description: 'Consultas concluídas sem nota clínica' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  getDoctorDashboard(@TenantId() tenantId: string) {
    return this.appointmentService.getDoctorDashboard(tenantId)
  }

  // US-5.4: Detalhe completo de uma consulta (dados + paciente + notas clínicas)
  // IMPORTANTE: @Get(':id') deve estar ANTES de @Patch(':id/status') para evitar conflito de rota
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe completo de uma consulta com dados do paciente e notas clínicas' })
  @ApiParam({ name: 'id', description: 'UUID da consulta' })
  @ApiResponse({ status: 200, description: 'Consulta com patient e clinicalNotes' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Consulta não encontrada' })
  getAppointmentDetail(
    @TenantId() tenantId: string,
    @Param('id') appointmentId: string,
  ) {
    return this.appointmentService.getAppointmentDetail(tenantId, appointmentId)
  }

  // US-5.3: Alterar status de consulta seguindo a máquina de estados
  @Patch(':id/status')
  @ApiOperation({ summary: 'Alterar status de consulta seguindo a máquina de estados (scheduled → waiting → in_progress → completed)' })
  @ApiParam({ name: 'id', description: 'UUID da consulta' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['waiting', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'],
        },
        cancellationReason: { type: 'string', description: 'Obrigatório quando status=cancelled' },
        newDateTime: { type: 'string', format: 'date-time', description: 'Obrigatório quando status=rescheduled' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Status atualizado. Para rescheduled retorna { original, rescheduledTo }' })
  @ApiResponse({ status: 400, description: 'Transição de status inválida ou dados faltando' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Consulta não encontrada' })
  updateAppointmentStatus(
    @TenantId() tenantId: string,
    @Param('id') appointmentId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateAppointmentStatusSchema)) dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentService.updateAppointmentStatus(tenantId, appointmentId, dto, user.sub)
  }
}
