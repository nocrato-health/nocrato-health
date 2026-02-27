import React from 'react'
import ReactDOM from 'react-dom/client'
import { createRouter, createRoute, createRootRoute, RouterProvider, redirect } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { RootLayout } from './routes/__root'
import { AgencyLoginPage } from './routes/agency/login'
import { AgencyResetPasswordPage } from './routes/agency/reset-password'
import { DoctorLoginPage } from './routes/doctor/login'
import { DoctorInvitePage } from './routes/doctor/invite'
import { DoctorResetPasswordPage } from './routes/doctor/reset-password'
import './app.css'

// ─── Rotas ──────────────────────────────────────────────────────────────────

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

// Placeholder routes — serão implementados nos Epics 2 e 3
const agencyDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agency/dashboard',
  component: () => null,
})

const doctorDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doctor/dashboard',
  component: () => null,
})

// ─── Router ─────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  agencyLoginRoute,
  agencyResetPasswordRoute,
  doctorLoginRoute,
  doctorInviteRoute,
  doctorResetPasswordRoute,
  agencyDashboardRoute,
  doctorDashboardRoute,
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
