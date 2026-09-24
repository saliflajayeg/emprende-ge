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

export type BusinessType =
  | 'salon' | 'restaurant' | 'foodstall' | 'shop' | 'technician' | 'professional'
  | 'rentals' | 'school' | 'ngo' | 'shelter' | 'agro' | 'transport' | 'health' | 'other'

export interface BusinessTypeDef {
  id: BusinessType
  label: string
  icon: string
  modules: ModuleId[]
}

export const BUSINESS_TYPES: BusinessTypeDef[] = [
  { id: 'salon', label: 'Peluquería / Belleza', icon: '💈', modules: ['appointments', 'clients', 'services', 'sales', 'expenses', 'employees'] },
  { id: 'restaurant', label: 'Restaurante / Bar', icon: '🍽️', modules: ['sales', 'products', 'ingredients', 'stock', 'expenses'] },
  { id: 'foodstall', label: 'Puesto de comida', icon: '🍢', modules: ['sales', 'products', 'ingredients', 'stock', 'expenses'] },
  { id: 'shop', label: 'Tienda / Abacería / Ferretería', icon: '🏪', modules: ['products', 'stock', 'sales', 'clients', 'debts'] },
  { id: 'technician', label: 'Técnico / Reparaciones', icon: '🔧', modules: ['services', 'clients', 'quotes', 'invoices', 'expenses', 'jobs'] },
  { id: 'professional', label: 'Profesional independiente', icon: '💼', modules: ['clients', 'services', 'invoices', 'expenses', 'collections'] },
  { id: 'rentals', label: 'Alquileres / Inmobiliaria', icon: '🏠', modules: ['rentals', 'expenses', 'invoices'] },
  { id: 'school', label: 'Escuela / Academia', icon: '🎓', modules: ['records', 'invoices', 'collections', 'expenses', 'employees'] },
  { id: 'ngo', label: 'ONG / Asociación', icon: '🤝', modules: ['records', 'transactions', 'expenses'] },
  { id: 'shelter', label: 'Acogida / Centro de menores', icon: '🏡', modules: ['records', 'expenses', 'employees'] },
  { id: 'health', label: 'Clínica / Consultorio', icon: '🩺', modules: ['appointments', 'records', 'invoices', 'expenses'] },
  { id: 'agro', label: 'Agricultura / Ganadería', icon: '🌾', modules: ['sales', 'products', 'stock', 'expenses'] },
  { id: 'transport', label: 'Transporte / Taxi', icon: '🚗', modules: ['services', 'clients', 'sales', 'expenses'] },
  { id: 'other', label: 'Otro / General', icon: '🏢', modules: ['sales', 'expenses', 'invoices', 'clients', 'records'] },
]

export function businessTypeDef(type?: string): BusinessTypeDef {
  return BUSINESS_TYPES.find((b) => b.id === type) ?? BUSINESS_TYPES.find((b) => b.id === 'other')!
}

export function modulesFor(type?: string): ModuleId[] {
  return businessTypeDef(type).modules
}

// Resuelve la navegación final: Panel + módulos activos + Informes + Ajustes
export function navModules(enabled: ModuleId[]): ModuleDef[] {
  const middle = enabled.filter((id) => !['dashboard', 'reports', 'settings'].includes(id))
  const ids: ModuleId[] = ['dashboard', ...middle, 'reports', 'settings']
  // dedupe manteniendo orden
  const seen = new Set<ModuleId>()
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).map((id) => MODULES[id])
}
