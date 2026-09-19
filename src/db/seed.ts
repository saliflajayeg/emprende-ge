import { db, type Category } from './db'

// Categorías por defecto pensadas para pequeños negocios de Guinea Ecuatorial
export const DEFAULT_INCOME: Omit<Category, 'id'>[] = [
  { kind: 'income', name: 'Ventas', color: '#0d9488' },
  { kind: 'income', name: 'Servicios', color: '#0ea5e9' },
  { kind: 'income', name: 'Otros ingresos', color: '#8b5cf6' },
]

export const DEFAULT_EXPENSE: Omit<Category, 'id'>[] = [
  { kind: 'expense', name: 'Alquiler', color: '#ef4444' },
  { kind: 'expense', name: 'Proveedores / Compras', color: '#f97316' },
  { kind: 'expense', name: 'Inventario', color: '#eab308' },
  { kind: 'expense', name: 'Transporte', color: '#84cc16' },
  { kind: 'expense', name: 'Salarios', color: '#ec4899' },
  { kind: 'expense', name: 'Servicios (luz, agua)', color: '#6366f1' },
]

export const SECTORS = [
  'Comercio / Tienda',
  'Restauración / Bar',
  'Servicios profesionales',
  'Belleza / Peluquería',
  'Transporte',
  'Construcción',
  'Agricultura / Pesca',
  'Tecnología',
  'Educación',
  'Salud',
  'Otro',
]

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Otro']

// Crea las categorías por defecto (una sola vez, durante el onboarding)
export async function seedDefaultCategories() {
  const count = await db.categories.count()
  if (count > 0) return
  await db.categories.bulkAdd([...DEFAULT_INCOME, ...DEFAULT_EXPENSE] as Category[])
}
