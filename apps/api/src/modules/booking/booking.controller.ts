import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { BookingService } from './booking.service'
import { BookAppointmentSchema, type BookAppointmentDto } from './booking.dto'

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
  async bookAppointment(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(BookAppointmentSchema)) dto: BookAppointmentDto,
  ) {
    return this.bookingService.bookAppointment(slug, dto)
  }
}
