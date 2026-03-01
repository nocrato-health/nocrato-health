import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgencyMember, Doctor, UserType } from '@/types/api'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AgencyMember | Doctor | null
  userType: UserType | null
  tenantId: string | null
  onboardingCompleted: boolean

  setAuth: (data: {
    accessToken: string
    refreshToken: string
    user: AgencyMember | Doctor
    userType: UserType
    tenantId?: string
    onboardingCompleted?: boolean
  }) => void
  clearAuth: () => void
  updateTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  setOnboardingCompleted: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      userType: null,
      tenantId: null,
      onboardingCompleted: false,

      setAuth: ({ accessToken, refreshToken, user, userType, tenantId, onboardingCompleted }) =>
        set({
          accessToken,
          refreshToken,
          user,
          userType,
          tenantId: tenantId ?? null,
          onboardingCompleted: onboardingCompleted ?? false,
        }),

      clearAuth: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          userType: null,
          tenantId: null,
          onboardingCompleted: false,
        }),

      updateTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),

      setOnboardingCompleted: (value: boolean) => set({ onboardingCompleted: value }),
    }),
    { name: 'nocrato-auth' },
  ),
)
