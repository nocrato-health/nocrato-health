import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useCreateClinicalNote } from '@/lib/queries/clinical'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Schema ───────────────────────────────────────────────────────────────────

const createClinicalNoteSchema = z.object({
  content: z
    .string()
    .min(10, 'A nota deve ter pelo menos 10 caracteres'),
})

type CreateClinicalNoteForm = z.infer<typeof createClinicalNoteSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointmentId: string
  patientId: string
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CreateClinicalNoteDialog({ open, onOpenChange, appointmentId, patientId }: Props) {
  const createNote = useCreateClinicalNote()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClinicalNoteForm>({
    resolver: zodResolver(createClinicalNoteSchema),
    defaultValues: { content: '' },
  })

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  function onSubmit(data: CreateClinicalNoteForm) {
    createNote.mutate(
      {
        appointmentId,
        patientId,
        content: data.content,
      },
      {
        onSuccess: () => {
          toast.success('Nota criada com sucesso')
          handleClose()
        },
        onError: (err: Error & { data?: { message?: string } }) => {
          const msg = err.data?.message ?? 'Erro ao criar nota clínica.'
          toast.error(msg)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Nota Clínica</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="clinical-note-content">Nota clínica</Label>
            <Textarea
              id="clinical-note-content"
              {...register('content')}
              placeholder="Descreva a evolução do paciente..."
              rows={5}
              className="border-[#e8dfc8] focus-visible:ring-amber-dark/30 resize-none"
            />
            {errors.content && (
              <p className="text-xs text-red-500">{errors.content.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={createNote.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
