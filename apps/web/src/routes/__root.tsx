import { Outlet } from '@tanstack/react-router'
import { ToastContainer } from '@/components/toast-container'
import { ErrorBoundary } from '@/components/error-boundary'

export function RootLayout() {
  return (
    <>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <ToastContainer />
    </>
  )
}
