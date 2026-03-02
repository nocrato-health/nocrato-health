import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
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

@Controller('doctor/appointments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  // US-5.1: Listagem paginada de consultas do doutor autenticado com filtros opcionais
  @Get()
  listAppointments(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListAppointmentsQuerySchema)) query: ListAppointmentsDto,
  ) {
    return this.appointmentService.listAppointments(tenantId, query)
  }

  // US-5.2: Criar consulta manualmente pelo doutor autenticado
  @Post()
  @HttpCode(201)
  createAppointment(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
  ) {
    return this.appointmentService.createAppointment(tenantId, dto)
  }

  // US-5.4: Detalhe completo de uma consulta (dados + paciente + notas clínicas)
  // IMPORTANTE: @Get(':id') deve estar ANTES de @Patch(':id/status') para evitar conflito de rota
  @Get(':id')
  getAppointmentDetail(
    @TenantId() tenantId: string,
    @Param('id') appointmentId: string,
  ) {
    return this.appointmentService.getAppointmentDetail(tenantId, appointmentId)
  }

  // US-5.3: Alterar status de consulta seguindo a máquina de estados
  @Patch(':id/status')
  updateAppointmentStatus(
    @TenantId() tenantId: string,
    @Param('id') appointmentId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateAppointmentStatusSchema)) dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentService.updateAppointmentStatus(tenantId, appointmentId, dto, user.sub)
  }
}
