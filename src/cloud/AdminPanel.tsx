import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { keysToCamel } from './api'
import { useBusiness } from './business'
import { money, formatDate, currentMonthKey, monthKey, todayISO } from '../lib/format'
import { Card, StatCard, Input, Select, EmptyState } from '../components/ui'

interface BizRow {
  id: string
  name: string
  sector: string
  businessType: string
  ownerName: string
  currency: string
  createdAt: string
}
interface TxRow { businessId: string; kind: 'income' | 'expense'; amount: number; date: string; status: 'paid' | 'pending' }
interface MemRow { businessId: string; role: 'owner' | 'employee' }

interface Metrics {
  income: number
  expense: number
  net: number
  txCount: number
  monthIncome: number
  monthExpense: number
  pendingIn: number
  lastActivity: string
  members: number
  daysIdle: number | null
}

function insights(m: Metrics): { text: string; tone: 'bad' | 'warn' | 'good' }[] {
  const out: { text: string; tone: 'bad' | 'warn' | 'good' }[] = []
  if (m.txCount === 0) {
    out.push({ text: 'Aún no registra movimientos', tone: 'warn' })
    return out
  }
  if (m.monthExpense > m.monthIncome) out.push({ text: 'Este mes gasta más de lo que ingresa', tone: 'bad' })
  else if (m.monthIncome > 0) out.push({ text: 'Este mes va en positivo', tone: 'good' })
  if (m.pendingIn > 0) out.push({ text: `Cobros pendientes: ${money(m.pendingIn)}`, tone: 'warn' })
  if (m.daysIdle !== null && m.daysIdle >= 14) out.push({ text: `Sin actividad hace ${m.daysIdle} días`, tone: 'warn' })
  return out
}

const TONE: Record<'bad' | 'warn' | 'good', string> = {
  bad: 'bg-red-50 text-red-700',
  warn: 'bg-amber-50 text-amber-700',
  good: 'bg-teal-50 text-teal-700',
}

function daysBetween(iso: string): number | null {
  if (!iso) return null
  const then = new Date(iso + 'T00:00:00')
  const now = new Date(todayISO() + 'T00:00:00')
  return Math.round((now.getTime() - then.getTime()) / 86400000)
}

export default function AdminPanel() {
  const { isAdmin } = useBusiness()
  const [biz, setBiz] = useState<BizRow[]>([])
  const [txs, setTxs] = useState<TxRow[]>([])
  const [mems, setMems] = useState<MemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'activity' | 'income' | 'net'>('activity')

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    ;(async () => {
      const [{ data: b }, { data: t }, { data: m }] = await Promise.all([
        supabase.from('businesses').select('id,name,sector,business_type,owner_name,currency,created_at').order('created_at'),
        supabase.from('transactions').select('business_id,kind,amount,date,status'),
        supabase.from('members').select('business_id,role'),
      ])
      setBiz((b ?? []).map((r) => keysToCamel<BizRow>(r)))
      setTxs((t ?? []).map((r) => keysToCamel<TxRow>(r)))
      setMems((m ?? []).map((r) => keysToCamel<MemRow>(r)))
      setLoading(false)
    })()
  }, [isAdmin])

  const byBiz = useMemo(() => {
    const cm = currentMonthKey()
    const map = new Map<string, Metrics>()
    for (const b of biz) {
      map.set(b.id, { income: 0, expense: 0, net: 0, txCount: 0, monthIncome: 0, monthExpense: 0, pendingIn: 0, lastActivity: '', members: 0, daysIdle: null })
    }
    for (const t of txs) {
      const mx = map.get(t.businessId)
      if (!mx) continue
      mx.txCount++
      if (t.kind === 'income') {
        mx.income += t.amount
        if (monthKey(t.date) === cm) mx.monthIncome += t.amount
        if (t.status === 'pending') mx.pendingIn += t.amount
      } else {
        mx.expense += t.amount
        if (monthKey(t.date) === cm) mx.monthExpense += t.amount
      }
      if (t.date > mx.lastActivity) mx.lastActivity = t.date
    }
    for (const mm of mems) {
      const mx = map.get(mm.businessId)
      if (mx) mx.members++
    }
    for (const mx of map.values()) {
      mx.net = mx.income - mx.expense
      mx.daysIdle = daysBetween(mx.lastActivity)
    }
    return map
  }, [biz, txs, mems])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = biz
      .filter((b) => !q || `${b.name} ${b.ownerName} ${b.sector}`.toLowerCase().includes(q))
      .map((b) => ({ b, m: byBiz.get(b.id)! }))
    list.sort((a, b) => {
      if (sort === 'income') return b.m.income - a.m.income
      if (sort === 'net') return b.m.net - a.m.net
      // activity: menos días ocioso primero (nulls al final)
      const da = a.m.daysIdle ?? 9999
      const db = b.m.daysIdle ?? 9999
      return da - db
    })
    return list
  }, [biz, byBiz, query, sort])

  if (!isAdmin) return <EmptyState title="Sin acceso" hint="Esta sección es solo para administradores." />
  if (loading) return <div className="text-slate-400">Cargando panel…</div>

  const totalNegocios = biz.length
  const totalMov = txs.length
  const activos30 = rows.filter((r) => r.m.daysIdle !== null && r.m.daysIdle <= 30).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🛡️ Panel de administración</h1>
        <p className="text-sm text-slate-500">Actividad y salud de los negocios (sin ver el detalle de cada movimiento).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Negocios" value={String(totalNegocios)} />
        <StatCard label="Activos (30 días)" value={String(activos30)} tone={activos30 ? 'good' : undefined} />
        <StatCard label="Movimientos totales" value={String(totalMov)} />
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-[160px] flex-1">
          <Input placeholder="Buscar negocio, dueño o sector…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="w-48">
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="activity">Ordenar: más activos</option>
            <option value="income">Ordenar: más ingresos</option>
            <option value="net">Ordenar: mejor beneficio</option>
          </Select>
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Sin negocios" hint="Todavía no hay negocios registrados." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ b, m }) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800">{b.name || 'Sin nombre'}</div>
                  <div className="text-xs text-slate-400">
                    {[b.sector || b.businessType, b.ownerName].filter(Boolean).join(' · ')}
                    {m.members > 1 && ` · 👥 ${m.members}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${m.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{money(m.net, b.currency)}</div>
                  <div className="text-xs text-slate-400">neto</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-slate-50 py-2">
                  <div className="font-semibold text-teal-700">{money(m.monthIncome, b.currency)}</div>
                  <div className="text-xs text-slate-400">ingresos (mes)</div>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <div className="font-semibold text-red-600">{money(m.monthExpense, b.currency)}</div>
                  <div className="text-xs text-slate-400">gastos (mes)</div>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <div className="font-semibold text-slate-700">{m.txCount}</div>
                  <div className="text-xs text-slate-400">movimientos</div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {insights(m).map((ins, i) => (
                  <span key={i} className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[ins.tone]}`}>{ins.text}</span>
                ))}
                <span className="ml-auto text-xs text-slate-400">
                  {m.lastActivity ? `Últ. mov.: ${formatDate(m.lastActivity)}` : 'Sin movimientos'}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
