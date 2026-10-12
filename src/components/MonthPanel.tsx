import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Invoice, Transaction } from '../cloud/localdb'
import { money, monthLabel, currentMonthKey, lastMonths, monthKey } from '../lib/format'
import { sumIn, byCategory, monthlySeries } from '../lib/analytics'
import { paymentSummary } from '../lib/invoiceLedger'
import { CashFlowChart } from './charts'
import { Card } from './ui'

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

  return (
    <Card className="space-y-4">
      {/* Mes */}
      <div className="flex items-center justify-between">
        <button onClick={() => setM(shiftMonth(m, -1))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 active:scale-90" aria-label="Mes anterior">‹</button>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Contabilidad del mes</div>
          <div className="font-bold capitalize text-slate-800">{monthLabel(m)}</div>
          {!isCurrent && <button onClick={() => setM(currentMonthKey())} className="text-xs text-teal-600">Volver a este mes</button>}
        </div>
        <button onClick={() => setM(shiftMonth(m, 1))} disabled={isCurrent} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 active:scale-90 disabled:opacity-30" aria-label="Mes siguiente">›</button>
      </div>

      {/* Resultado */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-2 py-3">
          <div className="text-xs text-slate-500">Ingresos</div>
          <div className="ge-nums text-sm font-bold text-teal-700 sm:text-base">{money(income)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-3">
          <div className="text-xs text-slate-500">Gastos</div>
          <div className="ge-nums text-sm font-bold text-red-600 sm:text-base">{money(expense)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-3">
          <div className="text-xs text-slate-500">{net >= 0 ? 'Ganancia' : 'Pérdida'}</div>
          <div className={`ge-nums text-sm font-bold sm:text-base ${net >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{money(net)}</div>
        </div>
      </div>

      {/* Facturación */}
      <div>
        <div className="mb-1 text-sm font-semibold text-slate-700">🧾 Facturas del mes</div>
        {monthInv.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguna factura este mes.</p>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-1.5"><span className="text-slate-500">Facturas emitidas</span><span className="font-medium">{monthInv.length}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-500">Total facturado</span><span className="ge-nums font-medium">{money(invoiced)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-500">Cobrado en el mes</span><span className="ge-nums font-medium text-teal-700">{money(collected)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-500">Falta por cobrar</span><span className={`ge-nums font-medium ${invPending > 0 ? 'text-amber-600' : 'text-teal-700'}`}>{money(invPending)}</span></div>
          </div>
        )}
      </div>

      {/* En qué se gasta */}
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-700">💸 ¿En qué se fue el dinero?</div>
        {cats.length === 0 ? (
          <p className="text-sm text-slate-400">Sin gastos este mes.</p>
        ) : (
          <div className="space-y-2">
            {cats.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-sm"><span className="text-slate-600">{c.name}</span><span className="ge-nums font-medium">{money(c.amount)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((c.amount / maxCat) * 100)}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Evolución */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => setShowChart((v) => !v)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 active:scale-95">
          {showChart ? 'Ocultar evolución' : '📈 Ver últimos 6 meses'}
        </button>
        <button onClick={() => navigate('/informes')} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 active:scale-95">
          Informe completo ›
        </button>
      </div>
      {showChart && <CashFlowChart data={monthlySeries(txs, lastMonths(6))} />}
    </Card>
  )
}
