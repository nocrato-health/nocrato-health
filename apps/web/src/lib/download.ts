import { useAuthStore } from '@/lib/auth'

/**
 * Faz download autenticado de um documento via JWT.
 * Usa fetch com Authorization header, converte resposta para Blob e
 * dispara download via <a download> programaticamente.
 *
 * Substitui link direto para /uploads/... (SEC-10 fix — LGPD/PHI).
 */
export async function downloadDocument(
  documentId: string,
  fileName: string,
): Promise<void> {
  const token = useAuthStore.getState().accessToken
  if (!token) {
    throw new Error('Usuário não autenticado')
  }

  const res = await fetch(`/api/v1/doctor/documents/${documentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Documento não encontrado')
    }
    throw new Error(`Falha no download (HTTP ${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
