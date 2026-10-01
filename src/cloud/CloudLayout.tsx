import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { navModules, modulesFor, type ModuleId } from '../modules'
import { useAuth } from './auth'
import { useBusiness } from './business'
import { getSyncStatus, onSync, syncBusiness, type SyncStatus } from './sync'
import CreateBusiness from './CreateBusiness'
import PullToRefresh from '../components/PullToRefresh'

const MAX_BUSINESSES = 5

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
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,transform] duration-100 ease-out active:scale-[0.98] ${
              isActive ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
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
  const [closing, setClosing] = useState(false)
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const atMax = businesses.length >= MAX_BUSINESSES

  // Cierra el menú animando la salida (se desliza fuera antes de desmontarse).
  const closeMenu = () => {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 240)
  }

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

  // Barra inferior (móvil): hasta 4 accesos directos + "Más" (como Facebook).
  // "Más" abre el cajón con el resto de secciones, cambiar de negocio y cerrar sesión.
  const bottomNav = NAV.slice(0, 4)

  // Cabecera: logo del negocio si lo tiene; si no, la marca GEmprende
  const brandLogo = current?.logo || '/logo-mark.png'
  const brandName = current?.logo ? current?.name || 'Mi negocio' : 'GEmprende'
  const logoFit = current?.logo ? 'object-contain bg-white' : 'object-cover'

  const Switcher = ({ onAdd }: { onAdd: () => void }) => (
    <div className="space-y-1.5">
      <select
        value={current?.id}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-500"
      >
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name || 'Sin nombre'}</option>)}
      </select>
      <button
        onClick={onAdd}
        disabled={atMax}
        title={atMax ? `Máximo ${MAX_BUSINESSES} negocios` : 'Añadir otro negocio'}
        className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:border-teal-400 hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {atMax ? `Máximo ${MAX_BUSINESSES} negocios` : '➕ Añadir negocio'}
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <button onClick={() => navigate('/')} className="mb-4 flex items-center gap-2 text-left">
          <img src={brandLogo} alt={brandName} className={`h-9 w-9 shrink-0 rounded-lg ${logoFit}`} />
          <div className="min-w-0 truncate font-bold leading-tight text-slate-800">{brandName}</div>
        </button>
        <div className="mb-3"><Switcher onAdd={() => setAdding(true)} /></div>
        <NavItems items={NAV} />
        <div className="mt-auto space-y-1 pt-4">
          <SyncBadge />
          <button onClick={signOut} className="block text-xs text-slate-400 hover:text-slate-700">Cerrar sesión</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden pb-16 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200/70 bg-white/80 px-3 py-3 backdrop-blur-md md:hidden">
          <img src={brandLogo} alt={brandName} className={`h-8 w-8 shrink-0 rounded-lg ${logoFit}`} />
          <span className="min-w-0 flex-1 truncate font-bold text-slate-800">{brandName}</span>
          <SyncBadge />
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <PullToRefresh onRefresh={async () => { if (current?.id) await syncBusiness(current.id) }}>
            {children}
          </PullToRefresh>
        </main>

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

      {/* Barra de navegación inferior (solo móvil), estilo Facebook */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {bottomNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-transform duration-100 ease-out active:scale-90 ${
                isActive ? 'text-teal-600' : 'text-slate-400'
              }`
            }
          >
            <span className="text-lg leading-none">{n.icon}</span>
            <span className="max-w-full truncate px-1">{n.label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-400 transition-transform duration-100 ease-out active:scale-90"
        >
          <span className="text-lg leading-none">☰</span>
          <span>Más</span>
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm ${closing ? 'ge-scrim-out' : 'ge-scrim'}`}
            onClick={closeMenu}
          />
          <div className={`absolute left-0 top-0 h-full w-72 max-w-[82%] overflow-y-auto bg-white p-4 shadow-2xl ring-1 ring-black/5 ${closing ? 'ge-drawer-out' : 'ge-drawer'}`}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold text-slate-800">Menú</span>
              <button onClick={closeMenu} className="rounded-lg p-1 text-slate-400 transition-transform duration-100 ease-out active:scale-90" aria-label="Cerrar menú">✕</button>
            </div>
            <div className="mb-3"><Switcher onAdd={() => { closeMenu(); setAdding(true) }} /></div>
            <NavItems items={NAV} onClick={closeMenu} />
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button onClick={signOut} className="text-sm text-slate-500">Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <CreateBusiness onCancel={() => setAdding(false)} />
        </div>
      )}
    </div>
  )
}
