// Sistema de módulos por tipo de negocio.
// La app muestra solo los módulos relevantes según el tipo elegido en el onboarding,
// y el usuario puede activar/desactivar cualquiera en Ajustes.

export type ModuleId =
  | 'dashboard'
  | 'sales'
  | 'expenses'
  | 'transactions'
  | 'clients'
  | 'services'
  | 'products'
  | 'ingredients'
  | 'stock'
  | 'appointments'
  | 'invoices'
  | 'quotes'
  | 'debts'
  | 'collections'
  | 'jobs'
  | 'employees'
  | 'records'
  | 'rentals'
  | 'reports'
  | 'settings'

export interface ModuleDef {
  id: ModuleId
  label: string
  icon: string
  path: string
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  dashboard: { id: 'dashboard', label: 'Panel', icon: '📊', path: '/' },
  sales: { id: 'sales', label: 'Ventas', icon: '💵', path: '/ventas' },
  expenses: { id: 'expenses', label: 'Gastos', icon: '🧾', path: '/gastos' },
  transactions: { id: 'transactions', label: 'Ingresos y gastos', icon: '💵', path: '/transacciones' },
  clients: { id: 'clients', label: 'Clientes', icon: '👥', path: '/clientes' },
  services: { id: 'services', label: 'Servicios', icon: '✂️', path: '/servicios' },
  products: { id: 'products', label: 'Productos', icon: '📦', path: '/productos' },
  ingredients: { id: 'ingredients', label: 'Ingredientes', icon: '🥘', path: '/ingredientes' },
  stock: { id: 'stock', label: 'Stock', icon: '📥', path: '/stock' },
  appointments: { id: 'appointments', label: 'Citas', icon: '📅', path: '/citas' },
  invoices: { id: 'invoices', label: 'Facturas', icon: '🧾', path: '/facturas' },
  quotes: { id: 'quotes', label: 'Presupuestos', icon: '📄', path: '/presupuestos' },
  debts: { id: 'debts', label: 'Deudas', icon: '⏳', path: '/deudas' },
  collections: { id: 'collections', label: 'Cobros', icon: '💰', path: '/cobros' },
  jobs: { id: 'jobs', label: 'Trabajos pendientes', icon: '🛠️', path: '/trabajos' },
  employees: { id: 'employees', label: 'Empleados', icon: '🧑‍🤝‍🧑', path: '/empleados' },
  records: { id: 'records', label: 'Fichas', icon: '🗂️', path: '/fichas' },
  rentals: { id: 'rentals', label: 'Alquileres', icon: '🏠', path: '/alquileres' },
  reports: { id: 'reports', label: 'Informes', icon: '📈', path: '/informes' },
  settings: { id: 'settings', label: 'Ajustes', icon: '⚙️', path: '/ajustes' },
}

// Módulos que el usuario puede activar/desactivar (no incluye los fijos)
export const TOGGLEABLE: ModuleId[] = [
  'appointments', 'clients', 'services', 'products', 'ingredients', 'stock',
  'sales', 'expenses', 'transactions', 'invoices', 'quotes', 'debts', 'collections',
  'jobs', 'employees', 'records', 'rentals',
]

// Dependencias entre módulos: activar el primero arrastra automáticamente los
// segundos. Ej.: si ofreces servicios, tiene sentido gestionar citas; si vendes
// productos o llevas ingredientes, necesitas stock.
export const MODULE_DEPS: Partial<Record<ModuleId, ModuleId[]>> = {
  services: ['appointments'],
  products: ['stock'],
  ingredients: ['stock'],
}

// Expande una lista de módulos añadiendo sus dependencias (sin duplicados).
export function withDeps(ids: ModuleId[]): ModuleId[] {
  const set = new Set<ModuleId>(ids)
  for (const id of ids) for (const dep of MODULE_DEPS[id] ?? []) set.add(dep)
  return [...set]
}

export type BusinessType =
  | 'salon' | 'restaurant' | 'foodstall' | 'shop' | 'technician' | 'professional'
  | 'rentals' | 'school' | 'ngo' | 'shelter' | 'agro' | 'transport' | 'health'
  | 'laundry' | 'personal' | 'other'

export interface BusinessTypeDef {
  id: BusinessType
  label: string
  icon: string
  modules: ModuleId[]
}

export const BUSINESS_TYPES: BusinessTypeDef[] = [
  { id: 'salon', label: 'Peluquería / Belleza', icon: '💈', modules: ['invoices', 'appointments', 'clients', 'services', 'sales', 'expenses', 'employees'] },
  { id: 'restaurant', label: 'Restaurante / Bar', icon: '🍽️', modules: ['invoices', 'sales', 'products', 'ingredients', 'stock', 'expenses'] },
  { id: 'foodstall', label: 'Puesto de comida', icon: '🍢', modules: ['invoices', 'sales', 'products', 'ingredients', 'stock', 'expenses'] },
  { id: 'shop', label: 'Tienda / Abacería / Ferretería', icon: '🏪', modules: ['invoices', 'products', 'stock', 'sales', 'clients', 'debts'] },
  { id: 'technician', label: 'Técnico / Reparaciones', icon: '🔧', modules: ['services', 'clients', 'quotes', 'invoices', 'expenses', 'jobs'] },
  { id: 'professional', label: 'Profesional independiente', icon: '💼', modules: ['clients', 'services', 'invoices', 'expenses', 'collections'] },
  { id: 'rentals', label: 'Alquileres / Inmobiliaria', icon: '🏠', modules: ['rentals', 'expenses', 'invoices'] },
  { id: 'school', label: 'Escuela / Academia', icon: '🎓', modules: ['records', 'invoices', 'collections', 'expenses', 'employees'] },
  { id: 'ngo', label: 'ONG / Asociación', icon: '🤝', modules: ['records', 'transactions', 'expenses'] },
  { id: 'shelter', label: 'Acogida / Centro de menores', icon: '🏡', modules: ['records', 'expenses', 'employees'] },
  { id: 'health', label: 'Clínica / Consultorio', icon: '🩺', modules: ['appointments', 'records', 'invoices', 'expenses'] },
  { id: 'agro', label: 'Agricultura / Ganadería', icon: '🌾', modules: ['invoices', 'sales', 'products', 'stock', 'expenses'] },
  { id: 'transport', label: 'Transporte / Taxi', icon: '🚗', modules: ['invoices', 'services', 'clients', 'sales', 'expenses'] },
  { id: 'laundry', label: 'Lavandería', icon: '🧺', modules: ['invoices', 'services', 'clients', 'sales', 'expenses', 'jobs'] },
  { id: 'personal', label: 'Personal / Mis cuentas', icon: '🙋', modules: ['transactions', 'debts', 'collections'] },
  { id: 'other', label: 'Otro / General', icon: '🏢', modules: ['sales', 'expenses', 'invoices', 'clients', 'records'] },
]

// Tipos de negocio con "gasto rápido" (interfaz sencilla, sin jerga contable):
// puestos de comida, tiendas y cuentas personales.
export const QUICK_EXPENSE_TYPES: BusinessType[] = ['foodstall', 'shop', 'personal', 'laundry']
export function usesQuickExpense(type?: string): boolean {
  return QUICK_EXPENSE_TYPES.includes((type ?? '') as BusinessType)
}

// IVA por defecto: los negocios informales emiten recibos sin IVA; los formales,
// facturas con IVA 15%. (El registro nunca preguntaba el IVA y ponía 15 a todos,
// así que para un tipo informal un 15 se trata como "sin configurar").
const FORMAL_TYPES: BusinessType[] = ['technician', 'professional', 'health', 'school', 'other']
export function defaultTaxRate(type?: string): number {
  return FORMAL_TYPES.includes((type ?? 'other') as BusinessType) ? 15 : 0
}
export function invoiceTaxRate(type?: string, configured?: number): number {
  const formal = FORMAL_TYPES.includes((type ?? 'other') as BusinessType)
  if (configured === undefined || configured === null) return defaultTaxRate(type)
  return !formal && configured === 15 ? 0 : configured
}

export function businessTypeDef(type?: string): BusinessTypeDef {
  return BUSINESS_TYPES.find((b) => b.id === type) ?? BUSINESS_TYPES.find((b) => b.id === 'other')!
}

export function modulesFor(type?: string): ModuleId[] {
  return businessTypeDef(type).modules
}

// Resuelve la navegación final: Panel + módulos activos + Informes + Ajustes
export function navModules(enabled: ModuleId[]): ModuleDef[] {
  const middle = enabled.filter((id) => !['dashboard', 'reports', 'settings', 'invoices'].includes(id))
  // Facturas va justo después del Panel: es la función principal (y así sale en la barra inferior).
  const head: ModuleId[] = enabled.includes('invoices') ? ['dashboard', 'invoices'] : ['dashboard']
  const ids: ModuleId[] = [...head, ...middle, 'reports', 'settings']
  // dedupe manteniendo orden
  const seen = new Set<ModuleId>()
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).map((id) => MODULES[id])
}
