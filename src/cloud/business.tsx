import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, withTimeout } from '../lib/supabase'
import { keysToCamel, keysToSnake } from './api'
import { setLocalBusiness } from './localdb'
import { startSync, stopSync } from './sync'
import { setCurrency } from '../lib/format'
import { useAuth } from './auth'
import { DEMO, DEMO_BUSINESS, seedDemo } from './demo'

export interface Business {
  id: string
  ownerId: string
  name: string
  ownerName: string
  sector: string
  businessType: string
  enabledModules: string[] | null
  currency: string
  phone: string
  address: string
  taxRate: number
  recordsLabel: string
  logo?: string | null
  createdAt: string
}

export interface Member {
  userId: string
  role: 'owner' | 'employee'
  name: string
}

interface BusinessCtx {
  businesses: Business[]
  current: Business | null
  role: 'owner' | 'employee' | null
  isAdmin: boolean
  loading: boolean
  members: Member[]
  setCurrent: (id: string) => void
  reload: () => Promise<void>
  reloadMembers: () => Promise<void>
  updateBusiness: (patch: Record<string, any>) => Promise<void>
  createBusiness: (b: {
    name: string
    ownerName: string
    businessType: string
    enabledModules: string[]
    currency: string
    taxRate: number
  }) => Promise<string>
  createInvite: () => Promise<string>
  redeemInvite: (code: string, name: string) => Promise<string>
  removeMember: (userId: string) => Promise<void>
}

const Ctx = createContext<BusinessCtx>({
  businesses: [], current: null, role: null, isAdmin: false, loading: true, members: [],
  setCurrent: () => {}, reload: async () => {}, reloadMembers: async () => {}, updateBusiness: async () => {},
  createBusiness: async () => '', createInvite: async () => '', redeemInvite: async () => '',
  removeMember: async () => {},
})
const CURRENT_KEY = 'gemprende-current-business'
// Copia local de la lista de negocios (+ roles + admin) para poder abrir la app
// SIN conexión: si la consulta a Supabase falla por falta de red, hidratamos desde aquí
// en vez de mandar al usuario a "Crear negocio".
const BIZ_CACHE_KEY = 'gemprende-biz-cache'
// La copia va ligada a la CUENTA (userId): si en el mismo aparato se entra con otra
// cuenta, no se le enseñan los negocios de la anterior.
interface BizCache { userId?: string; businesses: Business[]; roles: Record<string, 'owner' | 'employee'>; admin: boolean }
function readBizCache(userId: string): BizCache | null {
  try {
    const raw = localStorage.getItem(BIZ_CACHE_KEY)
    const c = raw ? (JSON.parse(raw) as BizCache) : null
    // Copias antiguas (sin userId) se aceptan hasta el primer refresco, que ya la guarda con él.
    return c && (c.userId === userId || !c.userId) ? c : null
  } catch { return null }
}
function writeBizCache(c: BizCache) {
  try { localStorage.setItem(BIZ_CACHE_KEY, JSON.stringify(c)) } catch { /* */ }
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [roleByBiz, setRoleByBiz] = useState<Record<string, 'owner' | 'employee'>>({})
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Member[]>([])

  const reload = useCallback(async () => {
    if (!user) {
      setBusinesses([])
      setLoading(false)
      return
    }
    // Modo demo (solo desarrollo): negocio de ejemplo, sin tocar Supabase.
    if (DEMO) {
      setBusinesses([DEMO_BUSINESS as Business])
      setRoleByBiz({ [DEMO_BUSINESS.id]: 'owner' })
      setIsAdmin(false)
      setCurrentId(DEMO_BUSINESS.id)
      setLoading(false)
      return
    }
    // Aplica una lista de negocios (de la nube o de la copia del teléfono).
    const apply = (list: Business[], roles: Record<string, 'owner' | 'employee'>, admin: boolean) => {
      setBusinesses(list)
      setRoleByBiz(roles)
      setIsAdmin(admin)
      // negocio actual: el guardado si sigue existiendo, si no el primero
      let saved: string | null = null
      try { saved = localStorage.getItem(CURRENT_KEY) } catch { /* */ }
      const validSaved = saved && list.some((b) => b.id === saved) ? saved : null
      setCurrentId((prev) => (prev && list.some((b) => b.id === prev) ? prev : validSaved ?? list[0]?.id ?? null))
    }

    // 1) OFFLINE PRIMERO: si el teléfono tiene copia de los negocios, se abre ya con
    //    ella (los datos están en el teléfono). La nube solo la refresca después.
    const cached = readBizCache(user.id)
    if (cached?.businesses.length) {
      apply(cached.businesses, cached.roles, cached.admin)
      setLoading(false)
    }

    // 2) Refresco desde la nube, sin bloquear la apertura.
    try {
      // Asegura que el token de sesión esté cargado antes de consultar; si no,
      // en el arranque en frío la primera consulta puede volver vacía (RLS).
      // Ya no bloquea la apertura, así que podemos esperar más con internet lento.
      const session = await withTimeout(supabase.auth.getSession(), 25000, null)
      if (!session?.data.session) throw new Error('sin sesión válida')
      const [biz, mem, adm] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        supabase.from('members').select('business_id, role').eq('user_id', user.id),
        supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      ])
      // Si la consulta principal falla (p. ej. sin conexión), caemos al respaldo.
      if (biz.error) throw biz.error
      const roles: Record<string, 'owner' | 'employee'> = {}
      for (const m of mem.data ?? []) roles[m.business_id] = m.role
      const admin = !!adm.data
      const all = (biz.data ?? []).map((r) => keysToCamel<Business>(r))
      // El admin puede LEER todos los negocios por RLS, pero en la app normal solo
      // debe ver los suyos (el resto van al panel de Admin). Filtramos SOLO para el
      // admin, y con respaldo por owner_id para no ocultar los propios si la consulta
      // de miembros llega vacía en el arranque en frío. El usuario normal no se filtra
      // (RLS ya solo le devuelve los suyos), evitando esconderle sus negocios.
      const memberIds = new Set(Object.keys(roles))
      const list = admin ? all.filter((b) => memberIds.has(b.id) || b.ownerId === user.id) : all
      // Una respuesta vacía con copia local llena suele ser un fallo de sesión, no que
      // el negocio haya desaparecido: no borramos la copia del teléfono por eso.
      if (list.length === 0 && cached?.businesses.length) throw new Error('respuesta vacía')
      writeBizCache({ userId: user.id, businesses: list, roles, admin })
      apply(list, roles, admin)
      lastOk.current = Date.now()
    } catch {
      // Sin conexión (o error de red): nos quedamos con la copia del teléfono.
      if (!cached?.businesses.length) setBusinesses([])
    }
    setLoading(false)
  }, [user])

  // Momento del último refresco correcto desde la nube.
  const lastOk = useRef(0)

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  // La lista de negocios se vuelve a pedir a la nube aunque la app no se cierre
  // (en el móvil la app instalada puede quedarse abierta días): al volver a la app,
  // al recuperar internet y cada 5 min. Así un negocio creado en otro aparato
  // aparece solo, y un fallo de red puntual no deja la lista vieja para siempre.
  useEffect(() => {
    if (!user || DEMO) return
    const again = () => { if (Date.now() - lastOk.current > 60_000) reload() }
    const onVisible = () => { if (document.visibilityState === 'visible') again() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', again)
    const t = setInterval(again, 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', again)
      clearInterval(t)
    }
  }, [user, reload])

  const setCurrent = (id: string) => {
    setCurrentId(id)
    try { localStorage.setItem(CURRENT_KEY, id) } catch { /* */ }
  }

  const createBusiness: BusinessCtx['createBusiness'] = async (b) => {
    const { data, error } = await supabase.rpc('create_business', {
      p_name: b.name,
      p_owner: b.ownerName,
      p_type: b.businessType,
      p_modules: b.enabledModules,
      p_currency: b.currency,
      p_tax: b.taxRate,
    })
    if (error) throw error
    const newId = data as string
    // Añade el negocio nuevo a la lista (y a la copia del teléfono) YA, sin esperar a
    // volver a descargarla: con internet flojo esa descarga puede fallar y el usuario
    // se quedaba sin negocio seleccionado y sin poder volver al primero.
    const fresh: Business = {
      id: newId, ownerId: user?.id ?? '', name: b.name, ownerName: b.ownerName, sector: '',
      businessType: b.businessType, enabledModules: b.enabledModules, currency: b.currency,
      phone: '', address: '', taxRate: b.taxRate, recordsLabel: '', logo: null, createdAt: new Date().toISOString(),
    }
    const nextList = [...businesses.filter((x) => x.id !== newId), fresh]
    const nextRoles = { ...roleByBiz, [newId]: 'owner' as const }
    setBusinesses(nextList)
    setRoleByBiz(nextRoles)
    if (user) writeBizCache({ userId: user.id, businesses: nextList, roles: nextRoles, admin: isAdmin })
    setCurrent(newId)
    reload() // refresca desde la nube en segundo plano
    return newId
  }

  // Si el negocio elegido no está en la lista (p. ej. tras un fallo de red), se usa el
  // primero en vez de dejar la app sin negocio.
  const current = businesses.find((b) => b.id === currentId) ?? businesses[0] ?? null
  const role = current ? roleByBiz[current.id] ?? null : null

  const loadMembers = useCallback(async (bid: string | null) => {
    if (!bid || DEMO) { setMembers([]); return }
    const { data } = await supabase.from('members').select('user_id, role, name').eq('business_id', bid)
    setMembers((data ?? []).map((m) => ({ userId: m.user_id, role: m.role, name: m.name ?? '' })))
  }, [])

  const reloadMembers = useCallback(() => loadMembers(current?.id ?? null), [loadMembers, current?.id])

  // Cargar el equipo del negocio actual (para la gestión del dueño)
  useEffect(() => { loadMembers(current?.id ?? null) }, [current?.id, loadMembers])

  const createInvite: BusinessCtx['createInvite'] = async () => {
    if (!current) return ''
    const { data, error } = await supabase.rpc('create_invite', { p_business: current.id })
    if (error) throw error
    return data as string
  }

  const redeemInvite: BusinessCtx['redeemInvite'] = async (code, name) => {
    const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code.trim(), member_name: name.trim() })
    if (error) throw error
    const bid = data as string
    await reload()
    setCurrent(bid)
    return bid
  }

  const removeMember: BusinessCtx['removeMember'] = async (userId) => {
    if (!current) return
    const { error } = await supabase.from('members').delete().eq('business_id', current.id).eq('user_id', userId)
    if (error) throw error
    await loadMembers(current.id)
  }

  const updateBusiness = async (patch: Record<string, any>) => {
    if (!current) return
    if (DEMO) { setBusinesses((prev) => prev.map((b) => (b.id === current.id ? { ...b, ...patch } : b))); return }
    const { error } = await supabase.from('businesses').update(keysToSnake(patch)).eq('id', current.id)
    if (error) throw error
    setBusinesses((prev) => prev.map((b) => (b.id === current.id ? { ...b, ...patch } : b)))
  }

  // Al elegir/cambiar de negocio: fija moneda, negocio local y arranca su sync.
  useEffect(() => {
    const id = current?.id ?? null
    if (current) setCurrency(current.currency)
    setLocalBusiness(id)
    if (DEMO) { if (id) seedDemo(id); return }
    if (id) startSync(id)
    else stopSync()
    return () => stopSync()
  }, [current?.id])

  return (
    <Ctx.Provider value={{ businesses, current, role, isAdmin, loading, members, setCurrent, reload, reloadMembers, updateBusiness, createBusiness, createInvite, redeemInvite, removeMember }}>
      {children}
    </Ctx.Provider>
  )
}

export const useBusiness = () => useContext(Ctx)
