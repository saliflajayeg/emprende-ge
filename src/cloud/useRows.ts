import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiList } from './api'
import { useBusiness } from './business'

// Devuelve todas las filas de una tabla para el negocio actual, con
// actualización en tiempo real (realtime). Las páginas filtran/ordenan en JS.
export function useRows<T = any>(table: string): { rows: T[]; loading: boolean; reload: () => void } {
  const { current } = useBusiness()
  const bid = current?.id
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!bid) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setRows(await apiList<T>(table, bid))
    } catch {
      setRows([])
    }
    setLoading(false)
  }, [table, bid])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    if (!bid) return
    const ch = supabase
      .channel(`rt-${table}-${bid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `business_id=eq.${bid}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [table, bid, load])

  return { rows, loading, reload: load }
}
