import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { BookingService } from './booking.service'
import { BookAppointmentSchema, type BookAppointmentDto } from './booking.dto'

@ApiTags('Public Booking')
@Controller('public/booking/:slug')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  /**
   * GET /api/v1/public/booking/:slug/validate?token=<token>
   *
   * Valida um token de booking e retorna dados do doctor/tenant para a página pública.
   * Rota pública — sem JwtAuthGuard / TenantGuard.
   */
  @Get('validate')
  @ApiOperation({ summary: 'Validar token de booking e retornar dados do doutor/tenant para a página pública' })
  @ApiParam({ name: 'slug', description: 'Slug do portal do doutor', example: 'dr-joao-silva' })
  @ApiQuery({ name: 'token', required: true, description: 'Token de booking gerado pelo agente (64 chars hex)' })
  @ApiResponse({ status: 200, description: 'Token válido. Retorna dados do doutor e tenant para renderizar a página' })
  @ApiResponse({ status: 400, description: 'Token ausente, expirado ou já utilizado' })
  @ApiResponse({ status: 404, description: 'Slug ou token não encontrado' })
  async validate(
    @Param('slug') slug: string,
    @Query('token') token: string,
  ) {
    if (!token) {
      throw new BadRequestException('O parâmetro token é obrigatório')
    }

    return this.bookingService.validateToken(slug, token)
  }

  /**
   * GET /api/v1/public/booking/:slug/slots?token=<token>&date=YYYY-MM-DD
   *
   * Retorna os slots disponíveis para a data solicitada.
   * Rota pública — sem JwtAuthGuard / TenantGuard.
   */
  @Get('slots')
  @ApiOperation({ summary: 'Listar slots disponíveis para agendamento em uma data específica' })
  @ApiParam({ name: 'slug', description: 'Slug do portal do doutor', example: 'dr-joao-silva' })
  @ApiQuery({ name: 'token', required: true, description: 'Token de booking válido' })
  @ApiQuery({ name: 'date', required: true, description: 'Data no formato YYYY-MM-DD', example: '2026-03-15' })
  @ApiResponse({
    status: 200,
    description: 'Lista de slots disponíveis no dia',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'string', example: '09:00' },
          end: { type: 'string', example: '09:30' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Token ou date ausentes / token inválido' })
  @ApiResponse({ status: 404, description: 'Slug não encontrado' })
  async slots(
    @Param('slug') slug: string,
    @Query('token') token: string,
    @Query('date') date: string,
  ) {
    if (!token) {
      throw new BadRequestException('O parâmetro token é obrigatório')
    }

    if (!date) {
      throw new BadRequestException('O parâmetro date é obrigatório')
    }

    return this.bookingService.getSlots(slug, token, date)
  }

  /**
   * POST /api/v1/public/booking/:slug/book
   *
   * Cria uma consulta a partir de um token válido.
   * Rota pública — sem JwtAuthGuard / TenantGuard.
   */
  @Post('book')
  @ApiOperation({ summary: 'Agendar consulta usando token de booking (marca token como usado atomicamente)' })
  @ApiParam({ name: 'slug', description: 'Slug do portal do doutor', example: 'dr-joao-silva' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'dateTime', 'patientPhone', 'patientName'],
      properties: {
        token: { type: 'string', description: 'Token de booking válido (será marcado como used=true)' },
        dateTime: { type: 'string', format: 'date-time', example: '2026-03-15T09:00:00.000Z' },
        patientPhone: { type: 'string', example: '11999990000' },
        patientName: { type: 'string', example: 'Maria da Silva' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Consulta criada. Retorna dados do appointment criado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos, token expirado/já utilizado, ou limite de consultas atingido' })
  @ApiResponse({ status: 404, description: 'Slug ou token não encontrado' })
  @ApiResponse({ status: 409, description: 'Conflito de horário' })
  async bookAppointment(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(BookAppointmentSchema)) dto: BookAppointmentDto,
  ) {
    return this.bookingService.bookAppointment(slug, dto)
  }
}
