import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Appointment, type ApptStatus } from '../db/db'
import { money, formatDate, todayISO } from '../lib/format'
import { Button, Card, Modal, Field, Input, Select, Textarea, EmptyState } from '../components/ui'

const STATUS: Record<ApptStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
  done: { label: 'Atendida', cls: 'bg-teal-50 text-teal-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500' },
}

function ApptForm({ existing, onDone }: { existing?: Appointment; onDone: () => void }) {
  const clients = useLiveQuery(() => db.contacts.where('type').equals('client').toArray(), [])
  const services = useLiveQuery(() => db.items.where('kind').equals('service').toArray(), [])
  const [form, setForm] = useState({
    date: existing?.date ?? todayISO(),
    time: existing?.time ?? '10:00',
    clientId: existing?.clientId ? String(existing.clientId) : '',
    clientName: existing?.clientName ?? '',
    service: existing?.service ?? '',
    price: existing?.price ? String(existing.price) : '',
    status: existing?.status ?? 'pending',
    notes: existing?.notes ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function pickClient(id: string) {
    set('clientId', id)
    const c = clients?.find((x) => String(x.id) === id)
    if (c) set('clientName', c.name)
  }
  function pickService(name: string) {
    set('service', name)
    const s = services?.find((x) => x.name === name)
    if (s && s.price) set('price', String(s.price))
  }

  async function save() {
    if (!form.clientName.trim() && !form.service.trim()) return
    const rec: Appointment = {
      date: form.date,
      time: form.time,
      clientId: form.clientId ? Number(form.clientId) : undefined,
      clientName: form.clientName.trim(),
      service: form.service.trim(),
      price: Number(form.price) || 0,
      status: form.status as ApptStatus,
      notes: form.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await db.appointments.put({ ...rec, id: existing.id })
    else await db.appointments.add(rec)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} /></Field>
      </div>
      {clients && clients.length > 0 && (
        <Field label="Cliente guardado">
          <Select value={form.clientId} onChange={(e) => pickClient(e.target.value)}>
            <option value="">— Escribir manualmente —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Cliente"><Input value={form.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Nombre del cliente" /></Field>
      <Field label="Servicio">
        {services && services.length > 0 ? (
          <Select value={form.service} onChange={(e) => pickService(e.target.value)}>
            <option value="">— Elegir / escribir —</option>
            {services.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </Select>
        ) : (
          <Input value={form.service} onChange={(e) => set('service', e.target.value)} placeholder="Corte, tinte…" />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio"><Input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0" /></Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="pending">Pendiente</option>
            <option value="done">Atendida</option>
            <option value="cancelled">Cancelada</option>
          </Select>
        </Field>
      </div>
      <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1">{existing ? 'Guardar' : 'Añadir cita'}</Button>
      </div>
    </div>
  )
}

export default function Appointments() {
  const appts = useLiveQuery(() => db.appointments.toArray(), [])
  const [modal, setModal] = useState<null | { appt?: Appointment }>(null)
  const [showPast, setShowPast] = useState(false)

  const today = todayISO()
  const sorted = useMemo(
    () =>
      [...(appts ?? [])]
        .filter((a) => (showPast ? true : a.date >= today || a.status === 'pending'))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [appts, showPast, today],
  )

  if (!appts) return <div className="text-slate-400">Cargando…</div>

  async function setStatus(a: Appointment, status: ApptStatus) {
    if (!a.id) return
    await db.appointments.update(a.id, { status })
  }
  async function remove(id?: number) {
    if (!id) return
    if (confirm('¿Eliminar esta cita?')) await db.appointments.delete(id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Citas</h1>
        <Button onClick={() => setModal({})}>+ Nueva cita</Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
        Ver también citas pasadas
      </label>

      {sorted.length === 0 ? (
        <EmptyState title="Sin citas" hint="Agenda la primera cita de un cliente." />
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-center gap-3">
              <div className="text-center">
                <div className="text-xs uppercase text-slate-400">{formatDate(a.date)}</div>
                <div className="text-lg font-bold text-teal-700">{a.time}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{a.clientName || 'Cliente'}</div>
                <div className="text-sm text-slate-500">
                  {a.service}{a.price ? ` · ${money(a.price)}` : ''}
                </div>
                {a.notes && <div className="text-xs text-slate-400">{a.notes}</div>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span>
              <div className="flex gap-1">
                {a.status !== 'done' && (
                  <button onClick={() => setStatus(a, 'done')} title="Marcar atendida" className="rounded p-1 text-slate-400 hover:text-teal-600">✓</button>
                )}
                {a.status !== 'cancelled' && (
                  <button onClick={() => setStatus(a, 'cancelled')} title="Cancelar" className="rounded p-1 text-slate-400 hover:text-amber-600">⊘</button>
                )}
                <button onClick={() => setModal({ appt: a })} className="rounded p-1 text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                <button onClick={() => remove(a.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.appt ? 'Editar cita' : 'Nueva cita'}>
        {modal && <ApptForm existing={modal.appt} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
