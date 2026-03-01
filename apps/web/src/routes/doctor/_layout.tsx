import { Outlet } from '@tanstack/react-router'

export function DoctorLayout() {
  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      {/* Sidebar placeholder — será implementado em epic futuro */}
      <aside className="w-60 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <span className="font-heading font-bold text-amber-dark text-lg">Nocrato Health</span>
        </div>
        <nav className="flex-1 p-4">
          {/* Navegação do portal do doutor — expandir em epic futuro */}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
