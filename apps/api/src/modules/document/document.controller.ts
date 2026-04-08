import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { diskStorage } from 'multer'
import { mkdirSync } from 'node:fs'
import { extname, isAbsolute, join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
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
import { ListDocumentsSchema, ListDocumentsDto } from './dto/list-documents.dto'

@ApiTags('Doctor Documents')
@ApiBearerAuth()
@Controller('doctor')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('doctor')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  // US-6.3: Upload de arquivo para disco local — multipart/form-data, campo "file"
  @Post('upload')
  @HttpCode(201)
  @ApiOperation({ summary: 'Upload de arquivo para disco local (campo "file", multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Arquivo a enviar' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Arquivo enviado. Retorna fileUrl e fileName para usar em POST /documents',
    schema: {
      type: 'object',
      properties: {
        fileUrl: { type: 'string', example: '/uploads/{tenantId}/arquivo.pdf' },
        fileName: { type: 'string', example: 'arquivo.pdf' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Arquivo não enviado' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
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
          // UUID previne colisão e sobrescrita de documentos (SEC-03)
          cb(null, `${randomUUID()}${extname(file.originalname)}`)
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (SEC-15)
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png']
        if (allowed.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException('Tipo de arquivo não permitido. Aceitos: PDF, JPEG, PNG'), false)
        }
      },
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

  // US-6.4: Listagem paginada de documentos de um paciente — patientId obrigatório via query
  @Get('documents')
  @ApiOperation({ summary: 'Listar documentos de um paciente com filtro por tipo e paginação' })
  @ApiQuery({ name: 'patientId', required: true, type: String, description: 'UUID do paciente (obrigatório)' })
  @ApiQuery({ name: 'type', required: false, enum: ['prescription', 'certificate', 'exam', 'other'] })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Lista paginada de documentos' })
  @ApiResponse({ status: 400, description: 'patientId inválido ou ausente' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  listDocuments(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListDocumentsSchema)) query: ListDocumentsDto,
  ) {
    return this.documentService.listDocuments(tenantId, query)
  }

  // SEC-10: Download autenticado de documento via JWT — path traversal guard obrigatório
  @Get('documents/:id')
  @ApiOperation({ summary: 'Download de documento autenticado via JWT' })
  @ApiParam({ name: 'id', description: 'UUID do documento' })
  @ApiResponse({ status: 200, description: 'Arquivo enviado via download' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Documento não encontrado' })
  async downloadDocument(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentService.getDocumentForDownload(tenantId, id)
    const uploadsRoot = join(process.cwd(), 'uploads')
    const filePath = join(process.cwd(), doc.file_url)
    // Path traversal guard portatil: rejeita qualquer caminho fora de uploadsRoot
    const rel = relative(uploadsRoot, filePath)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new ForbiddenException('Acesso negado')
    }
    res.download(filePath, doc.file_name)
  }

  // US-6.3: Registrar documento no banco após upload
  @Post('documents')
  @HttpCode(201)
  @ApiOperation({ summary: 'Registrar documento no banco após upload (usar fileUrl retornado pelo POST /upload)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['patientId', 'type', 'fileUrl', 'fileName'],
      properties: {
        patientId: { type: 'string', format: 'uuid' },
        appointmentId: { type: 'string', format: 'uuid', description: 'Opcional — vincular a uma consulta' },
        type: { type: 'string', enum: ['prescription', 'certificate', 'exam', 'other'] },
        fileUrl: { type: 'string', example: '/uploads/{tenantId}/arquivo.pdf' },
        fileName: { type: 'string', example: 'arquivo.pdf' },
        description: { type: 'string', example: 'Receita de anti-hipertensivo' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Documento registrado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado no tenant' })
  createDocument(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateDocumentSchema)) dto: CreateDocumentDto,
  ) {
    return this.documentService.createDocument(tenantId, user.sub, dto)
  }
}
