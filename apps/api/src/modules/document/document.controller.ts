import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Request } from 'express'
import { DocumentService } from './document.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { TenantGuard } from '@/common/guards/tenant.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { TenantId } from '@/common/decorators/tenant.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@/modules/auth/strategies/jwt.strategy'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { CreateDocumentSchema, CreateDocumentDto } from './dto/create-document.dto'

@Controller('doctor')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  // US-6.3: Upload de arquivo para disco local — multipart/form-data, campo "file"
  @Post('upload')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: Request, _file, cb) => {
          // TenantGuard já garantiu que tenantId está presente antes deste callback
          const tenantId = (req.user as JwtPayload).tenantId!
          const uploadDir = join(process.cwd(), 'uploads', tenantId)
          mkdirSync(uploadDir, { recursive: true })
          cb(null, uploadDir)
        },
        filename: (_req, file, cb) => {
          // basename() previne path traversal via originalname com "../"
          cb(null, basename(file.originalname))
        },
      }),
    }),
  )
  uploadFile(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado')
    }
    // file.filename é o nome salvo em disco (pós-sanitização do callback)
    return {
      fileUrl: `/uploads/${tenantId}/${file.filename}`,
      fileName: file.originalname,
    }
  }

  // US-6.3: Registrar documento no banco após upload
  @Post('documents')
  @HttpCode(201)
  createDocument(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateDocumentSchema)) dto: CreateDocumentDto,
  ) {
    return this.documentService.createDocument(tenantId, user.sub, dto)
  }
}
