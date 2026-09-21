import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { keysToCamel, keysToSnake } from './api'
import { setLocalBusiness } from './localdb'
import { startSync, stopSync } from './sync'
import { setCurrency } from '../lib/format'
import { useAuth } from './auth'

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
    const [{ data: biz }, { data: mem }, { data: adm }] = await Promise.all([
      supabase.from('businesses').select('*').order('created_at'),
      supabase.from('members').select('business_id, role').eq('user_id', user.id),
      supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])
    const list = (biz ?? []).map((r) => keysToCamel<Business>(r))
    const roles: Record<string, 'owner' | 'employee'> = {}
    for (const m of mem ?? []) roles[m.business_id] = m.role
    setBusinesses(list)
    setRoleByBiz(roles)
    setIsAdmin(!!adm)
    // negocio actual: el guardado si sigue existiendo, si no el primero
    let saved: string | null = null
    try { saved = localStorage.getItem(CURRENT_KEY) } catch { /* */ }
    const validSaved = saved && list.some((b) => b.id === saved) ? saved : null
    setCurrentId(validSaved ?? list[0]?.id ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

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
    await reload()
    setCurrent(newId)
    return newId
  }

  const current = businesses.find((b) => b.id === currentId) ?? null
  const role = current ? roleByBiz[current.id] ?? null : null

  const loadMembers = useCallback(async (bid: string | null) => {
    if (!bid) { setMembers([]); return }
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
    const { error } = await supabase.from('businesses').update(keysToSnake(patch)).eq('id', current.id)
    if (error) throw error
    setBusinesses((prev) => prev.map((b) => (b.id === current.id ? { ...b, ...patch } : b)))
  }

  // Al elegir/cambiar de negocio: fija moneda, negocio local y arranca su sync.
  useEffect(() => {
    const id = current?.id ?? null
    if (current) setCurrency(current.currency)
    setLocalBusiness(id)
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
