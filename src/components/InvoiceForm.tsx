import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Contact, type DocType, type Invoice, type InvoiceItem, type Item, type ItemKind } from '../cloud/localdb'
import { useBusiness, type Business } from '../cloud/business'
import { money, todayISO } from '../lib/format'
import { invoicePDF, invoiceTotals, type InvoicePay, type PdfBusiness } from '../lib/pdf'
import { shareInvoice } from '../lib/share'
import { addInvoicePayment, linkedTxs, paymentSummary, syncInvoiceLedger, WALK_IN } from '../lib/invoiceLedger'
import { Button, Field, Input, Select, Textarea } from './ui'
import { Receipt, Note, User, Phone, Storefront, Plus, Minus, X, CheckCircle, Clock, HandCoins, CaretDown, WhatsappLogo, FloppyDisk, FilePdf, MagnifyingGlass } from '@phosphor-icons/react'

export const pdfBiz = (b: Business): PdfBusiness => ({
  businessName: b.name,
  sector: b.sector,
  address: b.address,
  phone: b.phone,
  currency: b.currency,
  logo: b.logo,
})

const DOC_LABEL: Record<DocType, string> = { invoice: 'Factura', receipt: 'Recibo', quote: 'Presupuesto' }
export { WALK_IN }
const METHODS = ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Otro']

function nextNumber(existing: Invoice[], prefix = ''): string {
  const year = new Date().getFullYear()
  const n = existing.filter((i) => i.origin !== 'talonario' && i.number.includes(String(year)) && i.number.startsWith(prefix)).length + 1
  return `${prefix}${year}-${String(n).padStart(3, '0')}`
}

type PayMode = 'paid' | 'debt' | 'partial'

export default function InvoiceForm({
  existing,
  allowedTypes = ['invoice', 'receipt'],
  defaultDocType = 'invoice',
  onDone,
}: {
  existing?: Invoice
  allowedTypes?: DocType[]
  defaultDocType?: DocType
  onDone: () => void
}) {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const all = useLiveQuery(() => (bid ? ldb.invoices.where('businessId').equals(bid).toArray() : []), [bid])
  const contacts = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).filter((c) => c.type === 'client').toArray() : []), [bid])
  const catalog = useLiveQuery(() => (bid ? ldb.items.where('businessId').equals(bid).filter((i) => i.kind !== 'ingredient').toArray() : []), [bid])
  // Movimientos ya enlazados (solo al editar): deciden si la factura lleva su caja.
  const linked = useLiveQuery(() => (bid && existing ? linkedTxs(bid, existing.id) : Promise.resolve([])), [bid, existing?.id])

  const [docType, setDocType] = useState<DocType>(existing?.docType ?? defaultDocType)
  const [number, setNumber] = useState(existing?.number ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [clientName, setClientName] = useState(existing?.clientName ?? '')
  const [clientPhone, setClientPhone] = useState('')
  const [clientDetails, setClientDetails] = useState(existing?.clientDetails ?? '')
  const [contactId, setContactId] = useState(existing?.contactId ?? '')
  // Sin IVA: las facturas nuevas no llevan impuesto. Solo una factura antigua que
  // ya lo tenía lo conserva (y se le puede quitar al editarla).
  const [taxRate, setTaxRate] = useState<number>(existing?.taxRate ?? 0)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [legacyStatus, setLegacyStatus] = useState(existing?.status ?? 'pending')
  const [items, setItems] = useState<InvoiceItem[]>(existing?.items?.length ? existing.items : [{ description: '', qty: 1, price: 0 }])
  const [payMode, setPayMode] = useState<PayMode>('paid')
  const [partial, setPartial] = useState('')
  const [method, setMethod] = useState('Efectivo')
  const [search, setSearch] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isQuote = docType === 'quote'
  const isNew = !existing
  // Factura antigua (creada antes del sistema de cobros): su estado se gestiona a mano.
  const isLegacy = !!existing && linked !== undefined && linked.length === 0 && !isQuote
  const { subtotal, tax, total } = invoiceTotals({ items, taxRate })
  const summary = existing && linked ? paymentSummary({ ...existing, items, taxRate }, linked) : null

  const autoNumber = useMemo(() => nextNumber(all ?? [], docType === 'quote' ? 'P-' : docType === 'receipt' ? 'R-' : ''), [all, docType])
  const finalNumber = number.trim() || autoNumber

  // --- Líneas ---
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const removeItem = (i: number) => setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : [{ description: '', qty: 1, price: 0 }]))
  function addFromCatalog(it: Item) {
    setItems((arr) => {
      const at = arr.findIndex((x) => x.description.trim().toLowerCase() === it.name.trim().toLowerCase())
      if (at >= 0) return arr.map((x, idx) => (idx === at ? { ...x, qty: x.qty + 1 } : x))
      const blank = arr.length === 1 && !arr[0].description.trim() && !arr[0].price
      const line = { description: it.name, qty: 1, price: it.price || 0 }
      return blank ? [line] : [...arr, line]
    })
  }
  const shownCatalog = (catalog ?? [])
    .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 12)

  // --- Cliente ---
  function onClientName(v: string) {
    setClientName(v)
    const c = contacts?.find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase())
    if (c) { setContactId(c.id); if (c.phone) setClientPhone(c.phone) }
    else setContactId('')
  }
  const walkIn = clientName.trim() === WALK_IN

  async function resolveContact(): Promise<string | undefined> {
    const name = clientName.trim()
    if (!name || name === WALK_IN) return undefined
    const phone = clientPhone.trim()
    const found = contactId ? contacts?.find((c) => c.id === contactId) : contacts?.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (found) {
      if (phone && !found.phone) await ldb.contacts.update(found.id, { phone })
      return found.id
    }
    return (await ldb.contacts.add({ type: 'client', name, phone, email: '', notes: '', createdAt: new Date().toISOString() } as Contact)) as string
  }

  // Lo que se escribe nuevo se guarda solo en el catálogo con su precio.
  async function learnCatalog(lines: InvoiceItem[]) {
    const known = new Set((catalog ?? []).map((c) => c.name.trim().toLowerCase()))
    const enabled = (current?.enabledModules as string[] | null) ?? []
    const kind: ItemKind = enabled.includes('products') || !enabled.includes('services') ? 'product' : 'service'
    for (const l of lines) {
      const key = l.description.trim().toLowerCase()
      if (!key || !l.price || known.has(key)) continue
      known.add(key)
      await ldb.items.add({
        kind, name: l.description.trim(), price: l.price, category: '', unit: '',
        trackStock: false, stock: 0, lowStock: 0, notes: '', createdAt: new Date().toISOString(),
      } as Item)
    }
  }

  async function save(action: 'save' | 'pdf' | 'whatsapp') {
    setError('')
    const lines = items
      .map((it) => ({ description: it.description.trim(), qty: Number(it.qty) || 1, price: Number(it.price) || 0 }))
      .filter((it) => it.description || it.price > 0)
    if (lines.length === 0) { setError('Añade al menos un producto o servicio.'); return }
    const owes = !isQuote && (isNew ? payMode !== 'paid' : false)
    if (owes && (!clientName.trim() || walkIn)) { setError('Para dejar a deber, escribe el nombre del cliente.'); return }
    if (isNew && payMode === 'partial' && !(Number(partial) > 0)) { setError('Escribe cuánto entregó ahora.'); return }

    setBusy(true)
    try {
      const cid = await resolveContact()
      await learnCatalog(lines)
      const details = clientDetails.trim() || clientPhone.trim()
      const rec = {
        docType,
        number: finalNumber,
        date,
        clientName: clientName.trim() || WALK_IN,
        clientDetails: details,
        contactId: cid,
        items: lines,
        taxRate: Number(taxRate) || 0,
        notes: notes.trim(),
        status: (isLegacy || isQuote ? legacyStatus : existing?.status ?? 'pending') as Invoice['status'],
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }

      let id = existing?.id
      if (id) await ldb.invoices.update(id, rec)
      else id = (await ldb.invoices.add(rec as Invoice)) as string
      let inv = (await ldb.invoices.get(id)) as Invoice

      // La factura alimenta la caja: cobro, deuda o abono.
      if (!isQuote && !isLegacy) {
        const t = invoiceTotals(inv).total
        if (isNew && payMode === 'paid') await addInvoicePayment(bid, inv, t, { date, method })
        else if (isNew && payMode === 'partial') await addInvoicePayment(bid, inv, Number(partial), { date, method })
        else await syncInvoiceLedger(bid, inv)
        inv = (await ldb.invoices.get(id)) as Invoice
      }

      if (current && action !== 'save') {
        let pay: InvoicePay | undefined
        if (!isQuote) {
          const s = paymentSummary(inv, await linkedTxs(bid, inv.id))
          pay = { paid: s.paid, remaining: s.remaining }
        }
        if (action === 'pdf') invoicePDF(inv, pdfBiz(current), pay)
        else {
          const phone = clientPhone.trim() || contacts?.find((c) => c.id === cid)?.phone
          await shareInvoice(inv, pdfBiz(current), phone, pay)
        }
      }
      onDone()
    } catch (e) {
      setError((e as Error).message || 'No se pudo guardar.')
    }
    setBusy(false)
  }

  const inCart = (name: string) => items.find((x) => x.description.trim().toLowerCase() === name.trim().toLowerCase())?.qty ?? 0
  const Step = ({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) => (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-700 text-xs font-bold text-white">{n}</span>
        <span className="font-display text-base font-bold text-slate-900">{title}</span>
      </div>
      {right}
    </div>
  )
  const payOptions: [PayMode, typeof CheckCircle, string][] = [
    ['paid', CheckCircle, 'Pagado'],
    ['debt', Clock, 'A deber'],
    ['partial', HandCoins, 'Abono'],
  ]

  return (
    <div className="space-y-6">
      {allowedTypes.length > 1 && (
        <div className="grid gap-1 rounded-xl bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${allowedTypes.length}, minmax(0, 1fr))` }}>
          {allowedTypes.map((t) => (
            <button key={t} onClick={() => setDocType(t)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors ${docType === t ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>
              {t === 'receipt' ? <Note size={18} weight={docType === t ? 'fill' : 'regular'} /> : <Receipt size={18} weight={docType === t ? 'fill' : 'regular'} />}
              {DOC_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {/* 1) Cliente */}
      <section>
        <Step n={1} title="Cliente" right={
          <button onClick={() => { setClientName(walkIn ? '' : WALK_IN); setContactId(''); setClientPhone('') }}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-[transform,background-color] active:scale-95 ${walkIn ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Storefront size={16} weight={walkIn ? 'fill' : 'regular'} /> Mostrador
          </button>
        } />
        <div className="space-y-2.5">
          <div className="relative">
            <User size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input list="ge-clients" value={clientName} onChange={(e) => onClientName(e.target.value)} placeholder="Nombre del cliente" className="pl-10" />
          </div>
          {!walkIn && (
            <div className="relative">
              <Phone size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input type="tel" inputMode="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Teléfono (para enviarle la factura)" className="pl-10" />
            </div>
          )}
        </div>
        <datalist id="ge-clients">
          {(contacts ?? []).map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </section>

      {/* 2) Productos / servicios */}
      <section>
        <Step n={2} title="¿Qué vendiste?" />
        {(catalog ?? []).length > 0 && (
          <div className="mb-3">
            {(catalog ?? []).length > 8 && (
              <div className="relative mb-2.5">
                <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en tu catálogo…" className="pl-10" />
              </div>
            )}
            <div className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {shownCatalog.map((c) => {
                const q = inCart(c.name)
                return (
                  <button key={c.id} onClick={() => addFromCatalog(c)}
                    className={`relative flex w-32 shrink-0 snap-start flex-col items-start rounded-2xl p-3 text-left transition-[transform,background-color,box-shadow] active:scale-95 ${q ? 'bg-teal-50 ring-2 ring-teal-600' : 'bg-slate-50 ring-1 ring-slate-200'}`}>
                    <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight text-slate-800">{c.name}</span>
                    <span className="ge-nums mt-1.5 text-xs font-semibold text-slate-500">{c.price ? money(c.price) : 'Sin precio'}</span>
                    <span className={`absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold ${q ? 'bg-teal-700 text-white' : 'bg-white text-teal-700 ring-1 ring-slate-200'}`}>
                      {q ? q : <Plus size={12} weight="bold" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <Input placeholder="Producto o servicio" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} className="!min-h-10 border-transparent bg-slate-50 !py-2 font-semibold focus:bg-white" />
                <button onClick={() => removeItem(i)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-transform hover:bg-slate-100 hover:text-red-600 active:scale-90" title="Quitar" aria-label="Quitar">
                  <X size={18} weight="bold" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="flex items-center rounded-xl bg-slate-100 p-1">
                  <button onClick={() => setItem(i, { qty: Math.max(1, (Number(it.qty) || 1) - 1) })} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-700 shadow-sm active:scale-90" aria-label="Menos"><Minus size={16} weight="bold" /></button>
                  <input type="number" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} className="ge-nums w-11 bg-transparent text-center text-base font-bold text-slate-900 outline-none" aria-label="Cantidad" />
                  <button onClick={() => setItem(i, { qty: (Number(it.qty) || 0) + 1 })} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-700 shadow-sm active:scale-90" aria-label="Más"><Plus size={16} weight="bold" /></button>
                </div>
                <div className="relative min-w-0 flex-1">
                  <Input type="number" inputMode="numeric" value={it.price || ''} placeholder="Precio" onChange={(e) => setItem(i, { price: Number(e.target.value) })} className="ge-nums !min-h-11 pr-12 text-right font-semibold" aria-label="Precio" />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{current?.currency ?? 'XAF'}</span>
                </div>
              </div>
              {it.qty > 1 && it.price > 0 && (
                <div className="ge-nums mt-2 text-right text-xs font-semibold text-slate-500">{it.qty} × {money(it.price)} = <span className="text-slate-800">{money(it.qty * it.price)}</span></div>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setItems((a) => [...a, { description: '', qty: 1, price: 0 }])}
          className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 transition-colors hover:border-teal-500 hover:text-teal-700">
          <Plus size={16} weight="bold" /> Añadir otro producto
        </button>
      </section>

      {/* 3) Cobro */}
      {!isQuote && isNew && (
        <section>
          <Step n={3} title="¿Cómo te pagó?" />
          <div className="grid grid-cols-3 gap-2">
            {payOptions.map(([m, Icon, lbl]) => (
              <button key={m} onClick={() => setPayMode(m)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-sm font-semibold transition-[transform,background-color] active:scale-95 ${payMode === m ? 'bg-teal-700 text-white shadow-[0_8px_18px_-8px_rgba(15,118,110,0.7)]' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'}`}>
                <Icon size={24} weight={payMode === m ? 'fill' : 'regular'} />{lbl}
              </button>
            ))}
          </div>
          {payMode === 'partial' && (
            <div className="mt-3">
              <Field label="¿Cuánto entregó ahora?">
                <Input type="number" inputMode="numeric" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="0" className="ge-nums" />
              </Field>
              {Number(partial) > 0 && <p className="mt-1.5 text-sm text-slate-500">Quedará debiendo <b className="text-amber-700">{money(Math.max(0, total - Number(partial)))}</b>.</p>}
            </div>
          )}
          {payMode === 'debt' && <p className="mt-2 text-sm text-slate-500">Quedará como deuda del cliente hasta que pague.</p>}
        </section>
      )}

      {!isQuote && !isNew && summary && !isLegacy && (
        <div className={`rounded-xl px-3.5 py-3 text-sm ${summary.remaining > 0 ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800'}`}>
          <div className="font-semibold">Cobrado {money(summary.paid)}{summary.remaining > 0 ? ` · Debe ${money(summary.remaining)}` : ' · Pagada'}</div>
          <div className="text-xs opacity-80">Los pagos se registran desde la lista de facturas.</div>
        </div>
      )}

      {(isQuote || isLegacy) && (
        <Field label="Estado">
          <Select value={legacyStatus} onChange={(e) => setLegacyStatus(e.target.value as Invoice['status'])}>
            <option value="pending">{isQuote ? 'Pendiente' : 'Pendiente de cobro'}</option>
            <option value="paid">{isQuote ? 'Aceptado' : 'Cobrada'}</option>
          </Select>
        </Field>
      )}

      {/* Más opciones */}
      <section>
        <button onClick={() => setMore((v) => !v)} className="flex min-h-10 items-center gap-1.5 text-sm font-semibold text-slate-500">
          <CaretDown size={16} weight="bold" className={`transition-transform ${more ? 'rotate-180' : ''}`} />
          {more ? 'Ocultar más opciones' : 'Más opciones (número, fecha, notas…)'}
        </button>
        {more && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número"><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={autoNumber} /></Field>
              <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
            {!isQuote && isNew && payMode !== 'debt' && (
              <Field label="Cómo pagó">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => <option key={m}>{m}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Datos del cliente (dirección, NIF…)"><Input value={clientDetails} onChange={(e) => setClientDetails(e.target.value)} /></Field>
            <Field label="Notas"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones, agradecimiento…" /></Field>
          </div>
        )}
      </section>

      {/* Barra fija: total + enviar, siempre a mano */}
      <div className="sticky bottom-0 -mx-5 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-slate-100 bg-white/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {taxRate > 0 && (
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Subtotal {money(subtotal)} · IVA {taxRate}% <button onClick={() => setTaxRate(0)} className="font-semibold text-amber-700 underline">quitar</button></span>
            <span className="ge-nums">{money(tax)}</span>
          </div>
        )}
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-500">Total</span>
          <span className="ge-nums font-display text-3xl font-extrabold tracking-tight text-slate-900">{money(total)}</span>
        </div>
        {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <Button onClick={() => save('whatsapp')} disabled={busy} className="w-full !bg-[#1DA851] !text-base hover:!bg-[#178f45] !shadow-[0_8px_20px_-8px_rgba(29,168,81,0.7)]">
          <WhatsappLogo size={22} weight="fill" /> {busy ? 'Guardando…' : 'Guardar y enviar por WhatsApp'}
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => save('save')} disabled={busy}><FloppyDisk size={18} /> Guardar</Button>
          <Button variant="outline" onClick={() => save('pdf')} disabled={busy}><FilePdf size={18} /> Guardar y PDF</Button>
        </div>
      </div>
    </div>
  )
}
