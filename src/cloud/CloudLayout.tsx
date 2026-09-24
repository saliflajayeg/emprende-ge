import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { navModules, modulesFor, type ModuleId } from '../modules'
import { useAuth } from './auth'
import { useBusiness } from './business'
import { getSyncStatus, onSync, type SyncStatus } from './sync'

function SyncBadge() {
  const [s, setS] = useState<SyncStatus>(getSyncStatus())
  useEffect(() => onSync(setS), [])
  const map: Record<SyncStatus, { t: string; c: string }> = {
    idle: { t: '✓ Sincronizado', c: 'text-teal-600' },
    syncing: { t: '↻ Sincronizando…', c: 'text-sky-600' },
    offline: { t: '⚠ Sin conexión', c: 'text-amber-600' },
    error: { t: '⚠ Error de sync', c: 'text-red-600' },
  }
  return <span className={`text-xs ${map[s].c}`}>{map[s].t}</span>
}

interface NavEntry { to: string; label: string; icon: string; end?: boolean }

function NavItems({ items, onClick }: { items: NavEntry[]; onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
          <span className="text-base">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function CloudLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { current, businesses, setCurrent, role, isAdmin } = useBusiness()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const isEmployee = role === 'employee'
  const enabled = (current?.enabledModules as ModuleId[] | undefined) ?? modulesFor(current?.businessType)
  const NAV: NavEntry[] = navModules(enabled)
    // El empleado no ve Informes ni Ajustes
    .filter((m) => !(isEmployee && (m.id === 'reports' || m.id === 'settings')))
    .map((m) => ({
      to: m.path,
      label: m.id === 'records' ? current?.recordsLabel || m.label : m.label,
      icon: m.icon,
      end: m.path === '/',
    }))
  if (isAdmin) NAV.push({ to: '/admin', label: 'Admin', icon: '🛡️' })

  // Cabecera: logo del negocio si lo tiene; si no, la marca GEmprende
  const brandLogo = current?.logo || '/logo-mark.png'
  const brandName = current?.logo ? current?.name || 'Mi negocio' : 'GEmprende'
  const logoFit = current?.logo ? 'object-contain bg-white' : 'object-cover'

  const Switcher = () => (
    <select
      value={current?.id}
      onChange={(e) => setCurrent(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-500"
    >
      {businesses.map((b) => <option key={b.id} value={b.id}>{b.name || 'Sin nombre'}</option>)}
    </select>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <button onClick={() => navigate('/')} className="mb-4 flex items-center gap-2 text-left">
          <img src={brandLogo} alt={brandName} className={`h-9 w-9 shrink-0 rounded-lg ${logoFit}`} />
          <div className="min-w-0 truncate font-bold leading-tight text-slate-800">{brandName}</div>
        </button>
        <div className="mb-3"><Switcher /></div>
        <NavItems items={NAV} />
        <div className="mt-auto space-y-1 pt-4">
          <SyncBadge />
          <button onClick={signOut} className="block text-xs text-slate-400 hover:text-slate-700">Cerrar sesión</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <img src={brandLogo} alt={brandName} className={`h-8 w-8 shrink-0 rounded-lg ${logoFit}`} />
            <span className="min-w-0 truncate font-bold text-slate-800">{brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Menú">☰</button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>

        <footer className="border-t border-slate-200 bg-white px-4 py-6">
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2">
              <img src="/logo-mark.png" alt="GEmprende" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-bold text-slate-700">GEmprende</span>
            </div>
            <p className="text-xs text-slate-500">Impulsando a los emprendedores de Guinea Ecuatorial 🇬🇶</p>
            <a
              href="https://emprendege.mercadosemu.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-teal-600 hover:underline"
            >
              emprendege.mercadosemu.com
            </a>
          </div>
        </footer>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold text-slate-800">Menú</span>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400">✕</button>
            </div>
            <div className="mb-3"><Switcher /></div>
            <NavItems items={NAV} onClick={() => setOpen(false)} />
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button onClick={signOut} className="text-sm text-slate-500">Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
