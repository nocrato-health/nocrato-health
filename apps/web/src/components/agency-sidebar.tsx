import { Link, useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface NavLinkProps {
  readonly to: string
  readonly children: React.ReactNode
  readonly onClick?: () => void
  readonly exact?: boolean
}

function NavLink({ to, children, onClick, exact }: NavLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      activeOptions={exact ? { exact: true } : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white',
      )}
      activeProps={{
        className: 'border-l-2 border-amber-bright bg-white/15 text-white rounded-l-none',
      }}
    >
      {children}
    </Link>
  )
}

interface AgencySidebarProps {
  readonly onClose?: () => void
}

export function AgencySidebar({ onClose }: AgencySidebarProps) {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  function handleLogout() {
    clearAuth()
    void navigate({ to: '/agency/login', replace: true })
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-amber-dark">
      <div className="px-6 py-5 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold tracking-tight text-white font-heading">Nocrato</span>
          <p className="text-xs text-white/60 mt-0.5">Portal da Agência</p>
        </div>
        {/* Close button — only rendered on mobile when onClose is provided */}
        {onClose && (
          <button
            className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        <NavLink to="/agency" onClick={onClose} exact>Dashboard</NavLink>
        <NavLink to="/agency/doctors" onClick={onClose} exact>Doutores</NavLink>
        <NavLink to="/agency/members" onClick={onClose} exact>Colaboradores</NavLink>
      </nav>

      <div className="px-3 py-4 border-t border-white/20">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white text-left"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
