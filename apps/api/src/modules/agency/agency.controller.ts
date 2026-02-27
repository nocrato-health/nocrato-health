import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AgencyService } from './agency.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { ListDoctorsQuerySchema, ListDoctorsQueryDto } from './dto/list-doctors.dto'

@Controller('api/v1/agency')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('agency_admin', 'agency_member')
export class AgencyController {
  constructor(private readonly agencyService: AgencyService) {}

  // US-2.1: Dashboard da agência — estatísticas globais
  @Get('dashboard')
  getDashboardStats() {
    return this.agencyService.getDashboardStats()
  }

  // US-2.2: Listagem paginada de doutores
  @Get('doctors')
  listDoctors(@Query(new ZodValidationPipe(ListDoctorsQuerySchema)) query: ListDoctorsQueryDto) {
    return this.agencyService.listDoctors(query.page, query.limit, query.status)
  }
}
