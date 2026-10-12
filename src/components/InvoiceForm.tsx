import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Contact, type DocType, type Invoice, type InvoiceItem, type Item, type ItemKind } from '../cloud/localdb'
import { useBusiness, type Business } from '../cloud/business'
import { money, todayISO } from '../lib/format'
import { invoicePDF, invoiceTotals, type InvoicePay, type PdfBusiness } from '../lib/pdf'
import { shareInvoice } from '../lib/share'
import { addInvoicePayment, linkedTxs, paymentSummary, syncInvoiceLedger, WALK_IN } from '../lib/invoiceLedger'
import { Button, Field, Input, Select, Textarea } from './ui'

export const pdfBiz = (b: Business): PdfBusiness => ({
  businessName: b.name,
  sector: b.sector,
  address: b.address,
  phone: b.phone,
  currency: b.currency,
  logo: b.logo,
})

const DOC_LABEL: Record<DocType, string> = { invoice: 'Factura', receipt: 'Recibo', quote: 'Presupuesto' }
const DOC_ICON: Record<DocType, string> = { invoice: '🧾', receipt: '🧻', quote: '📄' }
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

  return (
    <div className="space-y-5">
      {allowedTypes.length > 1 && (
        <div className="grid gap-1 rounded-lg bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${allowedTypes.length}, minmax(0, 1fr))` }}>
          {allowedTypes.map((t) => (
            <button key={t} onClick={() => setDocType(t)}
              className={`rounded-md py-2 text-sm font-semibold ${docType === t ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
              {DOC_ICON[t]} {DOC_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {/* 1) Cliente */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Cliente</span>
          <button onClick={() => { setClientName(WALK_IN); setContactId(''); setClientPhone('') }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-transform active:scale-95 ${walkIn ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            🏪 Mostrador
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input list="ge-clients" value={clientName} onChange={(e) => onClientName(e.target.value)} placeholder="Nombre del cliente" />
          <Input type="tel" inputMode="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Teléfono" className="w-32" />
        </div>
        <datalist id="ge-clients">
          {(contacts ?? []).map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </div>

      {/* 2) Productos / servicios */}
      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">¿Qué vendiste?</div>
        {(catalog ?? []).length > 0 && (
          <div className="mb-3 space-y-2">
            {(catalog ?? []).length > 8 && (
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en tu catálogo…" />
            )}
            <div className="flex flex-wrap gap-2">
              {shownCatalog.map((c) => (
                <button key={c.id} onClick={() => addFromCatalog(c)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-transform active:scale-95">
                  + {c.name}{c.price ? <span className="text-slate-400"> · {money(c.price)}</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_52px_92px_32px] items-center gap-2">
              <Input placeholder="Producto o servicio" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
              <Input type="number" inputMode="numeric" title="Cantidad" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} className="text-center" />
              <Input type="number" inputMode="numeric" title="Precio" value={it.price || ''} placeholder="Precio" onChange={(e) => setItem(i, { price: Number(e.target.value) })} className="text-right" />
              <button onClick={() => removeItem(i)} className="grid h-9 w-8 place-items-center text-slate-400 active:scale-90" title="Quitar">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems((a) => [...a, { description: '', qty: 1, price: 0 }])} className="mt-2 text-sm font-medium text-teal-600">
          + Añadir otra línea
        </button>
      </div>

      {/* Total */}
      <div className="rounded-xl bg-slate-50 p-4">
        {taxRate > 0 && (
          <>
            <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span className="ge-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>IVA ({taxRate}%) · <button onClick={() => setTaxRate(0)} className="font-medium text-amber-700 underline">quitar IVA</button></span>
              <span className="ge-nums">{money(tax)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-slate-700">Total</span>
          <span className="ge-nums text-2xl font-bold text-teal-700">{money(total)}</span>
        </div>
      </div>

      {/* 3) Cobro */}
      {!isQuote && isNew && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">¿Cómo te pagó?</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['paid', '✅', 'Pagado'],
              ['debt', '🕒', 'A deber'],
              ['partial', '💵', 'Abono'],
            ] as [PayMode, string, string][]).map(([m, icon, lbl]) => (
              <button key={m} onClick={() => setPayMode(m)}
                className={`rounded-xl border px-2 py-3 text-sm font-semibold transition-transform active:scale-95 ${payMode === m ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                <div className="text-lg">{icon}</div>{lbl}
              </button>
            ))}
          </div>
          {payMode === 'partial' && (
            <div className="mt-3">
              <Field label="¿Cuánto entregó ahora?">
                <Input type="number" inputMode="numeric" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="0" />
              </Field>
              {Number(partial) > 0 && <p className="mt-1 text-xs text-slate-500">Quedará debiendo <b>{money(Math.max(0, total - Number(partial)))}</b>.</p>}
            </div>
          )}
          {payMode === 'debt' && <p className="mt-2 text-xs text-slate-500">Quedará como deuda del cliente hasta que pague.</p>}
        </div>
      )}

      {!isQuote && !isNew && summary && !isLegacy && (
        <div className={`rounded-lg px-3 py-2 text-sm ${summary.remaining > 0 ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-700'}`}>
          Cobrado {money(summary.paid)}{summary.remaining > 0 ? ` · Debe ${money(summary.remaining)}` : ' · Pagada ✓'}
          <div className="text-xs opacity-80">Los abonos se registran desde la lista de facturas.</div>
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
      <div>
        <button onClick={() => setMore((v) => !v)} className="text-sm text-slate-400">
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
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-2">
        <Button onClick={() => save('whatsapp')} disabled={busy} className="w-full !bg-[#25D366] hover:!bg-[#1ebe5b]">📲 Guardar y enviar por WhatsApp</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save('save')} disabled={busy} className="flex-1">Guardar</Button>
          <Button variant="outline" onClick={() => save('pdf')} disabled={busy} className="flex-1">Guardar y PDF</Button>
        </div>
      </div>
    </div>
  )
}
