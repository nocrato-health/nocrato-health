import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AgencyService } from './agency.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { ListDoctorsQuerySchema, ListDoctorsQueryDto } from './dto/list-doctors.dto'
import { UpdateDoctorStatusSchema, UpdateDoctorStatusDto } from './dto/update-doctor-status.dto'
import { ListMembersQuerySchema, ListMembersQueryDto } from './dto/list-members.dto'
import { UpdateMemberStatusSchema, UpdateMemberStatusDto } from './dto/update-member-status.dto'

@ApiTags('Agency')
@ApiBearerAuth()
@Controller('agency')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('agency_admin', 'agency_member')
export class AgencyController {
  constructor(private readonly agencyService: AgencyService) {}

  // US-2.1: Dashboard da agência — estatísticas globais
  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard da agência — estatísticas globais de doutores, pacientes e consultas' })
  @ApiResponse({ status: 200, description: 'Estatísticas agregadas da plataforma' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  getDashboardStats() {
    return this.agencyService.getDashboardStats()
  }

  // US-2.2: Listagem paginada de doutores
  @Get('doctors')
  @ApiOperation({ summary: 'Listagem paginada de doutores com filtro por status' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'pending'], description: 'Filtrar por status' })
  @ApiResponse({ status: 200, description: 'Lista paginada de doutores' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  listDoctors(@Query(new ZodValidationPipe(ListDoctorsQuerySchema)) query: ListDoctorsQueryDto) {
    return this.agencyService.listDoctors(query.page, query.limit, query.status)
  }

  // US-2.3: Atualização de status de um doutor
  @Patch('doctors/:id/status')
  @Roles('agency_admin')
  @ApiOperation({ summary: 'Atualizar status de um doutor (agency_admin only)' })
  @ApiParam({ name: 'id', description: 'UUID do doutor' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Status atualizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Doutor não encontrado' })
  updateDoctorStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDoctorStatusSchema)) body: UpdateDoctorStatusDto,
  ) {
    return this.agencyService.updateDoctorStatus(id, body.status)
  }

  // US-2.4: Listagem paginada de membros da agência — agency_admin e agency_member podem listar
  @Get('members')
  @ApiOperation({ summary: 'Listagem paginada de membros da agência' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'], description: 'Filtrar por status' })
  @ApiResponse({ status: 200, description: 'Lista paginada de membros da agência' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  listMembers(@Query(new ZodValidationPipe(ListMembersQuerySchema)) query: ListMembersQueryDto) {
    return this.agencyService.listMembers(query.page, query.limit, query.status)
  }

  // US-2.4: Atualização de status de um membro — apenas agency_admin
  @Patch('members/:id/status')
  @Roles('agency_admin')
  @ApiOperation({ summary: 'Atualizar status de um membro da agência (agency_admin only)' })
  @ApiParam({ name: 'id', description: 'UUID do membro' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'], example: 'inactive' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Status atualizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Membro não encontrado' })
  updateMemberStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMemberStatusSchema)) body: UpdateMemberStatusDto,
  ) {
    return this.agencyService.updateMemberStatus(id, body.status)
  }
}
