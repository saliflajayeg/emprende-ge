import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Contact, type Invoice, type DocType, type Transaction } from '../cloud/localdb'
import ClientProfile from '../components/ClientProfile'
import OldInvoiceForm from '../components/OldInvoiceForm'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, formatDate, todayISO } from '../lib/format'
import { invoicePDF, type InvoicePay } from '../lib/pdf'
import { shareInvoice } from '../lib/share'
import { addInvoicePayment, deleteInvoiceWithLedger, paymentSummary } from '../lib/invoiceLedger'
import InvoiceForm, { pdfBiz } from '../components/InvoiceForm'
import { Button, Card, Modal, Field, Input, Select, EmptyState, IconButton } from '../components/ui'

const DOC_LABEL: Record<DocType, string> = { invoice: 'Factura', receipt: 'Recibo', quote: 'Presupuesto' }
const METHODS = ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Otro']

const STATE_UI = {
  paid: { label: 'Pagada', cls: 'bg-teal-50 text-teal-700' },
  partial: { label: 'Abonada', cls: 'bg-sky-50 text-sky-700' },
  pending: { label: 'A deber', cls: 'bg-amber-50 text-amber-700' },
} as const

// Registrar un abono/cobro de una factura.
function PaymentForm({ inv, remaining, onDone }: { inv: Invoice; remaining: number; onDone: () => void }) {
  const bid = useBusiness().current?.id ?? ''
  const [amount, setAmount] = useState(String(remaining))
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState('Efectivo')
  const [busy, setBusy] = useState(false)
  const value = Math.min(Number(amount) || 0, remaining)

  async function save() {
    if (value <= 0) return
    setBusy(true)
    await addInvoicePayment(bid, inv, value, { date, method })
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="font-semibold text-slate-800">{DOC_LABEL[inv.docType]} {inv.number} · {inv.clientName}</div>
        <div className="text-slate-500">Debe <b className="text-amber-700">{money(remaining)}</b></div>
      </div>
      <Field label="¿Cuánto paga ahora?">
        <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="ge-nums text-lg" />
      </Field>
      <div className="flex gap-2">
        <button onClick={() => setAmount(String(remaining))} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 active:scale-95">Todo ({money(remaining)})</button>
        <button onClick={() => setAmount(String(Math.round(remaining / 2)))} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 active:scale-95">La mitad</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Cómo pagó">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
      </div>
      {value > 0 && value < remaining && <p className="text-xs text-slate-500">Seguirá debiendo {money(remaining - value)}.</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} disabled={busy || value <= 0} className="flex-1">{value >= remaining ? 'Marcar pagada' : 'Registrar abono'}</Button>
      </div>
    </div>
  )
}

type Filter = 'all' | 'owed' | 'paid'

export default function Invoices({ mode = 'invoices' }: { mode?: 'invoices' | 'quotes' } = {}) {
  const { current } = useBusiness()
  const { canDelete } = usePerms()
  const bid = current?.id ?? ''
  const all = useLiveQuery(
    () => (bid ? ldb.invoices.where('businessId').equals(bid).toArray().then((r) => r.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))) : []),
    [bid],
  )
  const ledgerTxs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).filter((t) => !!t.invoiceId).toArray() : []), [bid])
  const contacts = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).toArray() : []), [bid])
  const [modal, setModal] = useState<null | { inv?: Invoice }>(null)
  const [paying, setPaying] = useState<null | { inv: Invoice; remaining: number }>(null)
  const [profile, setProfile] = useState<Contact | null>(null)
  const [oldOpen, setOldOpen] = useState(false)
  const [viewPhoto, setViewPhoto] = useState<Invoice | null>(null)
  const [sharing, setSharing] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const isQuotes = mode === 'quotes'
  const allowedTypes: DocType[] = isQuotes ? ['quote'] : ['invoice', 'receipt']
  const defaultDocType: DocType = isQuotes ? 'quote' : 'invoice'
  const title = isQuotes ? 'Presupuestos' : 'Facturas y recibos'

  const txByInvoice = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of ledgerTxs ?? []) {
      const k = t.invoiceId as string
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [ledgerTxs])

  if (!all) return <div className="text-slate-400">Cargando…</div>

  const rows = all
    .filter((i) => allowedTypes.includes(i.docType))
    .map((inv) => ({ inv, s: paymentSummary(inv, txByInvoice.get(inv.id) ?? []) }))
  const owedTotal = isQuotes ? 0 : rows.reduce((s, r) => s + r.s.remaining, 0)
  const owedCount = rows.filter((r) => r.s.remaining > 0).length

  const shown = rows.filter(({ inv, s }) => {
    if (!isQuotes && filter === 'owed' && s.remaining <= 0) return false
    if (!isQuotes && filter === 'paid' && s.remaining > 0) return false
    const q = query.trim().toLowerCase()
    if (q && !`${inv.clientName} ${inv.number}`.toLowerCase().includes(q)) return false
    return true
  })

  const clientPhone = (inv: Invoice) => contacts?.find((c) => c.id === inv.contactId)?.phone
  const payOf = (inv: Invoice, s: ReturnType<typeof paymentSummary>): InvoicePay | undefined =>
    inv.docType === 'quote' ? undefined : { paid: s.paid, remaining: s.remaining }

  async function sendWhatsApp(inv: Invoice, s: ReturnType<typeof paymentSummary>) {
    if (!current) return
    setSharing(inv.id)
    try { await shareInvoice(inv, pdfBiz(current), clientPhone(inv), payOf(inv, s)) } catch { /* cancelado */ }
    setSharing(null)
  }

  // Recordar la deuda por WhatsApp
  function remind(inv: Invoice, remaining: number) {
    const digits = (clientPhone(inv) || '').replace(/[^0-9]/g, '')
    const msg = `Hola ${inv.clientName}, te recordamos amablemente que tienes pendiente ${money(remaining)} de la ${DOC_LABEL[inv.docType].toLowerCase()} ${inv.number}${current?.name ? ` de ${current.name}` : ''}. ¡Gracias!`
    const base = digits.length >= 8 ? `https://wa.me/${digits}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  async function remove(inv: Invoice) {
    const hasMoney = (txByInvoice.get(inv.id) ?? []).length > 0
    if (!confirm(hasMoney ? '¿Eliminar este documento y sus cobros/deuda de la caja?' : '¿Eliminar este documento?')) return
    await deleteInvoiceWithLedger(bid, inv)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <div className="flex flex-wrap gap-2">
          {!isQuotes && <Button variant="outline" onClick={() => setOldOpen(true)}>📒 Facturas antiguas</Button>}
          <Button onClick={() => setModal({})}>+ {isQuotes ? 'Nuevo presupuesto' : 'Nueva factura'}</Button>
        </div>
      </div>

      {!isQuotes && rows.length > 0 && (
        <Card className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Por cobrar</div>
            <div className={`ge-nums text-2xl font-bold ${owedTotal > 0 ? 'text-amber-600' : 'text-teal-600'}`}>{money(owedTotal)}</div>
          </div>
          <div className="text-right text-sm text-slate-500">
            {owedCount > 0 ? `${owedCount} factura${owedCount > 1 ? 's' : ''} sin cobrar del todo` : 'Todo cobrado ✓'}
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {!isQuotes && ([['all', 'Todas'], ['owed', 'A deber'], ['paid', 'Pagadas']] as [Filter, string][]).map(([f, lbl]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-transform active:scale-95 ${filter === f ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
              {lbl}
            </button>
          ))}
          <div className="min-w-[160px] flex-1">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente o número…" />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={isQuotes ? 'Sin presupuestos' : 'Aún no tienes facturas'}
          hint={isQuotes ? 'Crea un presupuesto y envíalo por WhatsApp.' : 'Crea tu primera factura en segundos y envíala por WhatsApp. Tus ventas, clientes y deudas se apuntan solos.'}
        />
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-400">No hay documentos con este filtro.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ inv, s }) => {
            const ui = STATE_UI[s.state]
            return (
              <Card key={inv.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs uppercase text-slate-400">
                      {inv.origin === 'talonario' ? '📒 Talonario' : DOC_LABEL[inv.docType]} · {inv.number}
                    </div>
                    {inv.contactId && contacts?.some((c) => c.id === inv.contactId) ? (
                      <button onClick={() => setProfile(contacts?.find((c) => c.id === inv.contactId) ?? null)} className="block max-w-full truncate text-left font-semibold text-teal-800 underline decoration-teal-200 underline-offset-2">
                        {inv.clientName}
                      </button>
                    ) : (
                      <div className="truncate font-semibold text-slate-800">{inv.clientName}</div>
                    )}
                    <div className="text-sm text-slate-500">{formatDate(inv.date)}</div>
                  </div>
                  {isQuotes ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${inv.status === 'paid' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                      {inv.status === 'paid' ? 'Aceptado' : 'Pendiente'}
                    </span>
                  ) : (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
                  )}
                </div>

                <div className="ge-nums mt-3 text-xl font-bold text-teal-700">{money(s.total)}</div>
                {!isQuotes && s.remaining > 0 && (
                  <div className="text-sm text-amber-700">
                    {s.paid > 0 && <span className="text-slate-500">Pagado {money(s.paid)} · </span>}
                    Debe <b>{money(s.remaining)}</b>
                  </div>
                )}

                {!isQuotes && s.remaining > 0 && (
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => setPaying({ inv, remaining: s.remaining })} className="flex-1">💵 Registrar pago</Button>
                    <button onClick={() => remind(inv, s.remaining)} title="Recordar la deuda por WhatsApp"
                      className="grid w-11 shrink-0 place-items-center rounded-lg bg-[#25D366] text-white active:scale-95">🔔</button>
                  </div>
                )}

                <Button className="mt-2 w-full !bg-[#25D366] hover:!bg-[#1ebe5b]" onClick={() => sendWhatsApp(inv, s)} disabled={sharing === inv.id}>
                  {sharing === inv.id ? 'Preparando…' : '📲 Enviar por WhatsApp'}
                </Button>
                <div className="mt-2 flex items-center gap-1">
                  {inv.photo
                    ? <Button variant="outline" className="flex-1" onClick={() => setViewPhoto(inv)}>📷 Ver foto</Button>
                    : <Button variant="outline" className="flex-1" onClick={() => current && invoicePDF(inv, pdfBiz(current), payOf(inv, s))}>⬇ PDF</Button>}
                  <IconButton onClick={() => setModal({ inv })} title="Editar">✎</IconButton>
                  {canDelete && <IconButton onClick={() => remove(inv)} title="Eliminar" className="text-slate-400 hover:text-red-600">🗑</IconButton>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal?.inv ? 'Editar documento' : isQuotes ? 'Nuevo presupuesto' : 'Nueva factura'}>
        {modal && <InvoiceForm existing={modal.inv} allowedTypes={allowedTypes} defaultDocType={defaultDocType} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={oldOpen} onClose={() => setOldOpen(false)} title="📒 Facturas antiguas del talonario">
        {oldOpen && <OldInvoiceForm onDone={() => setOldOpen(false)} />}
      </Modal>
      <Modal open={viewPhoto !== null} onClose={() => setViewPhoto(null)} title={viewPhoto ? `Talonario · ${viewPhoto.number}` : ''}>
        {viewPhoto?.photo && (
          <div className="space-y-3">
            <img src={viewPhoto.photo} alt="Hoja del talonario" className="w-full rounded-lg" />
            <a href={viewPhoto.photo} download={`talonario-${viewPhoto.number}.jpg`} className="block text-center text-sm font-medium text-teal-700">⬇ Descargar foto</a>
          </div>
        )}
      </Modal>
      <Modal open={profile !== null} onClose={() => setProfile(null)} title="Ficha del cliente">
        {profile && <ClientProfile contact={profile} onEdit={() => setProfile(null)} />}
      </Modal>
      <Modal open={paying !== null} onClose={() => setPaying(null)} title="Registrar pago">
        {paying && <PaymentForm inv={paying.inv} remaining={paying.remaining} onDone={() => setPaying(null)} />}
      </Modal>
    </div>
  )
}
