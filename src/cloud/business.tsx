import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { keysToCamel } from './api'
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

interface BusinessCtx {
  businesses: Business[]
  current: Business | null
  role: 'owner' | 'employee' | null
  isAdmin: boolean
  loading: boolean
  setCurrent: (id: string) => void
  reload: () => Promise<void>
  createBusiness: (b: {
    name: string
    ownerName: string
    businessType: string
    enabledModules: string[]
    currency: string
    taxRate: number
  }) => Promise<string>
}

const Ctx = createContext<BusinessCtx>(null as any)
const CURRENT_KEY = 'gemprende-current-business'

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [roleByBiz, setRoleByBiz] = useState<Record<string, 'owner' | 'employee'>>({})
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <Ctx.Provider value={{ businesses, current, role, isAdmin, loading, setCurrent, reload, createBusiness }}>
      {children}
    </Ctx.Provider>
  )
}

export const useBusiness = () => useContext(Ctx)
