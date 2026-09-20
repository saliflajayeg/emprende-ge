import Dexie, { type Table } from 'dexie'

// ---- Tipos de dominio ----

export type Kind = 'income' | 'expense'
export type TxStatus = 'paid' | 'pending'
export type ContactType = 'client' | 'provider'
export type DocType = 'invoice' | 'receipt' | 'quote'
export type ItemKind = 'service' | 'product' | 'ingredient'
export type ApptStatus = 'pending' | 'done' | 'cancelled'
export type JobStatus = 'pending' | 'in_progress' | 'done'

export interface Settings {
  id: string // siempre 'app'
  businessName: string
  ownerName: string
  sector: string
  currency: string // p.ej. 'XAF'
  phone: string
  address: string
  taxRate: number // % IVA por defecto para facturas (Guinea Ecuatorial: IVA 15%)
  recordsLabel: string // nombre del módulo de fichas (p.ej. "Fichas", "Clientes", "Expedientes")
  businessType?: string // tipo de negocio (salon, restaurant, shop, technician, professional, other)
  enabledModules?: string[] // módulos activos en el menú (ids de ModuleId)
  pinHash?: string // hash SHA-256 del PIN de acceso (opcional)
  pinSalt?: string // sal aleatoria para el hash del PIN
  lastBackupAt?: string // ISO de la última copia de seguridad descargada
  onboarded: boolean
  createdAt: string
}

export interface Category {
  id?: number
  kind: Kind
  name: string
  color: string
}

export interface Contact {
  id?: number
  type: ContactType
  name: string
  phone: string
  email: string
  notes: string
  createdAt: string
}

export interface Transaction {
  id?: number
  kind: Kind
  date: string // 'YYYY-MM-DD'
  categoryId?: number
  contactId?: number
  description: string
  amount: number
  paymentMethod: string // efectivo, transferencia, móvil, tarjeta
  status: TxStatus
  dueDate?: string // fecha de vencimiento si está pendiente
  createdAt: string
}

export interface InvoiceItem {
  description: string
  qty: number
  price: number
}

export interface Invoice {
  id?: number
  docType: DocType
  number: string
  contactId?: number
  clientName: string
  clientDetails: string
  date: string
  items: InvoiceItem[]
  taxRate: number
  notes: string
  status: TxStatus
  createdAt: string
}

// Campo personalizado de una ficha (etiqueta + valor libres).
export interface RecordField {
  label: string
  value: string
}

// Ficha / expediente flexible: sirve para un niño en acogida, un cliente de
// peluquería, un paciente, una mascota… El "type" es texto libre.
export interface RecordCard {
  id?: number
  type: string // p.ej. "Niño", "Cliente", "Paciente"
  name: string
  photo?: string // dataURL (JPEG) de la foto principal (retrocompatibilidad)
  photos?: string[] // galería de fotos adicionales (dataURL JPEG)
  registeredAt: string // fecha de registro / llegada (YYYY-MM-DD)
  fields: RecordField[]
  archived: boolean
  createdAt: string
}

// Entrada de la bitácora de seguimiento de una ficha (crece con el tiempo).
export interface RecordEntry {
  id?: number
  recordId: number
  date: string // YYYY-MM-DD
  text: string
  photo?: string // dataURL opcional
  createdAt: string
}

// Item de catálogo: sirve para Servicios, Productos e Ingredientes.
export interface Item {
  id?: number
  kind: ItemKind
  name: string
  price: number
  category: string
  unit: string // "corte", "unidad", "kg", "L"…
  trackStock: boolean
  stock: number
  lowStock: number // umbral de aviso de stock bajo
  notes: string
  createdAt: string
}

// Cita (peluquería/belleza)
export interface Appointment {
  id?: number
  date: string // YYYY-MM-DD
  time: string // HH:MM
  clientId?: number
  clientName: string
  service: string
  price: number
  status: ApptStatus
  notes: string
  createdAt: string
}

// Trabajo pendiente (técnico)
export interface Job {
  id?: number
  title: string
  clientId?: number
  clientName: string
  status: JobStatus
  dueDate?: string
  notes: string
  createdAt: string
}

// Empleado (light: lista de personal del negocio)
export interface Employee {
  id?: number
  name: string
  role: string
  phone: string
  salary?: number
  notes: string
  createdAt: string
}

// ---- Base de datos ----

export class EmprendeDB extends Dexie {
  settings!: Table<Settings, string>
  categories!: Table<Category, number>
  contacts!: Table<Contact, number>
  transactions!: Table<Transaction, number>
  invoices!: Table<Invoice, number>
  records!: Table<RecordCard, number>
  recordEntries!: Table<RecordEntry, number>
  items!: Table<Item, number>
  appointments!: Table<Appointment, number>
  jobs!: Table<Job, number>
  employees!: Table<Employee, number>

  constructor() {
    super('emprende-ge')
    this.version(1).stores({
      settings: 'id',
      categories: '++id, kind',
      contacts: '++id, type',
      transactions: '++id, kind, date, status, categoryId, contactId',
      invoices: '++id, docType, date, status',
    })
    // v2: indexamos contacts.name para poder ordenar alfabéticamente
    this.version(2).stores({
      contacts: '++id, type, name',
    })
    // v3: módulo de Fichas (expedientes) con bitácora de seguimiento
    this.version(3).stores({
      records: '++id, type, name, archived',
      recordEntries: '++id, recordId, date',
    })
    // v4: módulos por tipo de negocio (catálogo, citas, trabajos, empleados)
    this.version(4).stores({
      items: '++id, kind, name, category',
      appointments: '++id, date, status',
      jobs: '++id, status, dueDate',
      employees: '++id, name',
    })
  }
}

export const db = new EmprendeDB()

// Totales derivados de los ítems de una factura
export function invoiceTotals(inv: Pick<Invoice, 'items' | 'taxRate'>) {
  const subtotal = inv.items.reduce((s, it) => s + it.qty * it.price, 0)
  const tax = Math.round(subtotal * (inv.taxRate / 100))
  return { subtotal, tax, total: subtotal + tax }
}
