import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Knex } from 'knex'
import { KNEX } from '../../database/knex.provider'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  @Get()
  @ApiOperation({ summary: 'Verifica disponibilidade da API e conectividade com o banco' })
  @ApiResponse({ status: 200, description: 'API operacional' })
  @ApiResponse({ status: 500, description: 'Banco de dados inacessível' })
  async check() {
    await this.knex.raw('SELECT 1')
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
