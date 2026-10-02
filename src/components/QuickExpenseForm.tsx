import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Transaction, type TxStatus, type Category } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, todayISO } from '../lib/format'
import { Button, Field, Input, Select } from './ui'

// Categorías de gasto de un toque, adaptadas al tipo de negocio. La primera es
// la "principal" (mercancía/ingredientes) y es la que se usa al detallar.
interface Chip { label: string; icon: string; color: string }
const CHIPS_BY_TYPE: Record<string, Chip[]> = {
  foodstall: [
    { label: 'Ingredientes', icon: '🥘', color: '#f97316' },
    { label: 'Gas / Carbón', icon: '🔥', color: '#ef4444' },
    { label: 'Transporte', icon: '🚕', color: '#0ea5e9' },
    { label: 'Otros', icon: '📦', color: '#64748b' },
  ],
  shop: [
    { label: 'Mercancía', icon: '📦', color: '#f97316' },
    { label: 'Transporte', icon: '🚕', color: '#0ea5e9' },
    { label: 'Alquiler', icon: '🏠', color: '#8b5cf6' },
    { label: 'Otros', icon: '🧾', color: '#64748b' },
  ],
  personal: [
    { label: 'Comida', icon: '🍽️', color: '#f97316' },
    { label: 'Transporte', icon: '🚕', color: '#0ea5e9' },
    { label: 'Casa', icon: '🏠', color: '#8b5cf6' },
    { label: 'Otros', icon: '🧾', color: '#64748b' },
  ],
  laundry: [
    { label: 'Detergente / Suavizante', icon: '🧼', color: '#0ea5e9' },
    { label: 'Luz / Agua', icon: '💡', color: '#eab308' },
    { label: 'Mantenimiento', icon: '🔧', color: '#ef4444' },
    { label: 'Otros', icon: '📦', color: '#64748b' },
  ],
}

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Otro']

export default function QuickExpenseForm({ existing, onDone }: { existing?: Transaction; onDone: () => void }) {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const categories = useLiveQuery(
    () => (bid ? ldb.categories.where('businessId').equals(bid).filter((c) => c.kind === 'expense').toArray() : []),
    [bid],
  )
  const chips = CHIPS_BY_TYPE[current?.businessType ?? ''] ?? CHIPS_BY_TYPE.foodstall

  const [amount, setAmount] = useState(existing?.amount ? String(existing.amount) : '')
  const [catLabel, setCatLabel] = useState('')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [detail, setDetail] = useState(false)
  const [lines, setLines] = useState<{ name: string; price: string }[]>([{ name: '', price: '' }])
  const [more, setMore] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(existing?.paymentMethod ?? 'Efectivo')
  const [status, setStatus] = useState<TxStatus>(existing?.status ?? 'paid')
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '')
  const [note, setNote] = useState(existing?.description ?? '')

  // Al editar: preselecciona el chip según la categoría guardada (por nombre).
  useEffect(() => {
    if (!existing?.categoryId || !categories || catLabel) return
    const cat = categories.find((c) => c.id === existing.categoryId)
    if (cat) {
      const chip = chips.find((c) => c.label.toLowerCase() === cat.name.toLowerCase())
      if (chip) setCatLabel(chip.label)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  const detailTotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.price) || 0), 0), [lines])
  const effectiveAmount = detail ? detailTotal : Number(amount) || 0

  async function ensureCategory(name: string, color: string): Promise<string | undefined> {
    const found = (categories ?? []).find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (found) return found.id
    return (await ldb.categories.add({ kind: 'expense', name, color } as Category)) as string
  }

  async function save() {
    const amt = effectiveAmount
    if (!amt || amt <= 0) return
    // Categoría: la del chip elegido; si está detallando sin chip, la principal.
    let chip = chips.find((c) => c.label === catLabel)
    if (!chip && detail) chip = chips[0]
    const categoryId = chip ? await ensureCategory(chip.label, chip.color) : existing?.categoryId

    let description = note.trim()
    if (detail) {
      const parts = lines
        .filter((l) => l.name.trim() || Number(l.price))
        .map((l) => `${l.name.trim() || '—'} ${Math.round(Number(l.price) || 0)}`)
      description = parts.join(', ')
    }

    const rec = {
      kind: 'expense' as const,
      date,
      amount: amt,
      categoryId: categoryId || undefined,
      description,
      paymentMethod,
      status,
      dueDate: status === 'pending' ? dueDate || undefined : undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.transactions.update(existing.id, rec)
    else await ldb.transactions.add(rec as Transaction)
    onDone()
  }

  return (
    <div className="space-y-5">
      {/* 1) Cuánto gastó — el número es lo primero y lo más grande */}
      {detail ? (
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Total del gasto</div>
          <div className="ge-nums text-3xl font-bold text-red-600">{money(detailTotal)}</div>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-center text-sm font-medium text-slate-600">¿Cuánto gastaste?</label>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            className="ge-nums w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center text-3xl font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
      )}

      {/* 2) En qué — botones de un toque */}
      <div>
        <div className="mb-2 text-sm font-medium text-slate-600">¿En qué fue el gasto?</div>
        <div className="grid grid-cols-2 gap-2">
          {chips.map((c) => {
            const on = catLabel === c.label
            return (
              <button
                key={c.label}
                onClick={() => setCatLabel(on ? '' : c.label)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-transform duration-100 ease-out active:scale-95 ${
                  on ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700'
                }`}
                style={on ? { background: c.color } : undefined}
              >
                <span className="text-lg">{c.icon}</span>
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 3) Opción de detallar por ingrediente */}
      <div>
        <button
          onClick={() => setDetail((v) => !v)}
          className="text-sm font-medium text-teal-600 transition-transform duration-100 ease-out active:scale-95"
        >
          {detail ? '✕ Quitar detalle (poner solo el total)' : '➕ Detallar por ingrediente'}
        </button>
        {detail && (
          <div className="mt-2 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={l.name}
                  onChange={(e) => setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="Ej. Pan, cebolla, aceite…"
                  className="flex-1"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={l.price}
                  onChange={(e) => setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, price: e.target.value } : x)))}
                  placeholder="0"
                  className="ge-nums w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
                <button
                  onClick={() => setLines((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 active:scale-90"
                  title="Quitar"
                >
                  ✕
                </button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setLines((arr) => [...arr, { name: '', price: '' }])} className="w-full">
              + Añadir otra cosa
            </Button>
          </div>
        )}
      </div>

      {/* 4) Fecha (por defecto hoy) */}
      <Field label="¿Qué día?">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {/* 5) Opciones avanzadas, escondidas para no asustar */}
      <div>
        <button
          onClick={() => setMore((v) => !v)}
          className="text-sm text-slate-400 transition-transform duration-100 ease-out active:scale-95"
        >
          {more ? 'Ocultar más opciones' : 'Más opciones (nota, pago, pendiente…)'}
        </button>
        {more && (
          <div className="mt-3 space-y-3">
            {!detail && (
              <Field label="Nota (opcional)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. compra en el mercado" />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cómo pagó">
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Estado">
                <Select value={status} onChange={(e) => setStatus(e.target.value as TxStatus)}>
                  <option value="paid">Pagado</option>
                  <option value="pending">A deber / pendiente</option>
                </Select>
              </Field>
            </div>
            {status === 'pending' && (
              <Field label="Vence el (opcional)">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1" disabled={effectiveAmount <= 0}>
          {existing ? 'Guardar' : 'Guardar gasto'}
        </Button>
      </div>
    </div>
  )
}
