import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Kind, type Transaction, type TxStatus } from '../db/db'
import { PAYMENT_METHODS } from '../db/seed'
import { todayISO } from '../lib/format'
import { Button, Field, Input, Select, Textarea } from './ui'

export default function TxForm({
  kind: initialKind,
  existing,
  onDone,
}: {
  kind: Kind
  existing?: Transaction
  onDone: () => void
}) {
  const [kind, setKind] = useState<Kind>(existing?.kind ?? initialKind)
  const categories = useLiveQuery(() => db.categories.where('kind').equals(kind).toArray(), [kind])
  const contacts = useLiveQuery(
    () => db.contacts.where('type').equals(kind === 'income' ? 'client' : 'provider').toArray(),
    [kind],
  )

  const [form, setForm] = useState({
    date: existing?.date ?? todayISO(),
    amount: existing?.amount ? String(existing.amount) : '',
    categoryId: existing?.categoryId ? String(existing.categoryId) : '',
    contactId: existing?.contactId ? String(existing.contactId) : '',
    description: existing?.description ?? '',
    paymentMethod: existing?.paymentMethod ?? PAYMENT_METHODS[0],
    status: (existing?.status ?? 'paid') as TxStatus,
    dueDate: existing?.dueDate ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return
    const record: Transaction = {
      kind,
      date: form.date,
      amount,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      contactId: form.contactId ? Number(form.contactId) : undefined,
      description: form.description.trim(),
      paymentMethod: form.paymentMethod,
      status: form.status,
      dueDate: form.status === 'pending' ? form.dueDate || undefined : undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await db.transactions.put({ ...record, id: existing.id })
    else await db.transactions.add(record)
    onDone()
  }

  return (
    <div className="space-y-4">
      {/* Selector tipo */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setKind('income')}
          className={`rounded-md py-2 text-sm font-semibold transition ${
            kind === 'income' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          💵 Ingreso
        </button>
        <button
          onClick={() => setKind('expense')}
          className={`rounded-md py-2 text-sm font-semibold transition ${
            kind === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'
          }`}
        >
          🧾 Gasto
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe *">
          <Input
            type="number"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0"
            autoFocus
          />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
      </div>

      <Field label="Categoría">
        <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">Sin categoría</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={kind === 'income' ? 'Cliente' : 'Proveedor'}>
        <Select value={form.contactId} onChange={(e) => set('contactId', e.target.value)}>
          <option value="">— Ninguno —</option>
          {contacts?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Descripción">
        <Textarea
          rows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Ej. Venta de 3 sacos de arroz"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Método de pago">
          <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="paid">Pagado / cobrado</option>
            <option value="pending">Pendiente</option>
          </Select>
        </Field>
      </div>

      {form.status === 'pending' && (
        <Field label="Vence el (opcional)">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={save} className="flex-1" disabled={!form.amount}>
          {existing ? 'Guardar cambios' : 'Registrar'}
        </Button>
      </div>
    </div>
  )
}
