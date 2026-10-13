import {
  House, Money, Wallet, ArrowsDownUp, Users, Briefcase, Package, Basket, Stack, CalendarBlank,
  Receipt, FileText, HandCoins, Coins, Hammer, IdentificationBadge, Folders, Buildings,
  ChartLineUp, GearSix, ShieldCheck, type Icon, type IconWeight,
} from '@phosphor-icons/react'

// Un icono coherente por sección (en lugar de emojis, que cambian en cada móvil).
const MAP: Record<string, Icon> = {
  dashboard: House,
  sales: Money,
  expenses: Wallet,
  transactions: ArrowsDownUp,
  clients: Users,
  services: Briefcase,
  products: Package,
  ingredients: Basket,
  stock: Stack,
  appointments: CalendarBlank,
  invoices: Receipt,
  quotes: FileText,
  debts: HandCoins,
  collections: Coins,
  jobs: Hammer,
  employees: IdentificationBadge,
  records: Folders,
  rentals: Buildings,
  reports: ChartLineUp,
  settings: GearSix,
  admin: ShieldCheck,
}

export function ModuleIcon({ id, size = 22, weight = 'regular', className }: { id: string; size?: number; weight?: IconWeight; className?: string }) {
  const I = MAP[id] ?? House
  return <I size={size} weight={weight} className={className} aria-hidden="true" />
}
