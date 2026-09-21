import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Contact, type ContactType } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { Button, Card, Modal, Field, Input, Textarea, EmptyState } from '../components/ui'

function ContactForm({ existing, onDone }: { existing?: Contact; onDone: () => void }) {
  const [form, setForm] = useState({
    type: existing?.type ?? 'client',
    name: existing?.name ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    notes: existing?.notes ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    const rec = {
      type: form.type as ContactType,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notes: form.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.contacts.update(existing.id, rec)
    else await ldb.contacts.add(rec as Contact)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
        <button onClick={() => set('type', 'client')}
          className={`rounded-md py-2 text-sm font-semibold ${form.type === 'client' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>Cliente</button>
        <button onClick={() => set('type', 'provider')}
          className={`rounded-md py-2 text-sm font-semibold ${form.type === 'provider' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>Proveedor</button>
      </div>
      <Field label="Nombre *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+240 …" /></Field>
        <Field label="Email"><Input value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
      </div>
      <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1" disabled={!form.name.trim()}>{existing ? 'Guardar' : 'Añadir'}</Button>
      </div>
    </div>
  )
}

export default function Contacts() {
  const bid = useBusiness().current?.id ?? ''
  const { canDelete } = usePerms()
  const contacts = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).toArray() : []), [bid])
  const [modal, setModal] = useState<null | { c?: Contact }>(null)
  const [tab, setTab] = useState<ContactType>('client')

  if (!contacts) return <div className="text-slate-400">Cargando…</div>
  const list = contacts.filter((c) => c.type === tab).sort((a, b) => a.name.localeCompare(b.name))

  async function remove(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar este contacto?')) await removeRow('contacts', id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Contactos</h1>
        <Button onClick={() => setModal({})}>+ Nuevo contacto</Button>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        <button onClick={() => setTab('client')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'client' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          Clientes ({contacts.filter((c) => c.type === 'client').length})
        </button>
        <button onClick={() => setTab('provider')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'provider' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>
          Proveedores ({contacts.filter((c) => c.type === 'provider').length})
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Sin contactos" hint="Añade tus clientes o proveedores para asociarlos a las ventas y gastos." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800">{c.name}</div>
                  {c.phone && <div className="text-sm text-slate-500">📞 {c.phone}</div>}
                  {c.email && <div className="truncate text-sm text-slate-500">✉ {c.email}</div>}
                  {c.notes && <div className="mt-1 text-xs text-slate-400">{c.notes}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => setModal({ c })} className="text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                  {canDelete && <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.c ? 'Editar contacto' : 'Nuevo contacto'}>
        {modal && <ContactForm existing={modal.c} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
