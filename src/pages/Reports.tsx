import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { money, monthLabel, currentMonthKey, monthKey } from '../lib/format'
import { sumIn, byCategory, monthlySeries } from '../lib/analytics'
import { reportPDF } from '../lib/pdf'
import { downloadCSV } from '../lib/csv'
import { useSettings } from '../lib/hooks'
import { Card, Button, Select, StatCard } from '../components/ui'
import { DonutChart, CashFlowChart } from '../components/charts'

type Scope = 'month' | 'year' | 'all'

export default function Reports() {
  const settings = useSettings()
  const txs = useLiveQuery(() => db.transactions.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const [scope, setScope] = useState<Scope>('month')

  const filtered = useMemo(() => {
    if (!txs) return []
    const now = new Date()
    return txs.filter((t) => {
      if (scope === 'month') return monthKey(t.date) === currentMonthKey()
      if (scope === 'year') return t.date.startsWith(String(now.getFullYear()))
      return true
    })
  }, [txs, scope])

  if (!txs || !categories) return <div className="text-slate-400">Cargando…</div>

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
    scope === 'month' ? monthLabel(currentMonthKey())
      : scope === 'year' ? `Año ${new Date().getFullYear()}`
      : 'Histórico completo'

  function exportPDF() {
    if (!settings) return
    reportPDF(
      {
        periodLabel,
        totalIncome: income,
        totalExpense: expense,
        byIncomeCat: incomeCats,
        byExpenseCat: expenseCats,
        monthly: monthly.map((m) => ({ label: m.label, income: m.income, expense: m.expense })),
      },
      settings,
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
          <div className="w-36">
            <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
              <option value="all">Todo</option>
            </Select>
          </div>
          <Button variant="outline" onClick={exportCSV}>⬇ Excel/CSV</Button>
          <Button onClick={exportPDF}>⬇ PDF</Button>
        </div>
      </div>

      <p className="text-sm text-slate-500">Periodo: <b>{periodLabel}</b></p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Ingresos" value={money(income)} tone="good" />
        <StatCard label="Gastos" value={money(expense)} tone="bad" />
        <StatCard label="Beneficio neto" value={money(net)} tone={net >= 0 ? 'good' : 'bad'} />
      </div>

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
