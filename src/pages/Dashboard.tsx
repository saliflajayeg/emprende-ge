import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ldb, type Kind, type Transaction } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, todayISO, currentMonthKey, formatDate } from '../lib/format'
import { pendingTotals, sumIn } from '../lib/analytics'
import { invoiceTotals } from '../lib/pdf'
import { paymentSummary } from '../lib/invoiceLedger'
import { modulesFor, usesQuickExpense, type ModuleId } from '../modules'
import { Card, Button, Modal, EmptyState } from '../components/ui'
import { Receipt, ArrowRight, HandCoins, Wallet, PlusCircle, WarningCircle } from '@phosphor-icons/react'
import TxForm from '../components/TxForm'
import QuickExpenseForm from '../components/QuickExpenseForm'
import PendingRequests from '../components/PendingRequests'
import ActivityCards from '../components/ActivityCards'
import PersonalPanel from '../components/PersonalPanel'
import InvoiceForm from '../components/InvoiceForm'
import MonthPanel from '../components/MonthPanel'

const STATE_UI = {
  paid: { label: 'Pagada', cls: 'bg-teal-50 text-teal-700' },
  partial: { label: 'Abonada', cls: 'bg-amber-50 text-amber-800' },
  pending: { label: 'Debe', cls: 'bg-amber-50 text-amber-800' },
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
  const rawDate = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1) // "Martes, 13 de octubre"
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = (current?.ownerName ?? '').trim().split(/\s+/)[0]

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
            <p className="text-sm text-slate-500">{dateLabel}</p>
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
      {/* Saludo + lo vendido hoy, con la ilustración de la emprendedora */}
      <section className="relative overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(43,39,34,0.05),0_12px_32px_-16px_rgba(43,39,34,0.25)] ring-1 ring-slate-200/70">
        <img src="/ill/hero-vendedora.webp" alt="" aria-hidden="true" className="absolute inset-y-0 right-0 h-full w-[68%] select-none object-cover object-[78%_35%]" draggable={false} />
        <div className="absolute inset-0 bg-gradient-to-r from-white from-35% via-white/85 via-55% to-white/0" />
        <div className="relative max-w-[62%] p-5">
          <p className="text-sm font-semibold text-slate-500">{greeting}{firstName ? `, ${firstName}` : ''}</p>
          <p className="text-xs text-slate-400">{dateLabel}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-teal-700">Vendido hoy</p>
          <p className="ge-nums font-display whitespace-nowrap text-[2.05rem] font-extrabold leading-none tracking-tight text-slate-900">{money(soldToday)}</p>
          {cashToday > 0 && <p className="mt-1.5 text-sm text-slate-600">Cobrado: <span className="ge-nums font-bold text-teal-700">{money(cashToday)}</span></p>}
        </div>
      </section>

      {/* Acción principal: facturar */}
      <button
        onClick={() => setInvoiceOpen(true)}
        className="group flex w-full items-center gap-4 rounded-3xl bg-teal-700 p-4 pr-5 text-left text-white shadow-[0_14px_30px_-14px_rgba(15,118,110,0.9)] transition-transform duration-100 ease-out active:scale-[0.98]"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15"><Receipt size={30} weight="fill" /></span>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-xl font-bold leading-tight">Nueva factura</span>
          <span className="block text-sm text-teal-100">En segundos, y la envías por WhatsApp</span>
        </span>
        <ArrowRight size={22} weight="bold" className="text-teal-200 transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* Por cobrar / gastos de hoy */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/facturas')} className="rounded-2xl bg-white p-4 text-left shadow-[0_8px_24px_-14px_rgba(43,39,34,0.2)] ring-1 ring-slate-200/70 transition-transform active:scale-[0.98]">
          <span className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${toCollect > 0 ? 'bg-amber-100 text-amber-700' : 'bg-teal-50 text-teal-700'}`}><HandCoins size={20} weight="fill" /></span>
          <div className="text-xs font-semibold text-slate-500">Te deben</div>
          <div className={`ge-nums text-lg font-extrabold ${toCollect > 0 ? 'text-amber-700' : 'text-teal-700'}`}>{money(toCollect)}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-400">Ver quién debe →</div>
        </button>
        <button onClick={() => setModal('expense')} className="rounded-2xl bg-white p-4 text-left shadow-[0_8px_24px_-14px_rgba(43,39,34,0.2)] ring-1 ring-slate-200/70 transition-transform active:scale-[0.98]">
          <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600"><Wallet size={20} weight="fill" /></span>
          <div className="text-xs font-semibold text-slate-500">Gastos hoy</div>
          <div className="ge-nums text-lg font-extrabold text-slate-900">{money(expenseToday)}</div>
          <div className="mt-0.5 text-xs font-semibold text-teal-700">+ Apuntar gasto</div>
        </button>
      </div>
      <button onClick={() => setModal('income')} className="flex min-h-10 items-center gap-1.5 text-sm font-semibold text-teal-700">
        <PlusCircle size={18} weight="bold" /> Apuntar otro ingreso (sin factura)
      </button>

      <PendingRequests />

      {/* Citas, trabajos, alquileres, fichas… según el negocio */}
      <ActivityCards bid={bid} enabled={enabled} businessType={current?.businessType} recordsLabel={current?.recordsLabel} hideMoney />

      {/* Avisos importantes */}
      {(monthNet < 0 || overdue.length > 0) && (
        <div className="space-y-2">
          {monthNet < 0 && (
            <div className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-100">
              <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red-500" />
              <span>Este mes has gastado más de lo que has ingresado (<b className="ge-nums">{money(monthNet)}</b>).</span>
            </div>
          )}
          {overdue.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-100">
              <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red-500" />
              <span>{overdue.length} pago(s) vencido(s) sin resolver.</span>
            </div>
          )}
        </div>
      )}

      {/* Últimas facturas */}
      {latest.length === 0 ? (
        <EmptyState
          image="/ill/facturas.webp"
          title="Tu primera factura, en segundos"
          hint="Olvídate del talonario de papel. Tus facturas quedan guardadas y ordenadas para siempre."
          action={<Button onClick={() => setInvoiceOpen(true)}><Receipt size={18} weight="fill" /> Hacer una factura</Button>}
        />
      ) : (
        <Card className="p-0">
          <div className="flex items-center justify-between px-4 pb-1 pt-4">
            <h2 className="text-base font-bold text-slate-900">Últimas facturas</h2>
            <button onClick={() => navigate('/facturas')} className="flex min-h-9 items-center gap-1 text-sm font-semibold text-teal-700">Ver todas <ArrowRight size={14} weight="bold" /></button>
          </div>
          <ul className="divide-y divide-slate-100 px-4 pb-2">
            {latest.map(({ inv, s }) => (
              <li key={inv.id}>
                <button onClick={() => navigate('/facturas', { state: { openInvoice: inv.id } })} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 font-display text-sm font-bold text-slate-600">
                    {(inv.clientName || '?').trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{inv.clientName}</div>
                    <div className="ge-nums text-xs text-slate-500">{formatDate(inv.date)} · {money(s.total)}</div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${STATE_UI[s.state].cls}`}>
                    {s.state === 'pending' || s.state === 'partial' ? `Debe ${money(s.remaining)}` : STATE_UI[s.state].label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Contabilidad del mes */}
      <MonthPanel txs={txs} categories={categories} invoices={invoices} />

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Nueva factura">
        {invoiceOpen && <InvoiceForm onDone={afterInvoice} />}
      </Modal>
      {expenseModal}
    </div>
  )
}
