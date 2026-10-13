import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Contact, type Invoice, type DocType, type Transaction } from '../cloud/localdb'
import ClientProfile from '../components/ClientProfile'
import { Notebook, Plus, HandCoins, BellRinging, WhatsappLogo, Camera, FilePdf, PencilSimple, Trash, DownloadSimple, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import OldInvoiceForm from '../components/OldInvoiceForm'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, formatDate, todayISO } from '../lib/format'
import { invoicePDF, type InvoicePay } from '../lib/pdf'
import { shareInvoice } from '../lib/share'
import { addInvoicePayment, deleteInvoiceWithLedger, paymentSummary } from '../lib/invoiceLedger'
import InvoiceForm, { pdfBiz } from '../components/InvoiceForm'
import { Button, Card, Modal, Field, Input, Select, EmptyState } from '../components/ui'

const DOC_LABEL: Record<DocType, string> = { invoice: 'Factura', receipt: 'Recibo', quote: 'Presupuesto' }
const METHODS = ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Otro']

const STATE_UI = {
  paid: { label: 'Pagada', cls: 'bg-teal-50 text-teal-700' },
  partial: { label: 'Abonada', cls: 'bg-amber-50 text-amber-800' },
  pending: { label: 'A deber', cls: 'bg-amber-50 text-amber-800' },
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
  const [detailId, setDetailId] = useState<string | null>(null)
  const [sharing, setSharing] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const isQuotes = mode === 'quotes'
  const allowedTypes: DocType[] = isQuotes ? ['quote'] : ['invoice', 'receipt']
  const defaultDocType: DocType = isQuotes ? 'quote' : 'invoice'

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

  // Factura abierta en la ficha de acciones (se busca en vivo para reflejar pagos)
  const detailRow = detailId ? rows.find((r) => r.inv.id === detailId) ?? null : null

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight text-slate-900">{isQuotes ? 'Presupuestos' : 'Facturas'}</h1>
          <p className="text-sm text-slate-500">{rows.length} {isQuotes ? 'presupuesto' : 'documento'}{rows.length === 1 ? '' : 's'}</p>
        </div>
        <Button onClick={() => setModal({})} className="shrink-0"><Plus size={18} weight="bold" /> {isQuotes ? 'Nuevo' : 'Nueva'}</Button>
      </div>

      {!isQuotes && rows.length > 0 && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-3xl bg-white p-4 shadow-[0_8px_24px_-14px_rgba(43,39,34,0.2)] ring-1 ring-slate-200/70">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${owedTotal > 0 ? 'bg-amber-100 text-amber-700' : 'bg-teal-50 text-teal-700'}`}><HandCoins size={24} weight="fill" /></span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-500">Te deben</div>
              <div className={`ge-nums truncate text-xl font-extrabold ${owedTotal > 0 ? 'text-amber-700' : 'text-teal-700'}`}>{money(owedTotal)}</div>
            </div>
          </div>
          <div className="text-right text-xs font-semibold text-slate-500">
            {owedCount > 0 ? <>{owedCount} factura{owedCount > 1 ? 's' : ''}<br />sin cobrar del todo</> : 'Todo cobrado'}
          </div>
        </div>
      )}

      {!isQuotes && (
        <button onClick={() => setOldOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-slate-100/80 p-3 text-left transition-transform active:scale-[0.99]">
          <img src="/ill/talonario.webp" alt="" aria-hidden="true" className="h-12 w-14 shrink-0 rounded-xl object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800">¿Tienes facturas en papel?</span>
            <span className="block text-xs text-slate-500">Pásalas a la app con una foto o solo el total</span>
          </span>
          <CaretRight size={18} weight="bold" className="shrink-0 text-slate-400" />
        </button>
      )}

      {rows.length > 0 && (
        <div className="space-y-2.5">
          <div className="relative">
            <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente o número…" className="pl-10" />
          </div>
          {!isQuotes && (
            <div className="flex gap-2">
              {([['all', 'Todas'], ['owed', 'Me deben'], ['paid', 'Pagadas']] as [Filter, string][]).map(([f, lbl]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-[transform,background-color] active:scale-95 ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          image={isQuotes ? undefined : '/ill/facturas.webp'}
          title={isQuotes ? 'Sin presupuestos' : 'Tu primera factura, en segundos'}
          hint={isQuotes ? 'Crea un presupuesto y envíalo por WhatsApp.' : 'Olvídate del talonario. Tus ventas, clientes y deudas se apuntan solos.'}
          action={<Button onClick={() => setModal({})}><Plus size={18} weight="bold" /> {isQuotes ? 'Nuevo presupuesto' : 'Hacer una factura'}</Button>}
        />
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No hay documentos con este filtro.</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {shown.map(({ inv, s }) => {
              const ui = STATE_UI[s.state]
              return (
                <li key={inv.id}>
                  <button onClick={() => setDetailId(inv.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-base font-bold ${inv.origin === 'talonario' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-800'}`}>
                      {inv.origin === 'talonario' ? <Notebook size={20} weight="duotone" /> : (inv.clientName || '?').trim().slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-slate-900">{inv.clientName}</span>
                      <span className="block truncate text-xs text-slate-500">{inv.origin === 'talonario' ? 'Talonario' : DOC_LABEL[inv.docType]} {inv.number} · {formatDate(inv.date)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="ge-nums block text-[15px] font-extrabold text-slate-900">{money(s.total)}</span>
                      {isQuotes ? (
                        <span className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ${inv.status === 'paid' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>{inv.status === 'paid' ? 'Aceptado' : 'Pendiente'}</span>
                      ) : (
                        <span className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ${ui.cls}`}>{s.remaining > 0 ? `Debe ${money(s.remaining)}` : ui.label}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Ficha de la factura con todas las acciones */}
      <Modal open={detailRow !== null} onClose={() => setDetailId(null)} title={detailRow ? `${detailRow.inv.origin === 'talonario' ? 'Talonario' : DOC_LABEL[detailRow.inv.docType]} ${detailRow.inv.number}` : ''}>
        {detailRow && (() => {
          const { inv, s } = detailRow
          const contact = inv.contactId ? contacts?.find((c) => c.id === inv.contactId) : undefined
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 font-display text-lg font-bold text-teal-800">{(inv.clientName || '?').trim().slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold text-slate-900">{inv.clientName}</div>
                  <div className="text-sm text-slate-500">{formatDate(inv.date)}{contact?.phone ? ` · ${contact.phone}` : ''}</div>
                </div>
                {contact && (
                  <button onClick={() => { setDetailId(null); setProfile(contact) }} className="flex min-h-9 items-center gap-1 rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700">Ficha <CaretRight size={12} weight="bold" /></button>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                {inv.items.length > 0 && inv.origin !== 'talonario' && (
                  <ul className="mb-3 space-y-1.5 border-b border-slate-200 pb-3 text-sm">
                    {inv.items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate text-slate-700">{it.qty} × {it.description || 'Concepto'}</span>
                        <span className="ge-nums shrink-0 font-semibold text-slate-900">{money(it.qty * it.price)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-slate-500">Total</span>
                  <span className="ge-nums font-display text-2xl font-extrabold text-slate-900">{money(s.total)}</span>
                </div>
                {!isQuotes && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-500">Pagado {money(s.paid)}</span>
                    {s.remaining > 0 ? <span className="font-bold text-amber-700">Debe {money(s.remaining)}</span> : <span className="font-bold text-teal-700">Pagada</span>}
                  </div>
                )}
              </div>

              {!isQuotes && s.remaining > 0 && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button onClick={() => setPaying({ inv, remaining: s.remaining })}><HandCoins size={18} weight="fill" /> Registrar pago</Button>
                  <Button variant="outline" onClick={() => remind(inv, s.remaining)}><BellRinging size={18} weight="fill" className="text-amber-600" /> Recordar</Button>
                </div>
              )}
              <Button onClick={() => sendWhatsApp(inv, s)} disabled={sharing === inv.id} className="w-full !bg-[#1DA851] hover:!bg-[#178f45]">
                <WhatsappLogo size={20} weight="fill" /> {sharing === inv.id ? 'Preparando…' : 'Enviar por WhatsApp'}
              </Button>
              <div className="grid grid-cols-3 gap-2">
                {inv.photo
                  ? <Button variant="outline" onClick={() => setViewPhoto(inv)}><Camera size={18} /> Foto</Button>
                  : <Button variant="outline" onClick={() => current && invoicePDF(inv, pdfBiz(current), payOf(inv, s))}><FilePdf size={18} /> PDF</Button>}
                <Button variant="outline" onClick={() => { setDetailId(null); setModal({ inv }) }}><PencilSimple size={18} /> Editar</Button>
                {canDelete
                  ? <Button variant="outline" onClick={async () => { await remove(inv); setDetailId(null) }} className="!text-red-600"><Trash size={18} /> Borrar</Button>
                  : <span />}
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal?.inv ? 'Editar documento' : isQuotes ? 'Nuevo presupuesto' : 'Nueva factura'}>
        {modal && <InvoiceForm existing={modal.inv} allowedTypes={allowedTypes} defaultDocType={defaultDocType} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={oldOpen} onClose={() => setOldOpen(false)} title="Facturas antiguas del talonario">
        {oldOpen && <OldInvoiceForm onDone={() => setOldOpen(false)} />}
      </Modal>
      <Modal open={viewPhoto !== null} onClose={() => setViewPhoto(null)} title={viewPhoto ? `Talonario · ${viewPhoto.number}` : ''}>
        {viewPhoto?.photo && (
          <div className="space-y-3">
            <img src={viewPhoto.photo} alt="Hoja del talonario" className="w-full rounded-lg" />
            <a href={viewPhoto.photo} download={`talonario-${viewPhoto.number}.jpg`} className="flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-teal-700"><DownloadSimple size={18} /> Descargar foto</a>
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
