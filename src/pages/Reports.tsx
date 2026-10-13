import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, monthLabel, currentMonthKey, monthKey, lastMonths } from '../lib/format'
import { sumIn, byCategory, monthlySeries, pendingTotals } from '../lib/analytics'
import { reportPDF, creditReportPDF, type PdfBusiness } from '../lib/pdf'
import { topProducts, topClients, groupByInvoice } from '../lib/salesStats'
import { paymentSummary } from '../lib/invoiceLedger'
import { downloadCSV } from '../lib/csv'
import { Card, Button, Select, Input, StatCard } from '../components/ui'
import { FileXls, FilePdf, Trophy, Star, Bank, DownloadSimple } from '@phosphor-icons/react'
import { DonutChart, CashFlowChart } from '../components/charts'

type Scope = 'month' | 'year' | 'all'

export default function Reports() {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).toArray() : []), [bid])
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const invoices = useLiveQuery(() => (bid ? ldb.invoices.where('businessId').equals(bid).toArray() : []), [bid])
  const [scope, setScope] = useState<Scope>('month')
  const [m, setM] = useState(currentMonthKey())

  const inScope = useMemo(() => {
    const year = String(new Date().getFullYear())
    return (date: string) => (scope === 'month' ? monthKey(date) === m : scope === 'year' ? date.startsWith(year) : true)
  }, [scope, m])
  const filtered = useMemo(() => (txs ?? []).filter((t) => inScope(t.date)), [txs, inScope])
  const scopedInvoices = useMemo(() => (invoices ?? []).filter((i) => inScope(i.date)), [invoices, inScope])

  if (!txs || !categories || !invoices) return <div className="text-slate-400">Cargando…</div>

  const products = topProducts(scopedInvoices, 8)
  const clients = topClients(scopedInvoices, txs, 5)
  const maxProduct = Math.max(1, ...products.map((p) => p.revenue))

  // Informe para crédito: últimos 12 meses
  function exportCredit() {
    if (!current || !txs || !invoices) return
    const months = lastMonths(12)
    const from = `${months[0]}-01`
    const inv12 = invoices.filter((i) => i.docType !== 'quote' && i.date >= from)
    const byInv = groupByInvoice(txs)
    const sums = inv12.map((i) => paymentSummary(i, byInv.get(i.id) ?? []))
    const totalInv = sums.reduce((s, x) => s + x.total, 0)
    const paidInv = sums.reduce((s, x) => s + x.paid, 0)
    const perClient = new Map<string, number>()
    for (const i of inv12) if (i.contactId) perClient.set(i.contactId, (perClient.get(i.contactId) ?? 0) + 1)
    creditReportPDF(
      {
        periodLabel: `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`,
        months: months.map((ym) => ({
          label: monthLabel(ym),
          sales: sumIn(txs, 'income', ym),
          collected: txs.filter((t) => t.kind === 'income' && t.status === 'paid' && monthKey(t.date) === ym).reduce((s, t) => s + t.amount, 0),
          expenses: sumIn(txs, 'expense', ym),
        })),
        invoicesCount: inv12.length,
        clientsCount: perClient.size,
        repeatClients: [...perClient.values()].filter((n) => n >= 2).length,
        collectionRate: totalInv > 0 ? (paidInv / totalInv) * 100 : 0,
        receivables: pendingTotals(txs).toCollect,
        topProducts: topProducts(inv12, 5),
        ownerName: current.ownerName,
      },
      { businessName: current.name, sector: current.sector, address: current.address, phone: current.phone, currency: current.currency, logo: current.logo },
    )
  }

  const income = sumIn(filtered, 'income')
  const expense = sumIn(filtered, 'expense')
  const net = income - expense

  const incomeCats = byCategory(filtered, categories, 'income')
  const expenseCats = byCategory(filtered, categories, 'expense')

  // Serie mensual del año (para año / todo)
  const yearMonths = Array.from({ length: 12 }, (_, i) => {
    const y = new Date().getFullYear()
    return `${y}-${String(i + 1).padStart(2, '0')}`
  })
  const monthly = monthlySeries(filtered, yearMonths).filter((m) => m.income || m.expense)

  const periodLabel =
    scope === 'month' ? monthLabel(m)
      : scope === 'year' ? `Año ${new Date().getFullYear()}`
      : 'Histórico completo'

  function exportPDF() {
    if (!current) return
    const biz: PdfBusiness = {
      businessName: current.name,
      sector: current.sector,
      address: current.address,
      phone: current.phone,
      currency: current.currency,
    }
    reportPDF(
      {
        periodLabel,
        totalIncome: income,
        totalExpense: expense,
        byIncomeCat: incomeCats,
        byExpenseCat: expenseCats,
        monthly: monthly.map((m) => ({ label: m.label, income: m.income, expense: m.expense })),
      },
      biz,
    )
  }

  function exportCSV() {
    const rows: (string | number)[][] = [
      [`Informe ${periodLabel}`],
      [],
      ['Ingresos totales', income],
      ['Gastos totales', expense],
      ['Beneficio neto', net],
      [],
      ['Ingresos por categoría', 'Importe'],
      ...incomeCats.map((c) => [c.name, c.amount] as (string | number)[]),
      [],
      ['Gastos por categoría', 'Importe'],
      ...expenseCats.map((c) => [c.name, c.amount] as (string | number)[]),
    ]
    downloadCSV(`informe-${periodLabel.replace(/\s+/g, '-')}.csv`, rows)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Informes</h1>
        <div className="flex flex-wrap gap-2">
          <div className="w-32">
            <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="month">Por mes</option>
              <option value="year">Este año</option>
              <option value="all">Todo</option>
            </Select>
          </div>
          {scope === 'month' && (
            <div className="w-40">
              <Input type="month" value={m} max={currentMonthKey()} onChange={(e) => setM(e.target.value || currentMonthKey())} />
            </div>
          )}
          <Button variant="outline" onClick={exportCSV}><FileXls size={18} /> Excel</Button>
          <Button onClick={exportPDF}><FilePdf size={18} /> PDF</Button>
        </div>
      </div>

      <p className="text-sm text-slate-500">Periodo: <b>{periodLabel}</b></p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Ingresos" value={money(income)} tone="good" />
        <StatCard label="Gastos" value={money(expense)} tone="bad" />
        <StatCard label="Beneficio neto" value={money(net)} tone={net >= 0 ? 'good' : 'bad'} />
      </div>

      {/* Más vendido y mejores clientes (salen de las facturas) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Trophy size={20} weight="duotone" className="text-amber-600" /> Lo más vendido</h2>
          {products.length === 0 ? (
            <p className="text-sm text-slate-400">Aparecerá cuando hagas facturas en este periodo.</p>
          ) : (
            <div className="space-y-2.5">
              {products.map((p, i) => (
                <div key={p.name}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700"><span className="text-slate-400">{i + 1}.</span> {p.name} <span className="text-xs text-slate-400">× {Math.round(p.qty)}</span></span>
                    <span className="ge-nums shrink-0 font-medium">{money(p.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.round((p.revenue / maxProduct) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Star size={20} weight="duotone" className="text-amber-500" /> Mejores clientes</h2>
          {clients.length === 0 ? (
            <p className="text-sm text-slate-400">Aparecerá cuando factures a clientes con nombre.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {clients.map((c) => (
                <li key={c.contactId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.count} factura{c.count > 1 ? 's' : ''}{c.owed > 0 ? ` · debe ${money(c.owed)}` : ''}</div>
                  </div>
                  <span className="ge-nums shrink-0 font-medium">{money(c.bought)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Informe para crédito */}
      <Card className="overflow-hidden p-0">
        <div className="grid items-center gap-0 sm:grid-cols-[1fr_1.1fr]">
          <img src="/ill/credito.webp" alt="" aria-hidden="true" className="h-44 w-full object-cover object-center sm:h-full" />
          <div className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Bank size={22} weight="duotone" className="text-teal-700" /> ¿Quieres pedir un crédito?</h2>
            <p className="mt-1 text-sm text-slate-600">Descarga tu historial de los últimos 12 meses (ventas, cobros, gastos y clientes) en un PDF para enseñarlo a un banco o microcrédito.</p>
            <Button onClick={exportCredit} className="mt-4 w-full sm:w-auto"><DownloadSimple size={18} weight="bold" /> Descargar mi historial</Button>
          </div>
        </div>
      </Card>

      {monthly.length > 1 && (
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">Evolución mensual</h2>
          <CashFlowChart data={monthly.map((m) => ({ label: m.label, income: m.income, expense: m.expense }))} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">Ingresos por categoría</h2>
          <DonutChart data={incomeCats} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">Gastos por categoría</h2>
          <DonutChart data={expenseCats} />
        </Card>
      </div>
    </div>
  )
}
