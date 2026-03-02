import * as React from 'react'
import { Outlet, Link } from '@tanstack/react-router'
import { LayoutDashboard, Users, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

function NavLink({ to, children }: Readonly<{ to: string; children: React.ReactNode }>) {
  return (
    <Link
      to={to}
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
  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      <aside className="w-60 border-r border-[#e8dfc8] bg-white flex flex-col">
        <div className="p-5 border-b border-[#e8dfc8]">
          <span className="font-heading font-bold text-amber-dark text-lg">Nocrato Health</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/doctor/dashboard">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/doctor/patients">
            <Users className="w-4 h-4" />
            Pacientes
          </NavLink>
          <NavLink to="/doctor/appointments">
            <Calendar className="w-4 h-4" />
            Consultas
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
