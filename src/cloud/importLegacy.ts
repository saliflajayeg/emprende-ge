import Dexie from 'dexie'
import { ldb } from './localdb'
import { syncBusiness } from './sync'

// ============================================================
//  Importación de datos del modelo ANTERIOR (local-first) al nuevo
//  modelo nube. La base antigua "emprende-ge" (ids numéricos) sigue
//  viviendo en el navegador del dispositivo donde se usó la app.
//  Se leen sus datos y se copian al negocio actual (ids uuid + nube).
//  Debe ejecutarse EN EL DISPOSITIVO donde estaban los datos.
// ============================================================

const LEGACY_DB = 'emprende-ge'
const FLAG = (bid: string) => `gemprende-legacy-imported-${bid}`

// Tablas de datos de la base antigua (settings NO se importa)
const DATA_TABLES = [
  'categories', 'contacts', 'items', 'employees',
  'transactions', 'invoices', 'appointments', 'jobs', 'records', 'recordEntries',
]

async function openLegacy(): Promise<Dexie | null> {
  try {
    if (!(await Dexie.exists(LEGACY_DB))) return null
    const db = new Dexie(LEGACY_DB)
    await db.open() // abre con el esquema existente (sin declarar versión)
    return db
  } catch {
    return null
  }
}

export interface LegacySummary {
  found: boolean
  imported: boolean
  total: number
  counts: Record<string, number>
}

// ¿Hay datos antiguos en este dispositivo? (y si ya se importaron a este negocio)
export async function legacySummary(bid: string): Promise<LegacySummary> {
  const db = await openLegacy()
  let imported = false
  try { imported = localStorage.getItem(FLAG(bid)) === '1' } catch { /* */ }
  if (!db) return { found: false, imported, total: 0, counts: {} }
  const counts: Record<string, number> = {}
  let total = 0
  // Para decidir "hay datos" ignoramos categorías (suelen ser solo las por defecto)
  for (const name of DATA_TABLES) {
    if (!db.tables.some((t) => t.name === name)) continue
    try {
      const c = await db.table(name).count()
      counts[name] = c
      if (name !== 'categories') total += c
    } catch { /* tabla ausente */ }
  }
  db.close()
  return { found: total > 0, imported, total, counts }
}

const pick = <T extends Record<string, any>>(o: T, keys: string[]) => {
  const out: Record<string, any> = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  return out
}

// Copia los datos antiguos al negocio `bid`. Devuelve cuántas filas por tabla.
export async function importLegacy(bid: string): Promise<Record<string, number>> {
  const db = await openLegacy()
  if (!db) throw new Error('No se encontraron datos anteriores en este dispositivo.')

  const read = async (name: string): Promise<any[]> => {
    if (!db.tables.some((t) => t.name === name)) return []
    try { return await db.table(name).toArray() } catch { return [] }
  }

  const done: Record<string, number> = {}

  // 1) Categorías: reutiliza las existentes por (kind+name) y crea las nuevas
  const oldCats = await read('categories')
  const existingCats = await ldb.categories.where('businessId').equals(bid).toArray()
  const catKey = (k: string, n: string) => `${k}::${(n || '').trim().toLowerCase()}`
  const catByKey = new Map(existingCats.map((c) => [catKey(c.kind, c.name), c.id]))
  const catMap = new Map<number, string>()
  for (const oc of oldCats) {
    if (oc.id == null) continue
    const key = catKey(oc.kind, oc.name)
    let id = catByKey.get(key)
    if (!id) {
      id = (await ldb.categories.add({ businessId: bid, kind: oc.kind, name: oc.name, color: oc.color || '#0d9488' } as any)) as string
      catByKey.set(key, id)
      done.categories = (done.categories ?? 0) + 1
    }
    catMap.set(oc.id, id)
  }

  // 2) Contactos
  const contactMap = new Map<number, string>()
  for (const oc of await read('contacts')) {
    if (oc.id == null) continue
    const row = { businessId: bid, ...pick(oc, ['type', 'name', 'phone', 'email', 'notes', 'createdAt']) }
    const id = (await ldb.contacts.add(row as any)) as string
    contactMap.set(oc.id, id)
    done.contacts = (done.contacts ?? 0) + 1
  }

  // 3) Catálogo (items) y empleados (sin FK)
  for (const it of await read('items')) {
    const row = { businessId: bid, ...pick(it, ['kind', 'name', 'price', 'category', 'unit', 'trackStock', 'stock', 'lowStock', 'notes', 'createdAt']) }
    await ldb.items.add(row as any)
    done.items = (done.items ?? 0) + 1
  }
  for (const e of await read('employees')) {
    const row = { businessId: bid, ...pick(e, ['name', 'role', 'phone', 'salary', 'notes', 'createdAt']) }
    await ldb.employees.add(row as any)
    done.employees = (done.employees ?? 0) + 1
  }

  // 4) Transacciones (remapea categoryId y contactId)
  for (const t of await read('transactions')) {
    const row: any = { businessId: bid, ...pick(t, ['kind', 'date', 'description', 'amount', 'paymentMethod', 'status', 'dueDate', 'createdAt']) }
    if (t.categoryId != null) row.categoryId = catMap.get(t.categoryId)
    if (t.contactId != null) row.contactId = contactMap.get(t.contactId)
    await ldb.transactions.add(row)
    done.transactions = (done.transactions ?? 0) + 1
  }

  // 5) Facturas/recibos/presupuestos (remapea contactId; items es jsonb)
  for (const inv of await read('invoices')) {
    const row: any = { businessId: bid, ...pick(inv, ['docType', 'number', 'clientName', 'clientDetails', 'date', 'items', 'taxRate', 'notes', 'status', 'createdAt']) }
    if (inv.contactId != null) row.contactId = contactMap.get(inv.contactId)
    await ldb.invoices.add(row)
    done.invoices = (done.invoices ?? 0) + 1
  }

  // 6) Citas y trabajos (remapea clientId → contactos)
  for (const a of await read('appointments')) {
    const row: any = { businessId: bid, ...pick(a, ['date', 'time', 'clientName', 'service', 'price', 'status', 'notes', 'createdAt']) }
    if (a.clientId != null) row.clientId = contactMap.get(a.clientId)
    await ldb.appointments.add(row)
    done.appointments = (done.appointments ?? 0) + 1
  }
  for (const j of await read('jobs')) {
    const row: any = { businessId: bid, ...pick(j, ['title', 'clientName', 'status', 'dueDate', 'notes', 'createdAt']) }
    if (j.clientId != null) row.clientId = contactMap.get(j.clientId)
    await ldb.jobs.add(row)
    done.jobs = (done.jobs ?? 0) + 1
  }

  // 7) Fichas y su bitácora de seguimiento (remapea recordId)
  const recordMap = new Map<number, string>()
  for (const r of await read('records')) {
    if (r.id == null) continue
    const row = { businessId: bid, ...pick(r, ['type', 'name', 'photo', 'photos', 'registeredAt', 'fields', 'archived', 'createdAt']) }
    const id = (await ldb.records.add(row as any)) as string
    recordMap.set(r.id, id)
    done.records = (done.records ?? 0) + 1
  }
  for (const e of await read('recordEntries')) {
    const newRecordId = e.recordId != null ? recordMap.get(e.recordId) : undefined
    if (!newRecordId) continue // entrada huérfana: se omite
    const row: any = { businessId: bid, recordId: newRecordId, ...pick(e, ['date', 'text', 'photo', 'createdAt']) }
    await ldb.recordEntries.add(row)
    done.recordEntries = (done.recordEntries ?? 0) + 1
  }

  db.close()
  try { localStorage.setItem(FLAG(bid), '1') } catch { /* */ }

  // Sube todo lo importado a la nube en cuanto sea posible
  try { await syncBusiness(bid) } catch { /* se subirá en el próximo ciclo */ }

  return done
}
