import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Contact, type Invoice } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, formatDate, todayISO } from '../lib/format'
import { invoicePDF } from '../lib/pdf'
import { shareInvoice } from '../lib/share'
import { paymentSummary, payClientDebt } from '../lib/invoiceLedger'
import { groupByInvoice } from '../lib/salesStats'
import { pdfBiz } from './InvoiceForm'
import { Button, Field, Input, Select } from './ui'
import { CheckCircle, HandCoins, BellRinging, WhatsappLogo, FilePdf } from '@phosphor-icons/react'

const METHODS = ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Otro']
const STATE_UI = {
  paid: { label: 'Pagada', cls: 'bg-teal-50 text-teal-700' },
  partial: { label: 'Abonada', cls: 'bg-sky-50 text-sky-700' },
  pending: { label: 'A deber', cls: 'bg-amber-50 text-amber-700' },
} as const

// Ficha de un cliente: lo que ha comprado, lo que debe, cobrar su deuda y su historial.
export default function ClientProfile({ contact, onEdit }: { contact: Contact; onEdit: () => void }) {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const invoices = useLiveQuery(
    () => (bid ? ldb.invoices.where('businessId').equals(bid).filter((i) => i.contactId === contact.id && i.docType !== 'quote').toArray() : []),
    [bid, contact.id],
  )
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).filter((t) => !!t.invoiceId).toArray() : []), [bid])
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Efectivo')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  if (!invoices || !txs) return <div className="text-slate-400">Cargando…</div>

  const byInv = groupByInvoice(txs)
  const rows = [...invoices]
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
    .map((inv) => ({ inv, s: paymentSummary(inv, byInv.get(inv.id) ?? []) }))
  const bought = rows.reduce((s, r) => s + r.s.total, 0)
  const paid = rows.reduce((s, r) => s + r.s.paid, 0)
  const owed = rows.reduce((s, r) => s + r.s.remaining, 0)
  const digits = (contact.phone || '').replace(/[^0-9]/g, '')

  function openWhatsApp(text: string) {
    const base = digits.length >= 8 ? `https://wa.me/${digits}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }
  function remind() {
    const list = rows.filter((r) => r.s.remaining > 0).map((r) => `• ${r.inv.number} (${formatDate(r.inv.date)}): ${money(r.s.remaining)}`).join('\n')
    openWhatsApp(`Hola ${contact.name}, te recordamos amablemente que tienes pendiente ${money(owed)}${current?.name ? ` con ${current.name}` : ''}:\n${list}\n¡Gracias!`)
  }

  async function collect() {
    const value = Math.min(Number(amount) || 0, owed)
    if (value <= 0) return
    setBusy(true)
    const applied = await payClientDebt(bid, contact.id, value, { date, method })
    setBusy(false)
    setPaying(false)
    setDone(`Cobro de ${money(applied)} registrado.`)
  }

  async function share(inv: Invoice, s: ReturnType<typeof paymentSummary>) {
    if (!current) return
    try { await shareInvoice(inv, pdfBiz(current), contact.phone, { paid: s.paid, remaining: s.remaining }) } catch { /* cancelado */ }
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-teal-50 text-lg font-bold text-teal-700">
          {contact.name.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-slate-800">{contact.name}</div>
          <div className="text-sm text-slate-500">{contact.phone || 'Sin teléfono'}</div>
        </div>
        <button onClick={onEdit} className="text-sm font-medium text-teal-700">Editar</button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-2 py-3">
          <div className="text-xs text-slate-500">Ha comprado</div>
          <div className="ge-nums text-sm font-bold text-slate-800">{money(bought)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-3">
          <div className="text-xs text-slate-500">Ha pagado</div>
          <div className="ge-nums text-sm font-bold text-teal-700">{money(paid)}</div>
        </div>
        <div className={`rounded-lg px-2 py-3 ${owed > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <div className="text-xs text-slate-500">Debe</div>
          <div className={`ge-nums text-sm font-bold ${owed > 0 ? 'text-amber-700' : 'text-teal-700'}`}>{money(owed)}</div>
        </div>
      </div>

      {done && <p className="flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2.5 text-sm font-semibold text-teal-800"><CheckCircle size={18} weight="fill" /> {done}</p>}

      {/* Cobrar deuda */}
      {owed > 0 && !paying && (
        <div className="flex gap-2">
          <Button onClick={() => { setAmount(String(owed)); setPaying(true); setDone('') }} className="flex-1"><HandCoins size={18} weight="fill" /> Cobrar deuda</Button>
          <button onClick={remind} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-100 px-3.5 text-sm font-semibold text-amber-800 transition-transform active:scale-95"><BellRinging size={18} weight="fill" /> Recordar</button>
        </div>
      )}
      {paying && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <Field label="¿Cuánto paga ahora?">
            <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="ge-nums text-lg" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Cómo pagó">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">Se aplica a sus facturas pendientes, de la más antigua a la más reciente.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPaying(false)} className="flex-1">Cancelar</Button>
            <Button onClick={collect} disabled={busy || !(Number(amount) > 0)} className="flex-1">Registrar cobro</Button>
          </div>
        </div>
      )}

      {/* Historial */}
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-700">Facturas ({rows.length})</div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no tiene facturas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ inv, s }) => (
              <li key={inv.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{inv.number} · {formatDate(inv.date)}</div>
                  <div className="truncate text-xs text-slate-400">{inv.items.map((i) => i.description).filter(Boolean).join(', ')}</div>
                </div>
                <div className="text-right">
                  <div className="ge-nums text-sm font-medium">{money(s.total)}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_UI[s.state].cls}`}>
                    {s.remaining > 0 ? `Debe ${money(s.remaining)}` : STATE_UI[s.state].label}
                  </span>
                </div>
                <button onClick={() => share(inv, s)} title="Enviar por WhatsApp" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#1DA851] transition-transform hover:bg-slate-100 active:scale-90"><WhatsappLogo size={22} weight="fill" /></button>
                <button onClick={() => current && invoicePDF(inv, pdfBiz(current), { paid: s.paid, remaining: s.remaining })} title="PDF" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition-transform hover:bg-slate-100 active:scale-90"><FilePdf size={22} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
