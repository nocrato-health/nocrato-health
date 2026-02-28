import { Outlet } from '@tanstack/react-router'
import { AgencySidebar } from '@/components/agency-sidebar'

export function AgencyLayout() {
  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      <AgencySidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
