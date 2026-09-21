import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Employee } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money } from '../lib/format'
import { Button, Card, Modal, Field, Input, Textarea, EmptyState } from '../components/ui'

function EmpForm({ existing, onDone }: { existing?: Employee; onDone: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    role: existing?.role ?? '',
    phone: existing?.phone ?? '',
    salary: existing?.salary ? String(existing.salary) : '',
    notes: existing?.notes ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    const rec = {
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone.trim(),
      salary: form.salary ? Number(form.salary) : undefined,
      notes: form.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.employees.update(existing.id, rec)
    else await ldb.employees.add(rec as Employee)
    onDone()
  }

  return (
    <div className="space-y-4">
      <Field label="Nombre *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Puesto"><Input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Peluquero, cajero…" /></Field>
        <Field label="Teléfono"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+240 …" /></Field>
      </div>
      <Field label="Salario (opcional)"><Input type="number" value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="0" /></Field>
      <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1">{existing ? 'Guardar' : 'Añadir'}</Button>
      </div>
    </div>
  )
}

export default function Employees() {
  const bid = useBusiness().current?.id ?? ''
  const emps = useLiveQuery(
    () => (bid ? ldb.employees.where('businessId').equals(bid).toArray().then((r) => r.sort((a, b) => a.name.localeCompare(b.name))) : []),
    [bid],
  )
  const [modal, setModal] = useState<null | { emp?: Employee }>(null)

  if (!emps) return <div className="text-slate-400">Cargando…</div>

  async function remove(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar este empleado?')) await removeRow('employees', id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Empleados</h1>
        <Button onClick={() => setModal({})}>+ Nuevo empleado</Button>
      </div>

      {emps.length === 0 ? (
        <EmptyState title="Sin empleados" hint="Añade a las personas de tu equipo." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {emps.map((e) => (
            <Card key={e.id}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800">{e.name}</div>
                  {e.role && <div className="text-sm text-slate-500">{e.role}</div>}
                  {e.phone && <div className="text-sm text-slate-500">📞 {e.phone}</div>}
                  {e.salary ? <div className="text-sm text-slate-500">💶 {money(e.salary)}</div> : null}
                  {e.notes && <div className="mt-1 text-xs text-slate-400">{e.notes}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => setModal({ emp: e })} className="text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                  <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.emp ? 'Editar empleado' : 'Nuevo empleado'}>
        {modal && <EmpForm existing={modal.emp} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
