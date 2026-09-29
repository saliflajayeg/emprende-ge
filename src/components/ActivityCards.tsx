import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ldb } from '../cloud/localdb'
import { money, todayISO, currentMonthKey, rentPeriodKey } from '../lib/format'

// Fila de tarjetas de actividad que se adapta a lo que hace cada negocio.
// Cada tarjeta es tocable y lleva a su sección. Prioriza el DÍA (ventas/citas/
// trabajos/fichas de hoy) y, para alquileres, el estado de cobro del MES.
interface ActCard {
  key: string
  icon: string
  value: string
  label: string
  sub?: string
  tone?: 'default' | 'good' | 'bad'
  to: string
  progress?: number // 0..1, solo para la tarjeta de cobros de alquiler
}

export default function ActivityCards({
  bid,
  enabled,
  businessType,
  recordsLabel,
}: {
  bid: string
  enabled: string[]
  businessType?: string
  recordsLabel?: string
}) {
  const navigate = useNavigate()
  const today = todayISO()
  const month = currentMonthKey()
  const has = (id: string) => enabled.includes(id)

  const hasMoney = ['sales', 'expenses', 'transactions', 'debts', 'collections', 'invoices'].some(has)
  const isPersonal = businessType === 'personal' || (has('transactions') && !has('sales'))
  const hasAppointments = has('appointments')
  const hasJobs = has('jobs')
  const hasRecords = has('records')
  const hasRentals = has('rentals')
  const hasStock = has('stock') || has('products')

  // Consultas (cada una se salta si su módulo no está activo → devuelve []).
  const txToday = useLiveQuery(
    () => (bid && hasMoney ? ldb.transactions.where('businessId').equals(bid).filter((t) => t.date === today).toArray() : []),
    [bid, today, hasMoney],
  )
  const appts = useLiveQuery(
    () => (bid && hasAppointments ? ldb.appointments.where('businessId').equals(bid).filter((a) => a.date === today && a.approved !== false && a.status !== 'cancelled').toArray() : []),
    [bid, today, hasAppointments],
  )
  const jobs = useLiveQuery(
    () => (bid && hasJobs ? ldb.jobs.where('businessId').equals(bid).filter((j) => j.dueDate === today && j.status !== 'done').toArray() : []),
    [bid, today, hasJobs],
  )
  const records = useLiveQuery(
    () => (bid && hasRecords ? ldb.records.where('businessId').equals(bid).filter((r) => r.registeredAt === today).toArray() : []),
    [bid, today, hasRecords],
  )
  const units = useLiveQuery(() => (bid && hasRentals ? ldb.units.where('businessId').equals(bid).toArray() : []), [bid, hasRentals])
  const rentTx = useLiveQuery(() => (bid && hasRentals ? ldb.transactions.where('businessId').equals(bid).filter((t) => !!t.unitId).toArray() : []), [bid, hasRentals])
  const items = useLiveQuery(() => (bid && hasStock ? ldb.items.where('businessId').equals(bid).toArray() : []), [bid, hasStock])

  const dayIncome = (txToday ?? []).filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const dayExpense = (txToday ?? []).filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  const cards: ActCard[] = []

  // Dinero del día
  if (isPersonal) {
    const net = dayIncome - dayExpense
    cards.push({ key: 'money', icon: net >= 0 ? '📈' : '📉', value: money(net), label: 'Balance de hoy', tone: net >= 0 ? 'good' : 'bad', to: '/transacciones' })
  } else if (hasMoney) {
    cards.push({ key: 'money', icon: '💵', value: money(dayIncome), label: 'Ventas de hoy', sub: dayExpense > 0 ? `Gastos ${money(dayExpense)}` : undefined, tone: 'good', to: has('sales') ? '/ventas' : '/transacciones' })
  }

  // Citas de hoy
  if (hasAppointments) {
    const n = (appts ?? []).length
    cards.push({ key: 'appts', icon: '📅', value: String(n), label: 'Citas de hoy', sub: n === 0 ? 'Sin citas' : undefined, to: '/citas' })
  }

  // Trabajos que vencen hoy
  if (hasJobs) {
    const n = (jobs ?? []).length
    cards.push({ key: 'jobs', icon: '🛠️', value: String(n), label: 'Trabajos de hoy', sub: n === 0 ? 'Nada vence hoy' : 'Vencen hoy', tone: n > 0 ? 'bad' : 'default', to: '/trabajos' })
  }

  // Cobros de alquiler del mes (X de Y ocupadas) + barra de progreso
  if (hasRentals) {
    const occupied = (units ?? []).filter((u) => u.status === 'occupied')
    const isPaid = (u: (typeof occupied)[number]) =>
      (rentTx ?? []).some((t) => t.unitId === u.id && t.period === rentPeriodKey(u.frequency ?? 'monthly', month))
    const paid = occupied.filter(isPaid)
    const paidCount = paid.length
    const total = occupied.length
    const collected = paid.reduce((s, u) => s + (u.rent || 0), 0)
    const expected = occupied.reduce((s, u) => s + (u.rent || 0), 0)
    const pending = Math.max(0, expected - collected)
    cards.push({
      key: 'rentals',
      icon: '🏠',
      value: `${paidCount}/${total}`,
      label: 'Cobros del mes',
      sub: total === 0 ? 'Sin unidades' : pending > 0 ? `Faltan ${money(pending)}` : 'Todo cobrado ✓',
      tone: pending > 0 ? 'bad' : 'good',
      to: '/alquileres',
      progress: total ? paidCount / total : 0,
    })
  }

  // Fichas registradas hoy (acogidas / ONG / escuelas)
  if (hasRecords) {
    const n = (records ?? []).length
    cards.push({ key: 'records', icon: '🗂️', value: String(n), label: `${recordsLabel || 'Fichas'} de hoy`, sub: n === 0 ? 'Ninguna hoy' : undefined, to: '/fichas' })
  }

  // Stock bajo (solo si hay artículos por debajo del mínimo)
  if (hasStock) {
    const low = (items ?? []).filter((it) => it.trackStock && it.lowStock > 0 && it.stock <= it.lowStock).length
    if (low > 0) cards.push({ key: 'stock', icon: '📦', value: String(low), label: 'Stock bajo', sub: 'Reponer pronto', tone: 'bad', to: '/stock' })
  }

  if (cards.length === 0) return null

  const toneClass = (t?: string) => (t === 'good' ? 'text-teal-600' : t === 'bad' ? 'text-red-600' : 'text-slate-900')

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <button
          key={c.key}
          onClick={() => navigate(c.to)}
          className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-100 ease-out hover:border-teal-300 hover:shadow active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xl">{c.icon}</span>
            <span className="text-slate-300">›</span>
          </div>
          <div className={`ge-nums mt-2 text-2xl font-bold leading-tight ${toneClass(c.tone)}`}>{c.value}</div>
          <div className="text-xs font-medium text-slate-500">{c.label}</div>
          {c.progress !== undefined && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${c.tone === 'good' ? 'bg-teal-500' : 'bg-amber-400'}`} style={{ width: `${Math.round(c.progress * 100)}%` }} />
            </div>
          )}
          {c.sub && <div className="mt-1 truncate text-xs text-slate-400">{c.sub}</div>}
        </button>
      ))}
    </div>
  )
}
