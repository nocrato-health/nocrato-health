import { useAuthStore } from './auth'
import type { RefreshResponse } from '@/types/api'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// Evita múltiplos refreshes simultâneos
let refreshPromise: Promise<RefreshResponse | null> | null = null

async function tryRefresh(): Promise<RefreshResponse | null> {
  const { refreshToken, userType, updateTokens, clearAuth } = useAuthStore.getState()

  if (!refreshToken || !userType) return null

  if (refreshPromise) return refreshPromise

  const endpoint =
    userType === 'agency' ? '/api/v1/agency/auth/refresh' : '/api/v1/doctor/auth/refresh'

  refreshPromise = fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        clearAuth()
        return null
      }
      const data: RefreshResponse = await res.json()
      updateTokens(data)
      return data
    })
    .catch(() => {
      // Erro de rede (não rejeição do token) — não deslogar o usuário
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken } = useAuthStore.getState()

  const { body, headers: extraHeaders, ...restOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }

  const init: RequestInit = {
    ...restOptions,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  let response = await fetch(`${API_BASE}${path}`, init)

  // Auto-refresh em 401
  if (response.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${refreshed.accessToken}`
      response = await fetch(`${API_BASE}${path}`, { ...init, headers })
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
    throw Object.assign(new Error(errorData.message ?? 'Erro na requisição'), {
      status: response.status,
      data: errorData,
    })
  }

  // 204 No Content
  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'GET', ...options }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body, ...options }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body, ...options }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body, ...options }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', ...options }),
}
