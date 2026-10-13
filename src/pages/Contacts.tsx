import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Contact, type ContactType } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { Button, Card, Modal, Field, Input, Textarea, EmptyState, IconButton } from '../components/ui'
import ClientProfile from '../components/ClientProfile'
import { Phone, PencilSimple, Trash, Plus, MagnifyingGlass, AddressBook, CheckCircle } from '@phosphor-icons/react'
import { canPickContacts, pickContacts, phoneKey } from '../lib/phoneContacts'
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
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button onClick={() => set('type', 'client')}
          className={`rounded-md py-2 text-sm font-semibold ${form.type === 'client' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>Cliente</button>
        <button onClick={() => set('type', 'provider')}
          className={`rounded-md py-2 text-sm font-semibold ${form.type === 'provider' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>Proveedor</button>
      </div>
      {!existing && canPickContacts() && (
        <button type="button"
          onClick={async () => { const [p] = await pickContacts(false); if (p) setForm((f) => ({ ...f, name: p.name, phone: p.phone, email: p.email || f.email })) }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-50 text-sm font-semibold text-teal-800 transition-transform active:scale-[0.98]">
          <AddressBook size={20} weight="duotone" /> Elegir de la agenda del teléfono
        </button>
      )}
      <Field label="Nombre *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={!canPickContacts()} /></Field>
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
  const [notice, setNotice] = useState('')

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

  // Importa varios contactos de la agenda; salta los que ya están (mismo teléfono o nombre)
  async function importFromPhoneBook() {
    const picked = await pickContacts(true)
    if (!picked.length || !contacts) return
    const phones = new Set(contacts.map((c) => phoneKey(c.phone)).filter(Boolean))
    const names = new Set(contacts.map((c) => c.name.trim().toLowerCase()))
    let added = 0
    for (const p of picked) {
      const key = phoneKey(p.phone)
      if ((key && phones.has(key)) || names.has(p.name.toLowerCase())) continue
      await ldb.contacts.add({ type: tab, name: p.name, phone: p.phone, email: p.email, notes: '', createdAt: new Date().toISOString() } as Contact)
      if (key) phones.add(key)
      names.add(p.name.toLowerCase())
      added++
    }
    const skipped = picked.length - added
    const who = tab === 'client' ? 'cliente' : 'proveedor'
    setNotice(
      added
        ? `${added} ${who}${added > 1 ? (tab === 'client' ? 's' : 'es') : ''} añadido${added > 1 ? 's' : ''}${skipped ? ` · ${skipped} ya estaba${skipped > 1 ? 'n' : ''}` : ''}`
        : 'Esos contactos ya estaban en la app',
    )
    setTimeout(() => setNotice(''), 4000)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight text-slate-900">Contactos</h1>
          <p className="text-sm text-slate-500">Tus clientes y proveedores</p>
        </div>
        <Button onClick={() => setModal({})} className="shrink-0"><Plus size={18} weight="bold" /> Nuevo</Button>
      </div>

      {canPickContacts() && (
        <button onClick={importFromPhoneBook} className="flex w-full items-center gap-3 rounded-2xl bg-teal-50 p-3.5 text-left ring-1 ring-teal-100 transition-transform active:scale-[0.99]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm"><AddressBook size={24} weight="duotone" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-teal-900">Añadir desde la agenda del teléfono</span>
            <span className="block text-xs text-teal-800/80">Elige uno o varios {tab === 'client' ? 'clientes' : 'proveedores'} de tus contactos</span>
          </span>
        </button>
      )}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
          <CheckCircle size={18} weight="fill" className="text-teal-300" /> {notice}
        </div>
      )}

      <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        <button onClick={() => setTab('client')}
          className={`min-h-9 rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === 'client' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          Clientes ({contacts.filter((c) => c.type === 'client').length})
        </button>
        <button onClick={() => setTab('provider')}
          className={`min-h-9 rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === 'provider' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>
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
        <div className="relative">
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o teléfono…" className="pl-10" />
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState image={tab === 'client' ? '/ill/clientes.webp' : undefined} title={tab === 'client' ? 'Aquí verás a tus clientes' : 'Sin proveedores'} hint={tab === 'client' ? (canPickContacts() ? 'Añádelos desde la agenda del teléfono o se añadirán solos cuando hagas una factura con su nombre.' : 'Se añaden solos cuando haces una factura con su nombre. Verás lo que compra cada uno y quién te debe.') : 'Añade tus proveedores para asociarlos a tus gastos.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const st = stats.get(c.id)
            return (
              <Card key={c.id} className="flex items-start gap-2">
                <button onClick={() => (c.type === 'client' ? setProfile(c) : setModal({ c }))} className="min-w-0 flex-1 text-left transition-transform active:scale-[0.99]">
                  <div className="truncate font-semibold text-slate-800">{c.name}</div>
                  {c.phone && <div className="flex items-center gap-1 text-sm text-slate-500"><Phone size={14} /> {c.phone}</div>}
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
                  <IconButton onClick={() => setModal({ c })} title="Editar"><PencilSimple size={20} /></IconButton>
                  {canDelete && <IconButton onClick={() => remove(c.id)} title="Eliminar" className="text-slate-400 hover:text-red-600"><Trash size={20} /></IconButton>}
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
