import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Contact, type ContactType } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { Button, Card, Modal, Field, Input, Textarea, EmptyState, IconButton } from '../components/ui'
import ClientProfile from '../components/ClientProfile'
import { clientStats } from '../lib/salesStats'
import { money } from '../lib/format'

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
  const invoices = useLiveQuery(() => (bid ? ldb.invoices.where('businessId').equals(bid).toArray() : []), [bid])
  const ledger = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).filter((t) => !!t.invoiceId).toArray() : []), [bid])
  const [modal, setModal] = useState<null | { c?: Contact }>(null)
  const [profile, setProfile] = useState<Contact | null>(null)
  const [tab, setTab] = useState<ContactType>('client')
  const [onlyOwing, setOnlyOwing] = useState(false)
  const [query, setQuery] = useState('')

  if (!contacts || !invoices || !ledger) return <div className="text-slate-400">Cargando…</div>
  const stats = clientStats(invoices, ledger)
  const owingCount = contacts.filter((c) => c.type === 'client' && (stats.get(c.id)?.owed ?? 0) > 0).length
  const totalOwed = [...stats.values()].reduce((s, x) => s + x.owed, 0)
  const q = query.trim().toLowerCase()
  const list = contacts
    .filter((c) => c.type === tab)
    .filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q))
    .filter((c) => tab !== 'client' || !onlyOwing || (stats.get(c.id)?.owed ?? 0) > 0)
    // Primero quien más debe; luego por nombre
    .sort((a, b) => (stats.get(b.id)?.owed ?? 0) - (stats.get(a.id)?.owed ?? 0) || a.name.localeCompare(b.name))

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

      {tab === 'client' && totalOwed > 0 && (
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Te deben en total</div>
            <div className="ge-nums text-2xl font-bold text-amber-600">{money(totalOwed)}</div>
          </div>
          <button onClick={() => setOnlyOwing((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium active:scale-95 ${onlyOwing ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700'}`}>
            {onlyOwing ? 'Ver todos' : `Me deben (${owingCount})`}
          </button>
        </Card>
      )}

      {contacts.some((c) => c.type === tab) && (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o teléfono…" />
      )}

      {list.length === 0 ? (
        <EmptyState title="Sin contactos" hint={tab === 'client' ? 'Tus clientes se añaden solos al hacer una factura con su nombre.' : 'Añade tus proveedores para asociarlos a tus gastos.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const st = stats.get(c.id)
            return (
              <Card key={c.id} className="flex items-start gap-2">
                <button onClick={() => (c.type === 'client' ? setProfile(c) : setModal({ c }))} className="min-w-0 flex-1 text-left transition-transform active:scale-[0.99]">
                  <div className="truncate font-semibold text-slate-800">{c.name}</div>
                  {c.phone && <div className="text-sm text-slate-500">📞 {c.phone}</div>}
                  {c.type === 'client' && st && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">Comprado <span className="ge-nums font-medium text-slate-700">{money(st.bought)}</span></span>
                      {st.owed > 0
                        ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Debe {money(st.owed)}</span>
                        : <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">Al día</span>}
                    </div>
                  )}
                  {c.notes && <div className="mt-1 text-xs text-slate-400">{c.notes}</div>}
                </button>
                <div className="flex shrink-0 gap-1">
                  <IconButton onClick={() => setModal({ c })} title="Editar">✎</IconButton>
                  {canDelete && <IconButton onClick={() => remove(c.id)} title="Eliminar" className="text-slate-400 hover:text-red-600">🗑</IconButton>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.c ? 'Editar contacto' : 'Nuevo contacto'}>
        {modal && <ContactForm existing={modal.c} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={profile !== null} onClose={() => setProfile(null)} title="Ficha del cliente">
        {profile && <ClientProfile contact={profile} onEdit={() => { const c = profile; setProfile(null); setModal({ c }) }} />}
      </Modal>
    </div>
  )
}
