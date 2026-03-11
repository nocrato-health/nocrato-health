import * as React from 'react'
import { Outlet, Link } from '@tanstack/react-router'
import { LayoutDashboard, Users, Calendar, Settings, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/error-boundary'

function NavLink({
  to,
  children,
  onClick,
}: Readonly<{ to: string; children: React.ReactNode; onClick?: () => void }>) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-amber-mid transition-colors hover:bg-[#fef9e6] hover:text-amber-dark',
        '[&.active]:border-l-2 [&.active]:border-amber-bright [&.active]:bg-[#fef9e6] [&.active]:text-amber-dark',
      )}
    >
      {children}
    </Link>
  )
}

export function DoctorLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  React.useEffect(() => {
    document.title = 'Nocrato — Portal do Médico'
  }, [])

  function closeSidebar() {
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      {/* Backdrop — mobile only */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-white border-r border-[#e8dfc8] w-60 shrink-0',
          // Desktop: normal flow
          'md:relative md:translate-x-0',
          // Mobile: fixed overlay
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:transition-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="p-5 border-b border-[#e8dfc8] flex items-center justify-between">
          <span className="font-heading font-bold text-amber-dark text-lg">Nocrato Health</span>
          {/* Close button — mobile only */}
          <button
            className="md:hidden p-1 rounded text-amber-mid hover:text-amber-dark hover:bg-[#fef9e6] transition-colors"
            onClick={closeSidebar}
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/doctor/dashboard" onClick={closeSidebar}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/doctor/patients" onClick={closeSidebar}>
            <Users className="w-4 h-4" />
            Pacientes
          </NavLink>
          <NavLink to="/doctor/appointments" onClick={closeSidebar}>
            <Calendar className="w-4 h-4" />
            Consultas
          </NavLink>
          <NavLink to="/doctor/settings" onClick={closeSidebar}>
            <Settings className="w-4 h-4" />
            Configurações
          </NavLink>
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar with hamburger — mobile only */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[#e8dfc8] bg-white shrink-0">
          <button
            className="p-1.5 rounded text-amber-mid hover:text-amber-dark hover:bg-[#fef9e6] transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-heading font-bold text-amber-dark text-base">Nocrato Health</span>
        </div>

        <main className="flex-1 overflow-y-auto p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
