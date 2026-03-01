import React from 'react'
import ReactDOM from 'react-dom/client'
import { createRouter, createRoute, createRootRoute, RouterProvider, redirect } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { useAuthStore } from './lib/auth'
import { RootLayout } from './routes/__root'
import { AgencyLoginPage } from './routes/agency/login'
import { AgencyResetPasswordPage } from './routes/agency/reset-password'
import { AgencyLayout } from './routes/agency/_layout'
import { AgencyDashboardPage } from './routes/agency/_layout/index'
import { AgencyDoctorsPage } from './routes/agency/_layout/doctors/index'
import { AgencyMembersPage } from './routes/agency/_layout/members/index'
import { DoctorLoginPage } from './routes/doctor/login'
import { DoctorInvitePage } from './routes/doctor/invite'
import { DoctorResetPasswordPage } from './routes/doctor/reset-password'
import { DoctorLayout } from './routes/doctor/_layout'
import { DoctorOnboardingPage } from './routes/doctor/onboarding'
import { DoctorDashboardPage } from './routes/doctor/dashboard'
import './app.css'

// ─── Rotas públicas ──────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/agency/login' }) },
})

const agencyLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agency/login',
  component: AgencyLoginPage,
})

const agencyResetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agency/reset-password',
  component: AgencyResetPasswordPage,
})

const doctorLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doctor/login',
  component: DoctorLoginPage,
})

const doctorInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doctor/invite',
  component: DoctorInvitePage,
})

const doctorResetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doctor/reset-password',
  component: DoctorResetPasswordPage,
})

// ─── Layout route agência (pathless, com guard) ──────────────────────────────

const agencyLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'agency-layout',
  beforeLoad: () => {
    const { accessToken, userType } = useAuthStore.getState()
    if (!accessToken || userType !== 'agency') {
      throw redirect({ to: '/agency/login', replace: true })
    }
  },
  component: AgencyLayout,
})

const agencyDashboardRoute = createRoute({
  getParentRoute: () => agencyLayoutRoute,
  path: '/agency',
  component: AgencyDashboardPage,
})

// Redireciona /agency/dashboard (URL antiga usada pelo login.tsx) para /agency
const agencyDashboardLegacyRoute = createRoute({
  getParentRoute: () => agencyLayoutRoute,
  path: '/agency/dashboard',
  beforeLoad: () => { throw redirect({ to: '/agency', replace: true }) },
})

const agencyDoctorsRoute = createRoute({
  getParentRoute: () => agencyLayoutRoute,
  path: '/agency/doctors',
  component: AgencyDoctorsPage,
})

const agencyMembersRoute = createRoute({
  getParentRoute: () => agencyLayoutRoute,
  path: '/agency/members',
  component: AgencyMembersPage,
})

// ─── Rota de onboarding do doutor (FORA do layout protegido — sem sidebar) ───
// O doutor chega aqui antes de completar o onboarding, então não deve ter sidebar.

const doctorOnboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doctor/onboarding',
  beforeLoad: () => {
    const { accessToken, userType, onboardingCompleted } = useAuthStore.getState()
    if (!accessToken || userType !== 'doctor') {
      throw redirect({ to: '/doctor/login', replace: true })
    }
    if (onboardingCompleted) {
      throw redirect({ to: '/doctor/dashboard', replace: true })
    }
  },
  component: DoctorOnboardingPage,
})

// ─── Layout route do portal do doutor (pathless, com guard) ──────────────────

const doctorLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'doctor-layout',
  beforeLoad: () => {
    const { accessToken, userType, onboardingCompleted } = useAuthStore.getState()
    if (!accessToken || userType !== 'doctor') {
      throw redirect({ to: '/doctor/login', replace: true })
    }
    if (!onboardingCompleted) {
      throw redirect({ to: '/doctor/onboarding', replace: true })
    }
  },
  component: DoctorLayout,
})

const doctorDashboardRoute = createRoute({
  getParentRoute: () => doctorLayoutRoute,
  path: '/doctor/dashboard',
  component: DoctorDashboardPage,
})

// ─── Router ──────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  agencyLoginRoute,
  agencyResetPasswordRoute,
  agencyLayoutRoute.addChildren([
    agencyDashboardRoute,
    agencyDashboardLegacyRoute,
    agencyDoctorsRoute,
    agencyMembersRoute,
  ]),
  doctorLoginRoute,
  doctorInviteRoute,
  doctorResetPasswordRoute,
  doctorOnboardingRoute,
  doctorLayoutRoute.addChildren([
    doctorDashboardRoute,
  ]),
])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
