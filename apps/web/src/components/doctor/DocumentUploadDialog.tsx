import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useUploadFile, useCreateDocument } from '@/lib/queries/clinical'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Schema ───────────────────────────────────────────────────────────────────

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'prescription', label: 'Receita' },
  { value: 'certificate', label: 'Atestado' },
  { value: 'exam', label: 'Exame' },
  { value: 'other', label: 'Outro' },
] as const

const documentUploadSchema = z.object({
  type: z.enum(['prescription', 'certificate', 'exam', 'other'], {
    required_error: 'Selecione o tipo de documento',
  }),
  description: z.string().optional(),
  file: z
    .instanceof(File, { message: 'Selecione um arquivo' })
    .refine((f) => f.size > 0, 'Selecione um arquivo'),
})

type DocumentUploadForm = z.infer<typeof documentUploadSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  appointmentId?: string
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function DocumentUploadDialog({ open, onOpenChange, patientId, appointmentId }: Props) {
  const uploadFile = useUploadFile()
  const createDocument = useCreateDocument()

  const isPending = uploadFile.isPending || createDocument.isPending

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DocumentUploadForm>({
    resolver: zodResolver(documentUploadSchema),
  })

  function handleClose() {
    reset()
    // Limpa o valor visual do input file (reset() do RHF não afeta o DOM nativo)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onOpenChange(false)
  }

  async function onSubmit(data: DocumentUploadForm) {
    try {
      // Passo 1: fazer upload do arquivo e obter URL
      const { fileUrl, fileName } = await uploadFile.mutateAsync(data.file)

      // Passo 2: registrar o documento com a URL obtida
      await createDocument.mutateAsync({
        patientId,
        ...(appointmentId ? { appointmentId } : {}),
        type: data.type,
        fileUrl,
        fileName,
        ...(data.description?.trim() ? { description: data.description.trim() } : {}),
      })

      toast.success('Documento enviado com sucesso')
      handleClose()
    } catch (err) {
      const error = err as Error & { data?: { message?: string } }
      const msg = error.data?.message ?? error.message ?? 'Erro ao enviar documento.'
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload de Documento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-type">Tipo de documento *</Label>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(val) => field.onChange(val)}
                >
                  <SelectTrigger id="doc-type">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.type && (
              <p className="text-xs text-red-500">{errors.type.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-description">Descrição (opcional)</Label>
            <Textarea
              id="doc-description"
              {...register('description')}
              placeholder="Adicione uma descrição para o documento..."
              rows={3}
              className="border-[#e8dfc8] focus-visible:ring-amber-dark/30 resize-none"
            />
          </div>

          {/* Arquivo */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">Arquivo *</Label>
            <input
              id="doc-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="block w-full text-sm text-amber-dark file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-amber-bright/20 file:text-amber-dark hover:file:bg-amber-bright/30 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setValue('file', file, { shouldValidate: true })
                }
              }}
            />
            {errors.file && (
              <p className="text-xs text-red-500">{errors.file.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={isPending}>
              Enviar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
