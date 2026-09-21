import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Kind } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, currentMonthKey, monthLabel, lastMonths } from '../lib/format'
import { sumIn, monthlySeries, byCategory, pendingTotals } from '../lib/analytics'
import { StatCard, Card, Button, Modal, EmptyState } from '../components/ui'
import { CashFlowChart, DonutChart } from '../components/charts'
import TxForm from '../components/TxForm'

export default function Dashboard() {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).toArray() : []), [bid])
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const [modal, setModal] = useState<null | Kind>(null)

  if (!txs || !categories) return <div className="text-slate-400">Cargando…</div>

  const month = currentMonthKey()
  const incomeMonth = sumIn(txs, 'income', month)
  const expenseMonth = sumIn(txs, 'expense', month)
  const net = incomeMonth - expenseMonth
  const margin = incomeMonth > 0 ? Math.round((net / incomeMonth) * 100) : 0

  const series = monthlySeries(txs, lastMonths(6))
  const expenseCats = byCategory(txs, categories, 'expense', month)
  const { toCollect, toPay, overdue } = pendingTotals(txs)

  const alerts: { tone: string; text: string }[] = []
  if (net < 0) alerts.push({ tone: 'bad', text: `Este mes tu saldo es negativo (${money(net)}). Revisa tus gastos.` })
  if (toCollect > 0) alerts.push({ tone: 'warn', text: `Tienes ${money(toCollect)} por cobrar a clientes.` })
  if (toPay > 0) alerts.push({ tone: 'warn', text: `Tienes ${money(toPay)} pendientes de pagar a proveedores.` })
  if (overdue.length > 0) alerts.push({ tone: 'bad', text: `${overdue.length} pago(s) vencido(s) sin resolver.` })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Panel</h1>
          <p className="text-sm text-slate-500">{current?.name} · {monthLabel(month)}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setModal('income')}>+ Ingreso</Button>
          <Button variant="danger" onClick={() => setModal('expense')}>+ Gasto</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ingresos del mes" value={money(incomeMonth)} tone="good" />
        <StatCard label="Gastos del mes" value={money(expenseMonth)} tone="bad" />
        <StatCard label="Beneficio neto" value={money(net)} tone={net >= 0 ? 'good' : 'bad'} />
        <StatCard label="Margen" value={`${margin}%`} hint={net >= 0 ? 'Negocio positivo' : 'En pérdidas'} />
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${a.tone === 'bad' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <span>{a.tone === 'bad' ? '⚠️' : '🔔'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Flujo de caja (últimos 6 meses)</h2>
        </div>
        <CashFlowChart data={series} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">Gastos por categoría ({monthLabel(month)})</h2>
          <DonutChart data={expenseCats} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">Cobros y pagos pendientes</h2>
          {toCollect === 0 && toPay === 0 ? (
            <EmptyState title="Todo al día" hint="No tienes cobros ni pagos pendientes." />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-teal-50 px-4 py-3">
                <span className="text-sm text-teal-800">Por cobrar (clientes)</span>
                <span className="font-bold text-teal-700">{money(toCollect)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
                <span className="text-sm text-red-800">Por pagar (proveedores)</span>
                <span className="font-bold text-red-600">{money(toPay)}</span>
              </div>
              {overdue.length > 0 && <p className="text-xs text-red-500">⚠️ {overdue.length} vencido(s).</p>}
            </div>
          )}
        </Card>
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'income' ? 'Registrar ingreso' : 'Registrar gasto'}>
        {modal && <TxForm kind={modal} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
