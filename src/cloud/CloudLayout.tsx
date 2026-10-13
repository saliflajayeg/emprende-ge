import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { navModules, modulesFor, type ModuleId } from '../modules'
import { useAuth } from './auth'
import { useBusiness } from './business'
import { getSyncStatus, onSync, syncBusiness, type SyncStatus } from './sync'
import CreateBusiness from './CreateBusiness'
import PullToRefresh from '../components/PullToRefresh'
import { ModuleIcon } from '../components/icons'
import { CloudCheck, ArrowsClockwise, WifiSlash, Warning, List, Plus, SignOut, X } from '@phosphor-icons/react'

const MAX_BUSINESSES = 5

// Bandera de Guinea Ecuatorial dibujada (los emojis de bandera no se ven en Windows ni en muchos Android)
function EGFlag() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-label="Guinea Ecuatorial" role="img" className="shrink-0 rounded-[2px] ring-1 ring-black/10">
      <rect width="18" height="4" fill="#3E9A00" />
      <rect y="4" width="18" height="4" fill="#FFFFFF" />
      <rect y="8" width="18" height="4" fill="#E32118" />
      <path d="M0 0 L5 6 L0 12 Z" fill="#0073CE" />
    </svg>
  )
}


function SyncBadge() {
  const [s, setS] = useState<SyncStatus>(getSyncStatus())
  useEffect(() => onSync(setS), [])
  const map: Record<SyncStatus, { t: string; c: string; I: typeof CloudCheck }> = {
    idle: { t: 'Guardado', c: 'bg-teal-50 text-teal-700', I: CloudCheck },
    syncing: { t: 'Guardando…', c: 'bg-sky-50 text-sky-700', I: ArrowsClockwise },
    offline: { t: 'Sin internet', c: 'bg-amber-50 text-amber-700', I: WifiSlash },
    error: { t: 'Reintentando', c: 'bg-red-50 text-red-700', I: Warning },
  }
  const { t, c, I } = map[s]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c}`}>
      <I size={14} weight="bold" className={s === 'syncing' ? 'animate-spin' : ''} />
      {t}
    </span>
  )
}

interface NavEntry { id: string; to: string; label: string; end?: boolean }

function NavItems({ items, onClick }: { items: NavEntry[]; onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${
              isActive ? 'bg-teal-700 text-white shadow-[0_6px_16px_-8px_rgba(15,118,110,0.7)]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}>
          {({ isActive }) => (
            <>
              <ModuleIcon id={n.id} size={20} weight={isActive ? 'fill' : 'regular'} />
              {n.label}
            </>
          )}
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
      id: m.id,
      to: m.path,
      label: m.id === 'records' ? current?.recordsLabel || m.label : m.label,
      end: m.path === '/',
    }))
  if (isAdmin) NAV.push({ id: 'admin', to: '/admin', label: 'Admin' })

  // Barra inferior (móvil): hasta 4 accesos directos + "Más" (como Facebook).
  // "Más" abre el cajón con el resto de secciones, cambiar de negocio y cerrar sesión.
  const bottomNav = NAV.slice(0, 4)

  // Cabecera: logo del negocio si lo tiene; si no, la marca GEmprende
  const brandLogo = current?.logo || '/logo-mark.png'
  const brandName = current?.logo ? current?.name || 'Mi negocio' : 'GEmprende'
  const logoFit = current?.logo ? 'object-contain bg-white' : 'object-cover'

  const Switcher = ({ onAdd }: { onAdd: () => void }) => (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Negocio</label>
      <select
        value={current?.id}
        onChange={(e) => setCurrent(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15 sm:text-sm"
      >
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name || 'Sin nombre'}</option>)}
      </select>
      <button
        onClick={onAdd}
        disabled={atMax}
        title={atMax ? `Máximo ${MAX_BUSINESSES} negocios` : 'Añadir otro negocio'}
        className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-2 text-xs font-semibold text-slate-500 transition hover:border-teal-500 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} weight="bold" />
        {atMax ? `Máximo ${MAX_BUSINESSES} negocios` : 'Añadir negocio'}
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200/70 bg-white/70 p-4 backdrop-blur md:flex">
        <button onClick={() => navigate('/')} className="mb-5 flex items-center gap-2.5 text-left">
          <img src={brandLogo} alt={brandName} className={`h-10 w-10 shrink-0 rounded-xl ${logoFit}`} />
          <div className="font-display min-w-0 truncate text-lg font-bold leading-tight text-slate-900">{brandName}</div>
        </button>
        <div className="mb-4"><Switcher onAdd={() => setAdding(true)} /></div>
        <NavItems items={NAV} />
        <div className="mt-auto space-y-3 pt-4">
          <SyncBadge />
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700"><SignOut size={14} weight="bold" /> Cerrar sesión</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden pb-16 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-slate-200/60 bg-cream/85 px-4 pb-2.5 backdrop-blur-md md:hidden" style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}>
          <img src={brandLogo} alt={brandName} className={`h-9 w-9 shrink-0 rounded-xl ${logoFit}`} />
          <span className="font-display min-w-0 flex-1 truncate text-lg font-bold text-slate-900">{brandName}</span>
          <SyncBadge />
        </header>

        <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-6 pt-4 sm:p-6">
          <PullToRefresh onRefresh={async () => { if (current?.id) await syncBusiness(current.id) }}>
            {children}
          </PullToRefresh>
        </main>

        <footer className="px-4 pb-6 pt-2">
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2">
              <img src="/logo-mark.png" alt="GEmprende" className="h-7 w-7 rounded-lg object-cover" />
              <span className="font-display font-bold text-slate-700">GEmprende</span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">Impulsando a los emprendedores de Guinea Ecuatorial <EGFlag /></p>
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

      {/* Barra de navegación inferior (solo móvil): icono + nombre, la activa resaltada */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/70 bg-white/95 px-1 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navegación principal"
      >
        {bottomNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-1 pb-2 pt-2 text-[11px] font-semibold transition-transform duration-100 ease-out active:scale-90 ${
                isActive ? 'text-teal-800' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${isActive ? 'bg-teal-100' : ''}`}>
                  <ModuleIcon id={n.id} size={22} weight={isActive ? 'fill' : 'regular'} />
                </span>
                <span className="max-w-full truncate px-1">{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 flex-col items-center gap-1 pb-2 pt-2 text-[11px] font-semibold text-slate-500 transition-transform duration-100 ease-out active:scale-90"
        >
          <span className="grid h-8 w-14 place-items-center rounded-full"><List size={22} /></span>
          <span>Más</span>
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm ${closing ? 'ge-scrim-out' : 'ge-scrim'}`}
            onClick={closeMenu}
          />
          <div className={`absolute left-0 top-0 h-full w-72 max-w-[82%] overflow-y-auto bg-white p-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl ring-1 ring-black/5 ${closing ? 'ge-drawer-out' : 'ge-drawer'}`}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-xl font-bold text-slate-900">Menú</span>
              <button onClick={closeMenu} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-100 ease-out active:scale-90" aria-label="Cerrar menú"><X size={18} weight="bold" /></button>
            </div>
            <div className="mb-3"><Switcher onAdd={() => { closeMenu(); setAdding(true) }} /></div>
            <NavItems items={NAV} onClick={closeMenu} />
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button onClick={signOut} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-500"><SignOut size={18} /> Cerrar sesión</button>
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
