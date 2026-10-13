import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Invoice, Transaction } from '../cloud/localdb'
import { money, monthLabel, currentMonthKey, lastMonths, monthKey } from '../lib/format'
import { sumIn, byCategory, monthlySeries } from '../lib/analytics'
import { paymentSummary } from '../lib/invoiceLedger'
import { CashFlowChart } from './charts'
import { Card } from './ui'
import { CaretLeft, CaretRight, ArrowDownLeft, ArrowUpRight, Receipt, ChartPieSlice, ChartLineUp, ArrowRight } from '@phosphor-icons/react'

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Contabilidad del mes, siempre visible en el panel: resultado, facturación,
// gastos por categoría y evolución.
export default function MonthPanel({ txs, categories, invoices }: { txs: Transaction[]; categories: Category[]; invoices: Invoice[] }) {
  const navigate = useNavigate()
  const [m, setM] = useState(currentMonthKey())
  const [showChart, setShowChart] = useState(false)
  const isCurrent = m === currentMonthKey()

  const income = sumIn(txs, 'income', m)
  const expense = sumIn(txs, 'expense', m)
  const net = income - expense
  const collected = txs.filter((t) => t.kind === 'income' && t.status === 'paid' && monthKey(t.date) === m).reduce((s, t) => s + t.amount, 0)

  // Facturación del mes (sin presupuestos)
  const byInv = new Map<string, Transaction[]>()
  for (const t of txs) if (t.invoiceId) byInv.set(t.invoiceId, [...(byInv.get(t.invoiceId) ?? []), t])
  const monthInv = invoices.filter((i) => i.docType !== 'quote' && monthKey(i.date) === m)
  const invSum = monthInv.map((i) => paymentSummary(i, byInv.get(i.id) ?? []))
  const invoiced = invSum.reduce((s, x) => s + x.total, 0)
  const invPending = invSum.reduce((s, x) => s + x.remaining, 0)

  const cats = byCategory(txs, categories, 'expense', m).slice(0, 5)
  const maxCat = Math.max(1, ...cats.map((c) => c.amount))

  const label = monthLabel(m).charAt(0).toUpperCase() + monthLabel(m).slice(1)
  const spentPct = income > 0 ? Math.min(100, Math.round((expense / income) * 100)) : expense > 0 ? 100 : 0

  return (
    <Card className="space-y-5 p-5">
      {/* Cabecera: título + selector de mes */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Tu mes</h2>
        <div className="flex items-center rounded-full bg-slate-100 p-1">
          <button onClick={() => setM(shiftMonth(m, -1))} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 transition-transform hover:bg-white active:scale-90" aria-label="Mes anterior"><CaretLeft size={16} weight="bold" /></button>
          <span className="min-w-[7.5rem] px-1 text-center text-sm font-bold text-slate-800">{label}</span>
          <button onClick={() => setM(shiftMonth(m, 1))} disabled={isCurrent} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 transition-transform hover:bg-white active:scale-90 disabled:opacity-30" aria-label="Mes siguiente"><CaretRight size={16} weight="bold" /></button>
        </div>
      </div>
      {!isCurrent && <button onClick={() => setM(currentMonthKey())} className="-mt-3 text-xs font-semibold text-teal-700">Volver a este mes</button>}

      {/* Resultado del mes */}
      <div className={`rounded-2xl p-4 ${net >= 0 ? 'bg-teal-50' : 'bg-red-50'}`}>
        <div className={`text-xs font-bold uppercase tracking-wider ${net >= 0 ? 'text-teal-700' : 'text-red-700'}`}>{net >= 0 ? 'Ganancia del mes' : 'Pérdida del mes'}</div>
        <div className={`ge-nums font-display mt-0.5 text-3xl font-extrabold tracking-tight ${net >= 0 ? 'text-teal-900' : 'text-red-700'}`}>{money(net)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-teal-700"><ArrowDownLeft size={18} weight="bold" /></span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-500">Ingresos</div>
              <div className="ge-nums truncate text-sm font-extrabold text-slate-900">{money(income)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-red-600"><ArrowUpRight size={18} weight="bold" /></span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-500">Gastos</div>
              <div className="ge-nums truncate text-sm font-extrabold text-slate-900">{money(expense)}</div>
            </div>
          </div>
        </div>
        {(income > 0 || expense > 0) && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div className={`h-full rounded-full ${spentPct >= 100 ? 'bg-red-500' : spentPct > 75 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${spentPct}%` }} />
            </div>
            <div className="mt-1 text-xs font-medium text-slate-500">Has gastado el {spentPct}% de lo que has ingresado</div>
          </div>
        )}
      </div>

      {/* Facturación */}
      <section>
        <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-slate-800"><Receipt size={18} weight="duotone" className="text-teal-700" /> Facturas del mes</div>
        {monthInv.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguna factura este mes.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {([
              ['Emitidas', String(monthInv.length), 'text-slate-900'],
              ['Facturado', money(invoiced), 'text-slate-900'],
              ['Cobrado', money(collected), 'text-teal-700'],
              ['Falta cobrar', money(invPending), invPending > 0 ? 'text-amber-700' : 'text-teal-700'],
            ] as [string, string, string][]).map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="text-xs font-semibold text-slate-500">{k}</div>
                <div className={`ge-nums truncate text-base font-extrabold ${c}`}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* En qué se gasta */}
      <section>
        <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-slate-800"><ChartPieSlice size={18} weight="duotone" className="text-teal-700" /> ¿En qué se fue el dinero?</div>
        {cats.length === 0 ? (
          <p className="text-sm text-slate-400">Sin gastos este mes.</p>
        ) : (
          <div className="space-y-3">
            {cats.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium text-slate-700">{c.name}</span><span className="ge-nums shrink-0 font-bold text-slate-900">{money(c.amount)}</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((c.amount / maxCat) * 100)}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Evolución */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowChart((v) => !v)} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 text-sm font-semibold text-slate-700 transition-transform active:scale-95">
          <ChartLineUp size={16} weight="bold" /> {showChart ? 'Ocultar evolución' : 'Últimos 6 meses'}
        </button>
        <button onClick={() => navigate('/informes')} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 text-sm font-semibold text-slate-700 transition-transform active:scale-95">
          Informe completo <ArrowRight size={14} weight="bold" />
        </button>
      </div>
      {showChart && <CashFlowChart data={monthlySeries(txs, lastMonths(6))} />}
    </Card>
  )
}
