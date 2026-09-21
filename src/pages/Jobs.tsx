import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Job, type JobStatus } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { formatDate } from '../lib/format'
import { Button, Card, Modal, Field, Input, Select, Textarea, EmptyState } from '../components/ui'

const STATUS: Record<JobStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'En curso', cls: 'bg-sky-50 text-sky-700' },
  done: { label: 'Terminado', cls: 'bg-teal-50 text-teal-700' },
}

function JobForm({ existing, onDone }: { existing?: Job; onDone: () => void }) {
  const bid = useBusiness().current?.id ?? ''
  const clients = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).filter((c) => c.type === 'client').toArray() : []), [bid])
  const [form, setForm] = useState({
    title: existing?.title ?? '',
    clientId: existing?.clientId ?? '',
    clientName: existing?.clientName ?? '',
    status: existing?.status ?? 'pending',
    dueDate: existing?.dueDate ?? '',
    notes: existing?.notes ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function pickClient(id: string) {
    set('clientId', id)
    const c = clients?.find((x) => x.id === id)
    if (c) set('clientName', c.name)
  }

  async function save() {
    if (!form.title.trim()) return
    const rec = {
      title: form.title.trim(),
      clientId: form.clientId || undefined,
      clientName: form.clientName.trim(),
      status: form.status as JobStatus,
      dueDate: form.dueDate || undefined,
      notes: form.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.jobs.update(existing.id, rec)
    else await ldb.jobs.add(rec as Job)
    onDone()
  }

  return (
    <div className="space-y-4">
      <Field label="Trabajo *"><Input value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus placeholder="Ej. Reparar aire acondicionado" /></Field>
      {clients && clients.length > 0 && (
        <Field label="Cliente guardado">
          <Select value={form.clientId} onChange={(e) => pickClient(e.target.value)}>
            <option value="">— Escribir manualmente —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Cliente"><Input value={form.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Nombre del cliente" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En curso</option>
            <option value="done">Terminado</option>
          </Select>
        </Field>
        <Field label="Fecha límite"><Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
      </div>
      <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1">{existing ? 'Guardar' : 'Añadir'}</Button>
      </div>
    </div>
  )
}

export default function Jobs() {
  const bid = useBusiness().current?.id ?? ''
  const jobs = useLiveQuery(() => (bid ? ldb.jobs.where('businessId').equals(bid).toArray() : []), [bid])
  const [modal, setModal] = useState<null | { job?: Job }>(null)
  const [showDone, setShowDone] = useState(false)

  const list = useMemo(() => {
    const order: Record<JobStatus, number> = { pending: 0, in_progress: 1, done: 2 }
    return [...(jobs ?? [])]
      .filter((j) => (showDone ? true : j.status !== 'done'))
      .sort((a, b) => order[a.status] - order[b.status] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
  }, [jobs, showDone])

  if (!jobs) return <div className="text-slate-400">Cargando…</div>
  const today = new Date().toISOString().slice(0, 10)

  async function cycle(j: Job) {
    if (!j.id) return
    const next: JobStatus = j.status === 'pending' ? 'in_progress' : j.status === 'in_progress' ? 'done' : 'pending'
    await ldb.jobs.update(j.id, { status: next })
  }
  async function remove(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar este trabajo?')) await removeRow('jobs', id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Trabajos pendientes</h1>
        <Button onClick={() => setModal({})}>+ Nuevo trabajo</Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Ver también terminados
      </label>

      {list.length === 0 ? (
        <EmptyState title="Sin trabajos pendientes" hint="Añade un trabajo para no olvidarlo." />
      ) : (
        <div className="space-y-2">
          {list.map((j) => {
            const overdue = j.dueDate && j.dueDate < today && j.status !== 'done'
            return (
              <Card key={j.id} className="flex flex-wrap items-center gap-3">
                <button onClick={() => cycle(j)} className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[j.status].cls}`} title="Cambiar estado">
                  {STATUS[j.status].label}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">{j.title}</div>
                  <div className="text-sm text-slate-500">
                    {j.clientName}
                    {j.dueDate && <span className={overdue ? 'text-red-600' : ''}> · vence {formatDate(j.dueDate)}{overdue ? ' ⚠️' : ''}</span>}
                  </div>
                  {j.notes && <div className="text-xs text-slate-400">{j.notes}</div>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal({ job: j })} className="rounded p-1 text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                  <button onClick={() => remove(j.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.job ? 'Editar trabajo' : 'Nuevo trabajo'}>
        {modal && <JobForm existing={modal.job} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
