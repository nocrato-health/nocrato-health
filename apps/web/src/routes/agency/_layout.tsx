import * as React from 'react'
import { Outlet } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { AgencySidebar } from '@/components/agency-sidebar'
import { ErrorBoundary } from '@/components/error-boundary'

export function AgencyLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  React.useEffect(() => {
    document.title = 'Nocrato — Portal da Agência'
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
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200',
          'md:relative md:translate-x-0 md:transition-none md:flex md:shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <AgencySidebar onClose={closeSidebar} />
      </div>

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
          <span className="font-heading font-bold text-amber-dark text-base">Nocrato</span>
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
