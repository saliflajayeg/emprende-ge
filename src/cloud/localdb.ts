import Dexie, { type Table } from 'dexie'

// ============================================================
//  Base de datos LOCAL (caché offline) con soporte de sincronización.
//  - ids uuid generados en el cliente (estables entre dispositivos y nube)
//  - businessId en cada fila (multi-negocio en una sola BD)
//  - updatedAt para "el último que guarda gana"
//  - pendingDeletes = tombstones para propagar borrados
// ============================================================

export type Kind = 'income' | 'expense'
export type TxStatus = 'paid' | 'pending'
export type ContactType = 'client' | 'provider'
export type DocType = 'invoice' | 'receipt' | 'quote'
export type ItemKind = 'service' | 'product' | 'ingredient'
export type ApptStatus = 'pending' | 'done' | 'cancelled'
export type JobStatus = 'pending' | 'in_progress' | 'done'
export type UnitType = 'apartment' | 'room' | 'commercial' | 'other'
export type UnitStatus = 'occupied' | 'vacant'
export type RentFreq = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'

interface Base {
  id: string
  businessId: string
  dirty: boolean // true = cambio local pendiente de subir a la nube
}

export interface Category extends Base { kind: Kind; name: string; color: string }
export interface Contact extends Base { type: ContactType; name: string; phone: string; email: string; notes: string; createdAt: string }
export interface Transaction extends Base {
  kind: Kind; date: string; categoryId?: string; contactId?: string; description: string
  amount: number; paymentMethod: string; status: TxStatus; dueDate?: string; createdAt: string
  unitId?: string; period?: string // alquileres: unidad y mes (YYYY-MM) al que corresponde el pago
}
// Unidad de alquiler (apartamento, habitación, local…) con su inquilino y renta
export interface Unit extends Base {
  name: string; type: UnitType; rent: number; tenantName: string; tenantPhone: string
  deposit?: number; status: UnitStatus; frequency: RentFreq; notes: string; createdAt: string
}
export interface InvoiceItem { description: string; qty: number; price: number }
export interface Invoice extends Base {
  docType: DocType; number: string; contactId?: string; clientName: string; clientDetails: string
  date: string; items: InvoiceItem[]; taxRate: number; notes: string; status: TxStatus; createdAt: string
}
export interface Item extends Base {
  kind: ItemKind; name: string; price: number; category: string; unit: string
  trackStock: boolean; stock: number; lowStock: number; notes: string; createdAt: string
}
export interface Appointment extends Base {
  date: string; time: string; clientId?: string; clientName: string; clientPhone?: string; service: string
  price: number; status: ApptStatus; notes: string; approved?: boolean; source?: string; createdAt: string
}
export interface Job extends Base {
  title: string; clientId?: string; clientName: string; status: JobStatus; dueDate?: string; notes: string; createdAt: string
}
export interface Employee extends Base { name: string; role: string; phone: string; salary?: number; notes: string; createdAt: string }
export interface RecordField { label: string; value: string }
export interface RecordCard extends Base {
  type: string; name: string; photo?: string; photos?: string[]; registeredAt: string
  fields: RecordField[]; archived: boolean; createdAt: string
}
export interface RecordEntry extends Base { recordId: string; date: string; text: string; photo?: string; createdAt: string }

export interface PendingDelete { id: string; table: string; rowId: string; businessId: string }
export interface SyncState { id: string; lastPulledAt: string }

// Nombres de las tablas de datos que se sincronizan (orden = respeta dependencias)
export const SYNC_TABLES = [
  'categories', 'contacts', 'items', 'employees', 'units',
  'transactions', 'invoices', 'appointments', 'jobs', 'records', 'recordEntries',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

// Columna que referencia el registro padre en la nube (snake_case en Supabase)
export const CLOUD_TABLE: Record<SyncTable, string> = {
  categories: 'categories', contacts: 'contacts', items: 'items', employees: 'employees',
  units: 'units', transactions: 'transactions', invoices: 'invoices', appointments: 'appointments',
  jobs: 'jobs', records: 'records', recordEntries: 'record_entries',
}

class LocalDB extends Dexie {
  categories!: Table<Category, string>
  contacts!: Table<Contact, string>
  transactions!: Table<Transaction, string>
  invoices!: Table<Invoice, string>
  items!: Table<Item, string>
  appointments!: Table<Appointment, string>
  jobs!: Table<Job, string>
  employees!: Table<Employee, string>
  records!: Table<RecordCard, string>
  recordEntries!: Table<RecordEntry, string>
  units!: Table<Unit, string>
  pendingDeletes!: Table<PendingDelete, string>
  syncState!: Table<SyncState, string>

  constructor() {
    super('gemprende-cloud')
    this.version(1).stores({
      categories: 'id, businessId, kind, dirty',
      contacts: 'id, businessId, type, name, dirty',
      transactions: 'id, businessId, kind, date, status, dirty',
      invoices: 'id, businessId, docType, date, dirty',
      items: 'id, businessId, kind, dirty',
      appointments: 'id, businessId, date, status, dirty',
      jobs: 'id, businessId, status, dirty',
      employees: 'id, businessId, name, dirty',
      records: 'id, businessId, type, archived, dirty',
      recordEntries: 'id, businessId, recordId, date, dirty',
      pendingDeletes: 'id, table, businessId',
      syncState: 'id',
    })
    // v2: módulo de Alquileres (unidades: apartamentos, habitaciones, locales)
    this.version(2).stores({
      units: 'id, businessId, status, dirty',
    })
  }
}

export const ldb = new LocalDB()

// Exposición solo en desarrollo para pruebas manuales
try { if (import.meta.env.DEV) (window as any).__ldb = ldb } catch { /* */ }

// ---- Estado de negocio actual + supresión de escrituras durante sync ----
let currentBusinessId: string | null = null
export const setLocalBusiness = (id: string | null) => { currentBusinessId = id }
export const getLocalBusiness = () => currentBusinessId

let suppress = false
export const setSuppress = (v: boolean) => { suppress = v }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

// Hooks en cada tabla: en altas asignan id/businessId y marcan dirty; en
// modificaciones marcan dirty (salvo durante la bajada de sync, que es "limpia").
for (const t of SYNC_TABLES) {
  const table = (ldb as any)[t] as Table<any, string>
  table.hook('creating', (_pk, obj) => {
    if (suppress) return
    if (!obj.id) obj.id = uuid()
    if (!obj.businessId && currentBusinessId) obj.businessId = currentBusinessId
    obj.dirty = true
  })
  table.hook('updating', (mods: any) => {
    if (suppress) return
    return { ...mods, dirty: true }
  })
}

// Borrado local + tombstone (para propagar el borrado a la nube al sincronizar)
export async function removeRow(table: SyncTable, rowId: string) {
  const bid = currentBusinessId ?? ''
  await ldb.transaction('rw', (ldb as any)[table], ldb.pendingDeletes, async () => {
    await (ldb as any)[table].delete(rowId)
    await ldb.pendingDeletes.put({ id: `${table}:${rowId}`, table, rowId, businessId: bid })
  })
}
