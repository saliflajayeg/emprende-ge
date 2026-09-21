import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Invoice, type InvoiceItem, type DocType } from '../cloud/localdb'
import { useBusiness, type Business } from '../cloud/business'
import { money, formatDate, todayISO } from '../lib/format'
import { invoicePDF, invoiceTotals, type PdfBusiness } from '../lib/pdf'
import { Button, Card, Modal, Field, Input, Textarea, Select, Badge, EmptyState } from '../components/ui'

const pdfBiz = (b: Business): PdfBusiness => ({
  businessName: b.name,
  sector: b.sector,
  address: b.address,
  phone: b.phone,
  currency: b.currency,
})

const DOC_LABEL: Record<DocType, string> = { invoice: 'Factura', receipt: 'Recibo', quote: 'Presupuesto' }
const DOC_ICON: Record<DocType, string> = { invoice: '🧾', receipt: '🧻', quote: '📄' }

function nextNumber(existing: Invoice[], prefix = ''): string {
  const year = new Date().getFullYear()
  const n = existing.filter((i) => i.number.includes(String(year))).length + 1
  return `${prefix}${year}-${String(n).padStart(3, '0')}`
}

function InvoiceForm({
  all,
  existing,
  allowedTypes,
  defaultDocType,
  onDone,
}: {
  all: Invoice[]
  existing?: Invoice
  allowedTypes: DocType[]
  defaultDocType: DocType
  onDone: () => void
}) {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const contacts = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).filter((c) => c.type === 'client').toArray() : []), [bid])

  const [form, setForm] = useState({
    docType: (existing?.docType ?? defaultDocType) as DocType,
    number: existing?.number ?? nextNumber(all, defaultDocType === 'quote' ? 'P-' : ''),
    date: existing?.date ?? todayISO(),
    clientName: existing?.clientName ?? '',
    clientDetails: existing?.clientDetails ?? '',
    contactId: existing?.contactId ?? '',
    taxRate: existing?.taxRate ?? current?.taxRate ?? 15,
    notes: existing?.notes ?? '',
    status: existing?.status ?? 'pending',
  })
  const [items, setItems] = useState<InvoiceItem[]>(
    existing?.items ?? [{ description: '', qty: 1, price: 0 }],
  )
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }))

  const setItem = (i: number, patch: Partial<InvoiceItem>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addItem = () => setItems((a) => [...a, { description: '', qty: 1, price: 0 }])
  const removeItem = (i: number) => setItems((a) => a.filter((_, idx) => idx !== i))

  const { subtotal, tax, total } = invoiceTotals({ items, taxRate: form.taxRate })

  function pickContact(id: string) {
    set('contactId', id)
    const c = contacts?.find((x) => x.id === id)
    if (c) {
      set('clientName', c.name)
      set('clientDetails', [c.phone, c.email].filter(Boolean).join(' · '))
    }
  }

  async function save(andPdf: boolean) {
    const rec = {
      docType: form.docType,
      number: form.number,
      date: form.date,
      clientName: form.clientName.trim() || 'Cliente',
      clientDetails: form.clientDetails.trim(),
      contactId: form.contactId || undefined,
      items: items.filter((it) => it.description.trim() || it.price > 0),
      taxRate: Number(form.taxRate),
      notes: form.notes.trim(),
      status: form.status as Invoice['status'],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.invoices.update(existing.id, rec)
    else await ldb.invoices.add(rec as Invoice)
    if (andPdf && current) invoicePDF(rec as Invoice, pdfBiz(current))
    onDone()
  }

  const isQuote = form.docType === 'quote'

  return (
    <div className="space-y-4">
      {allowedTypes.length > 1 && (
        <div className="grid gap-2 rounded-lg bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${allowedTypes.length}, minmax(0, 1fr))` }}>
          {allowedTypes.map((t) => (
            <button
              key={t}
              onClick={() => set('docType', t)}
              className={`rounded-md py-2 text-sm font-semibold ${form.docType === t ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
            >
              {DOC_ICON[t]} {DOC_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Número">
          <Input value={form.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
      </div>

      {contacts && contacts.length > 0 && (
        <Field label="Cliente guardado">
          <Select value={form.contactId} onChange={(e) => pickContact(e.target.value)}>
            <option value="">— Escribir manualmente —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Nombre del cliente">
        <Input value={form.clientName} onChange={(e) => set('clientName', e.target.value)} />
      </Field>
      <Field label="Datos del cliente (tel., dirección…)">
        <Input value={form.clientDetails} onChange={(e) => set('clientDetails', e.target.value)} />
      </Field>

      {/* Líneas */}
      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">Conceptos</div>
        <div className="mb-1 grid grid-cols-[1fr_56px_88px_20px] gap-2 text-xs text-slate-400">
          <span>Descripción</span>
          <span className="text-center">Cant.</span>
          <span className="text-right">Precio</span>
          <span />
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_56px_88px_20px] items-center gap-2">
              <Input
                placeholder="Concepto"
                value={it.description}
                onChange={(e) => setItem(i, { description: e.target.value })}
              />
              <Input
                type="number"
                title="Cantidad"
                value={it.qty}
                onChange={(e) => setItem(i, { qty: Number(e.target.value) })}
              />
              <Input
                type="number"
                title="Precio"
                value={it.price}
                onChange={(e) => setItem(i, { price: Number(e.target.value) })}
              />
              <button onClick={() => removeItem(i)} className="text-slate-400 hover:text-red-600" title="Quitar">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={addItem} className="mt-2 text-sm font-medium text-teal-600 hover:underline">
          + Añadir línea
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="IVA (%)">
          <Input type="number" value={form.taxRate} onChange={(e) => set('taxRate', Number(e.target.value))} />
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="pending">{isQuote ? 'Pendiente' : 'Pendiente de cobro'}</option>
            <option value="paid">{isQuote ? 'Aceptado' : 'Cobrada'}</option>
          </Select>
        </Field>
      </div>

      <Field label="Notas">
        <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Condiciones de pago, agradecimiento…" />
      </Field>

      {/* Totales */}
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        <div className="flex justify-between text-slate-500"><span>IVA</span><span>{money(tax)}</span></div>
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-teal-700">
          <span>Total</span><span>{money(total)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={() => save(false)} className="flex-1">Guardar</Button>
        <Button onClick={() => save(true)} className="flex-1">Guardar y descargar PDF</Button>
      </div>
    </div>
  )
}

export default function Invoices({
  mode = 'invoices',
}: {
  mode?: 'invoices' | 'quotes'
} = {}) {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const all = useLiveQuery(
    () => (bid ? ldb.invoices.where('businessId').equals(bid).toArray().then((r) => r.sort((a, b) => b.date.localeCompare(a.date))) : []),
    [bid],
  )
  const [modal, setModal] = useState<null | { inv?: Invoice }>(null)

  const isQuotes = mode === 'quotes'
  const allowedTypes: DocType[] = isQuotes ? ['quote'] : ['invoice', 'receipt']
  const defaultDocType: DocType = isQuotes ? 'quote' : 'invoice'
  const title = isQuotes ? 'Presupuestos' : 'Facturas y recibos'

  if (!all) return <div className="text-slate-400">Cargando…</div>
  const invoices = all.filter((i) => allowedTypes.includes(i.docType))

  async function remove(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar este documento?')) await removeRow('invoices', id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <Button onClick={() => setModal({})}>+ {isQuotes ? 'Nuevo presupuesto' : 'Nueva factura'}</Button>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="Sin documentos"
          hint={isQuotes ? 'Crea un presupuesto y descárgalo en PDF para tu cliente.' : 'Crea una factura o recibo y descárgalo en PDF para tu cliente.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {invoices.map((inv) => {
            const { total } = invoiceTotals(inv)
            return (
              <Card key={inv.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase text-slate-400">
                      {DOC_LABEL[inv.docType]} · {inv.number}
                    </div>
                    <div className="font-semibold text-slate-800">{inv.clientName}</div>
                    <div className="text-sm text-slate-500">{formatDate(inv.date)}</div>
                  </div>
                  <Badge status={inv.status} />
                </div>
                <div className="mt-3 text-xl font-bold text-teal-700">{money(total)}</div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => current && invoicePDF(inv, pdfBiz(current))}
                  >
                    ⬇ PDF
                  </Button>
                  <Button variant="ghost" onClick={() => setModal({ inv })}>✎</Button>
                  <Button variant="ghost" onClick={() => remove(inv.id)}>🗑</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.inv ? 'Editar documento' : isQuotes ? 'Nuevo presupuesto' : 'Nueva factura / recibo'}
      >
        {modal && (
          <InvoiceForm
            all={all}
            existing={modal.inv}
            allowedTypes={allowedTypes}
            defaultDocType={defaultDocType}
            onDone={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  )
}
