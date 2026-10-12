import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ldb, type Kind, type Transaction } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, todayISO, currentMonthKey } from '../lib/format'
import { pendingTotals, sumIn } from '../lib/analytics'
import { invoiceTotals } from '../lib/pdf'
import { paymentSummary } from '../lib/invoiceLedger'
import { modulesFor, usesQuickExpense, type ModuleId } from '../modules'
import { Card, Button, Modal } from '../components/ui'
import TxForm from '../components/TxForm'
import QuickExpenseForm from '../components/QuickExpenseForm'
import PendingRequests from '../components/PendingRequests'
import ActivityCards from '../components/ActivityCards'
import PersonalPanel from '../components/PersonalPanel'
import InvoiceForm from '../components/InvoiceForm'
import MonthPanel from '../components/MonthPanel'

const STATE_UI = {
  paid: { label: 'Pagada', cls: 'bg-teal-50 text-teal-700' },
  partial: { label: 'Abonada', cls: 'bg-sky-50 text-sky-700' },
  pending: { label: 'Debe', cls: 'bg-amber-50 text-amber-700' },
} as const

export default function Dashboard() {
  const { current, updateBusiness } = useBusiness()
  const navigate = useNavigate()
  const bid = current?.id ?? ''
  const enabled = (current?.enabledModules as ModuleId[] | undefined) ?? modulesFor(current?.businessType)
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).toArray() : []), [bid])
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const invoices = useLiveQuery(() => (bid ? ldb.invoices.where('businessId').equals(bid).toArray() : []), [bid])
  const [modal, setModal] = useState<null | Kind>(null)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const isPersonal = current?.businessType === 'personal'

  // Al crear la primera factura desde el panel, activa la sección Facturas si
  // el negocio no la tenía (para poder ver el historial).
  async function afterInvoice() {
    setInvoiceOpen(false)
    if (!enabled.includes('invoices')) {
      try { await updateBusiness({ enabledModules: [...enabled, 'invoices'] }) } catch { /* sin conexión: se hará luego */ }
    }
  }

  if (!txs || !categories || !invoices) return <div className="text-slate-400">Cargando…</div>

  const today = todayISO()
  const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  // --- Hoy ---
  const docs = invoices.filter((i) => i.docType !== 'quote')
  const byInv = new Map<string, Transaction[]>()
  for (const t of txs) if (t.invoiceId) byInv.set(t.invoiceId, [...(byInv.get(t.invoiceId) ?? []), t])
  // Vendido hoy = facturas de hoy + otras ventas de hoy apuntadas a mano
  const soldToday =
    docs.filter((i) => i.date === today).reduce((s, i) => s + invoiceTotals(i).total, 0) +
    txs.filter((t) => t.kind === 'income' && !t.invoiceId && t.date === today).reduce((s, t) => s + t.amount, 0)
  const cashToday = txs.filter((t) => t.kind === 'income' && t.status === 'paid' && t.date === today).reduce((s, t) => s + t.amount, 0)
  const expenseToday = txs.filter((t) => t.kind === 'expense' && t.date === today).reduce((s, t) => s + t.amount, 0)
  const { toCollect, overdue } = pendingTotals(txs)

  const latest = [...docs]
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
    .slice(0, 5)
    .map((inv) => ({ inv, s: paymentSummary(inv, byInv.get(inv.id) ?? []) }))

  const monthNet = sumIn(txs, 'income', currentMonthKey()) - sumIn(txs, 'expense', currentMonthKey())

  const expenseModal = (
    <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'income' ? 'Registrar ingreso' : 'Registrar gasto'}>
      {modal === 'expense' && usesQuickExpense(current?.businessType) ? (
        <QuickExpenseForm onDone={() => setModal(null)} />
      ) : (
        modal && <TxForm kind={modal} onDone={() => setModal(null)} />
      )}
    </Modal>
  )

  // Cuentas personales: su propio panel sencillo
  if (isPersonal) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm capitalize text-slate-500">{dateLabel}</p>
            <h1 className="text-2xl font-bold text-slate-800">Mis cuentas</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setModal('income')}>+ Ingreso</Button>
            <Button variant="danger" onClick={() => setModal('expense')}>+ Gasto</Button>
          </div>
        </div>
        <PersonalPanel bid={bid} />
        <MonthPanel txs={txs} categories={categories} invoices={invoices} />
        {expenseModal}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Hoy */}
      <div>
        <p className="text-sm capitalize text-slate-500">{dateLabel}</p>
        <div className="mt-1 text-sm text-slate-500">Vendido hoy</div>
        <div className="ge-nums text-4xl font-bold leading-tight text-slate-900">{money(soldToday)}</div>
        {cashToday > 0 && <div className="text-sm text-slate-500">Cobrado hoy: <span className="ge-nums font-medium text-teal-700">{money(cashToday)}</span></div>}
      </div>

      {/* Acción principal */}
      <button
        onClick={() => setInvoiceOpen(true)}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-teal-700 px-4 py-4 text-lg font-bold text-white shadow-sm transition-transform duration-100 ease-out active:scale-[0.98]"
      >
        <span className="text-2xl">🧾</span> Nueva factura
      </button>

      {/* Por cobrar / gastos de hoy */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/facturas')} className="rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 transition-transform active:scale-[0.98]">
          <div className="text-xs text-slate-500">Por cobrar</div>
          <div className={`ge-nums text-lg font-bold ${toCollect > 0 ? 'text-amber-600' : 'text-teal-700'}`}>{money(toCollect)}</div>
          <div className="text-xs text-slate-400">Ver quién debe ›</div>
        </button>
        <button onClick={() => setModal('expense')} className="rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 transition-transform active:scale-[0.98]">
          <div className="text-xs text-slate-500">Gastos hoy</div>
          <div className="ge-nums text-lg font-bold text-red-600">{money(expenseToday)}</div>
          <div className="text-xs text-slate-400">+ Apuntar gasto</div>
        </button>
      </div>
      <button onClick={() => setModal('income')} className="text-sm font-medium text-teal-700">+ Apuntar otro ingreso (sin factura)</button>

      <PendingRequests />

      {/* Citas, trabajos, alquileres, fichas… según el negocio */}
      <ActivityCards bid={bid} enabled={enabled} businessType={current?.businessType} recordsLabel={current?.recordsLabel} hideMoney />

      {/* Avisos importantes */}
      {(monthNet < 0 || overdue.length > 0) && (
        <div className="space-y-2">
          {monthNet < 0 && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">⚠️ Este mes gastas más de lo que ingresas ({money(monthNet)}).</div>}
          {overdue.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">⚠️ {overdue.length} pago(s) vencido(s) sin resolver.</div>}
        </div>
      )}

      {/* Últimas facturas */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-sm font-semibold text-slate-700">Últimas facturas</h2>
          {latest.length > 0 && <button onClick={() => navigate('/facturas')} className="text-xs font-medium text-teal-700">Ver todas ›</button>}
        </div>
        {latest.length === 0 ? (
          <p className="px-4 pb-4 pt-2 text-sm text-slate-400">Aún no has hecho ninguna. Pulsa «Nueva factura» para empezar.</p>
        ) : (
          <ul className="divide-y divide-slate-100 px-4 pb-1">
            {latest.map(({ inv, s }) => (
              <li key={inv.id}>
                <button onClick={() => navigate('/facturas')} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{inv.clientName}</div>
                    <div className="ge-nums text-xs text-slate-400">{money(s.total)}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_UI[s.state].cls}`}>
                    {s.state === 'pending' || s.state === 'partial' ? `Debe ${money(s.remaining)}` : STATE_UI[s.state].label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Contabilidad del mes */}
      <MonthPanel txs={txs} categories={categories} invoices={invoices} />

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Nueva factura">
        {invoiceOpen && <InvoiceForm onDone={afterInvoice} />}
      </Modal>
      {expenseModal}
    </div>
  )
}
