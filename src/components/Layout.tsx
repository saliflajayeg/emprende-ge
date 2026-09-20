import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useSettings } from '../lib/hooks'
import BackupReminder from './BackupReminder'
import { navModules, modulesFor, type ModuleId } from '../modules'

interface NavEntry {
  to: string
  label: string
  icon: string
  end?: boolean
}

function NavItems({ items, onClick }: { items: NavEntry[]; onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          <span className="text-base">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const enabled = (settings?.enabledModules as ModuleId[] | undefined) ?? modulesFor(settings?.businessType)
  const NAV: NavEntry[] = navModules(enabled).map((m) => ({
    to: m.path,
    label: m.id === 'records' ? settings?.recordsLabel || m.label : m.label,
    icon: m.icon,
    end: m.path === '/',
  }))

  return (
    <div className="flex min-h-screen">
      {/* Sidebar escritorio */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-2 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-600 text-lg font-bold text-white">
            E
          </span>
          <div>
            <div className="font-bold leading-tight text-slate-800">EmprendeGE</div>
            <div className="text-xs text-slate-400">
              {settings?.businessName || 'Tu negocio'}
            </div>
          </div>
        </button>
        <NavItems items={NAV} />
        <div className="mt-auto pt-4 text-xs text-slate-400">
          Datos guardados en este dispositivo · Funciona sin internet
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior móvil */}
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-600 font-bold text-white">
              E
            </span>
            <span className="font-bold text-slate-800">EmprendeGE</span>
          </div>
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Menú">
            ☰
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <BackupReminder />
          {children}
        </main>
      </div>

      {/* Menú móvil */}
      {open && (
        <div className="no-print fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute left-0 top-0 h-full w-64 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <span className="font-bold text-slate-800">Menú</span>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400">✕</button>
            </div>
            <NavItems items={NAV} onClick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
