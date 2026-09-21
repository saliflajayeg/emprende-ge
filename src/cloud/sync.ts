import { supabase } from '../lib/supabase'
import { keysToCamel, keysToSnake } from './api'
import { ldb, setSuppress, SYNC_TABLES, CLOUD_TABLE, type SyncTable } from './localdb'

let running = false
let timer: ReturnType<typeof setInterval> | null = null
let channel: ReturnType<typeof supabase.channel> | null = null
let activeBid: string | null = null
const listeners = new Set<(s: SyncStatus) => void>()

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'
let status: SyncStatus = 'idle'
function setStatus(s: SyncStatus) {
  status = s
  listeners.forEach((l) => l(s))
}
export const getSyncStatus = () => status
export function onSync(l: (s: SyncStatus) => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

function cloudPayload(row: Record<string, any>) {
  const { dirty: _d, ...rest } = row
  return keysToSnake(rest)
}

// Sube borrados y cambios locales. Devuelve true si TODO se subió sin error.
async function pushBusiness(bid: string): Promise<boolean> {
  let ok = true

  // 1) Borrados (tombstones)
  const dels = await ldb.pendingDeletes.where('businessId').equals(bid).toArray()
  for (const d of dels) {
    const { error } = await supabase.from(CLOUD_TABLE[d.table as SyncTable]).delete().eq('id', d.rowId)
    if (error) { ok = false; continue }
    await ldb.pendingDeletes.delete(d.id)
  }

  // 2) Altas/cambios (filas dirty)
  for (const t of SYNC_TABLES) {
    const table = (ldb as any)[t]
    const dirtyRows = await table.where('businessId').equals(bid).filter((r: any) => r.dirty).toArray()
    if (!dirtyRows.length) continue
    const payload = dirtyRows.map((r: any) => cloudPayload(r))
    const { error } = await supabase.from(CLOUD_TABLE[t]).upsert(payload, { onConflict: 'id' })
    if (error) { ok = false; continue }
    // marcar como limpias (sin disparar hooks)
    setSuppress(true)
    try {
      await table.bulkPut(dirtyRows.map((r: any) => ({ ...r, dirty: false })))
    } finally { setSuppress(false) }
  }

  return ok
}

// Baja los datos de la nube y los fusiona en local (el dirty local manda).
async function pullBusiness(bid: string, canReconcileDeletes: boolean) {
  for (const t of SYNC_TABLES) {
    const table = (ldb as any)[t]
    const { data, error } = await supabase.from(CLOUD_TABLE[t]).select('*').eq('business_id', bid)
    if (error) continue
    const cloudRows = (data ?? []).map((r) => keysToCamel<any>(r))
    const cloudIds = new Set(cloudRows.map((r) => r.id))
    const localRows = await table.where('businessId').equals(bid).toArray()
    const localById = new Map(localRows.map((r: any) => [r.id, r]))

    setSuppress(true)
    try {
      // Nube -> local (salvo si el local está dirty: gana el local hasta subirse)
      const toPut: any[] = []
      for (const cr of cloudRows) {
        const lr = localById.get(cr.id) as any
        if (lr?.dirty) continue
        toPut.push({ ...cr, dirty: false })
      }
      if (toPut.length) await table.bulkPut(toPut)

      // Borrados remotos: filas locales limpias que ya no están en la nube
      if (canReconcileDeletes) {
        const gone = localRows
          .filter((r: any) => !cloudIds.has(r.id) && !r.dirty)
          .map((r: any) => r.id)
        if (gone.length) await table.bulkDelete(gone)
      }
    } finally { setSuppress(false) }
  }
}

// Un ciclo completo de sincronización para un negocio.
export async function syncBusiness(bid: string) {
  if (!navigator.onLine) { setStatus('offline'); return }
  setStatus('syncing')
  try {
    const ok = await pushBusiness(bid)
    await pullBusiness(bid, ok)
    setStatus(ok ? 'idle' : 'error')
  } catch {
    setStatus('error')
  }
}

// Arranca la sincronización para un negocio: primera pasada, periódica,
// al reconectar y en tiempo real (cambios del empleado).
export function startSync(bid: string) {
  stopSync()
  activeBid = bid
  running = true

  const kick = () => { if (activeBid) syncBusiness(activeBid) }
  kick()
  timer = setInterval(kick, 20000)
  window.addEventListener('online', kick)

  // Realtime: un canal con una suscripción por tabla (cambios del empleado)
  let ch = supabase.channel(`sync-${bid}`)
  for (const t of SYNC_TABLES) {
    ch = ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CLOUD_TABLE[t], filter: `business_id=eq.${bid}` },
      () => { if (activeBid && navigator.onLine) syncBusiness(activeBid) },
    )
  }
  channel = ch.subscribe()

  // guardar la referencia del listener para poder quitarlo
  ;(startSync as any)._kick = kick
}

export function stopSync() {
  running = false
  activeBid = null
  if (timer) { clearInterval(timer); timer = null }
  const kick = (startSync as any)._kick
  if (kick) window.removeEventListener('online', kick)
  if (channel) { supabase.removeChannel(channel); channel = null }
}

export const isSyncRunning = () => running

try { if (import.meta.env.DEV) (window as any).__syncBusiness = syncBusiness } catch { /* */ }
