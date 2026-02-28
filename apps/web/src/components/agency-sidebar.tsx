import { Link, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface NavLinkProps {
  to: string
  children: React.ReactNode
}

function NavLink({ to, children }: NavLinkProps) {
  return (
    <Link
      to={to}
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

export function AgencySidebar() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  function handleLogout() {
    clearAuth()
    void navigate({ to: '/agency/login', replace: true })
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-amber-dark">
      <div className="px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-white font-heading">Nocrato</span>
        <p className="text-xs text-white/60 mt-0.5">Portal da Agência</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        <NavLink to="/agency">Dashboard</NavLink>
        <NavLink to="/agency/doctors">Doutores</NavLink>
        <NavLink to="/agency/members">Colaboradores</NavLink>
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
