import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common'
import { ZodSchema } from 'zod'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      throw new BadRequestException({
        message: 'Dados inválidos',
        errors,
      })
    }
    return result.data
  }
}
