import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Transaction, type Kind } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, formatDate } from '../lib/format'
import { downloadCSV } from '../lib/csv'
import { Button, Card, Modal, Badge, Select, Input, EmptyState } from '../components/ui'
import TxForm from '../components/TxForm'

export default function Transactions({
  title = 'Ingresos y gastos',
  lockKind,
  pendingOnly = false,
  emptyHint = 'Pulsa «Nuevo» para registrar tu primera venta o gasto.',
}: {
  title?: string
  lockKind?: Kind
  pendingOnly?: boolean
  emptyHint?: string
} = {}) {
  const bid = useBusiness().current?.id ?? ''
  const { canDelete } = usePerms()
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).toArray() : []), [bid])
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const contacts = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).toArray() : []), [bid])

  const [modal, setModal] = useState<null | { kind: Kind; tx?: Transaction }>(null)
  const [filterKind, setFilterKind] = useState<'all' | Kind>(lockKind ?? 'all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending'>(pendingOnly ? 'pending' : 'all')
  const [query, setQuery] = useState('')

  const catName = (id?: string) => categories?.find((c) => c.id === id)?.name ?? '—'
  const contactName = (id?: string) => contacts?.find((c) => c.id === id)?.name ?? ''

  const filtered = useMemo(() => {
    const list = (txs ?? []).filter((t) => {
      if (filterKind !== 'all' && t.kind !== filterKind) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (query) {
        const hay = `${t.description} ${catName(t.categoryId)} ${contactName(t.contactId)}`.toLowerCase()
        if (!hay.includes(query.toLowerCase())) return false
      }
      return true
    })
    return list.sort((a, b) => (b.date + (b.createdAt ?? '')).localeCompare(a.date + (a.createdAt ?? '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, filterKind, filterStatus, query, categories, contacts])

  const totalIn = filtered.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const totalOut = filtered.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  async function remove(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar este registro? No se puede deshacer.')) await removeRow('transactions', id)
  }
  async function togglePaid(t: Transaction) {
    if (!t.id) return
    await ldb.transactions.update(t.id, { status: t.status === 'paid' ? 'pending' : 'paid' })
  }

  function exportCSV() {
    const rows: (string | number)[][] = [
      ['Fecha', 'Tipo', 'Categoría', 'Contacto', 'Descripción', 'Método', 'Estado', 'Importe'],
      ...filtered.map((t) => [
        t.date, t.kind === 'income' ? 'Ingreso' : 'Gasto', catName(t.categoryId), contactName(t.contactId),
        t.description, t.paymentMethod, t.status === 'paid' ? 'Pagado' : 'Pendiente',
        t.kind === 'income' ? t.amount : -t.amount,
      ]),
    ]
    downloadCSV(`transacciones-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  if (!txs) return <div className="text-slate-400">Cargando…</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>⬇ Exportar CSV</Button>
          <Button onClick={() => setModal({ kind: lockKind ?? 'income' })}>+ Nuevo</Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <Input placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!lockKind && (
          <div className="w-40">
            <Select value={filterKind} onChange={(e) => setFilterKind(e.target.value as 'all' | Kind)}>
              <option value="all">Todos</option>
              <option value="income">Solo ingresos</option>
              <option value="expense">Solo gastos</option>
            </Select>
          </div>
        )}
        {!pendingOnly && (
          <div className="w-44">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | 'paid' | 'pending')}>
              <option value="all">Cualquier estado</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
            </Select>
          </div>
        )}
      </Card>

      <div className="flex gap-4 text-sm">
        {lockKind !== 'expense' && <span className="text-teal-600">Ingresos: <b>{money(totalIn)}</b></span>}
        {lockKind !== 'income' && <span className="text-red-600">Gastos: <b>{money(totalOut)}</b></span>}
        {!lockKind && <span className="text-slate-600">Neto: <b>{money(totalIn - totalOut)}</b></span>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Sin movimientos" hint={emptyHint} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(t.date)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{t.description || catName(t.categoryId)}</div>
                    {contactName(t.contactId) && <div className="text-xs text-slate-400">{contactName(t.contactId)}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{catName(t.categoryId)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => togglePaid(t)} title="Cambiar estado"><Badge status={t.status} /></button>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${t.kind === 'income' ? 'text-teal-600' : 'text-red-600'}`}>
                    {t.kind === 'income' ? '+' : '−'}{money(t.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => setModal({ kind: t.kind, tx: t })} className="mr-2 text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                    {canDelete && <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.tx ? 'Editar movimiento' : 'Nuevo movimiento'}>
        {modal && <TxForm kind={modal.kind} existing={modal.tx} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
