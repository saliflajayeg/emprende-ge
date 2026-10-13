import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ldb, removeRow, type Transaction, type Kind } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, formatDate } from '../lib/format'
import { downloadCSV } from '../lib/csv'
import { Button, Card, Modal, Badge, Input, EmptyState, IconButton } from '../components/ui'
import TxForm from '../components/TxForm'
import QuickExpenseForm from '../components/QuickExpenseForm'
import { usesQuickExpense } from '../modules'
import { FileXls, Plus, MagnifyingGlass, ArrowDownLeft, ArrowUpRight, Receipt, PencilSimple, Trash } from '@phosphor-icons/react'

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
  const { current } = useBusiness()
  const navigate = useNavigate()
  const bid = current?.id ?? ''
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
        <h1 className="text-[1.7rem] font-bold leading-tight text-slate-900">{title}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><FileXls size={18} /> Exportar</Button>
          <Button onClick={() => setModal({ kind: lockKind ?? 'income' })}><Plus size={18} weight="bold" /> Nuevo</Button>
        </div>
      </div>

      {/* Totales del filtro */}
      <div className={`grid gap-3 ${lockKind ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {lockKind !== 'expense' && (
          <div className="rounded-2xl bg-white p-3.5 shadow-[0_8px_24px_-14px_rgba(43,39,34,0.2)] ring-1 ring-slate-200/70">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><ArrowDownLeft size={14} weight="bold" className="text-teal-700" /> Ingresos</div>
            <div className="ge-nums mt-0.5 truncate text-lg font-extrabold text-teal-700">{money(totalIn)}</div>
          </div>
        )}
        {lockKind !== 'income' && (
          <div className="rounded-2xl bg-white p-3.5 shadow-[0_8px_24px_-14px_rgba(43,39,34,0.2)] ring-1 ring-slate-200/70">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><ArrowUpRight size={14} weight="bold" className="text-red-600" /> Gastos</div>
            <div className="ge-nums mt-0.5 truncate text-lg font-extrabold text-red-600">{money(totalOut)}</div>
          </div>
        )}
        {!lockKind && (
          <div className="col-span-2 -mt-1 text-sm text-slate-600">Neto: <b className="ge-nums">{money(totalIn - totalOut)}</b></div>
        )}
      </div>

      {/* Búsqueda y filtros */}
      <div className="space-y-2.5">
        <div className="relative">
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-2">
          {!lockKind && ([['all', 'Todo'], ['income', 'Ingresos'], ['expense', 'Gastos']] as ['all' | Kind, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilterKind(k)} className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-[transform,background-color] active:scale-95 ${filterKind === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{l}</button>
          ))}
          {!pendingOnly && ([['all', 'Todos'], ['paid', 'Pagados'], ['pending', 'Pendientes']] as ['all' | 'paid' | 'pending', string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilterStatus(k)} className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-[transform,background-color] active:scale-95 ${filterStatus === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{l}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState image={lockKind === 'expense' ? '/ill/gastos.webp' : lockKind === 'income' ? '/ill/hero-vendedora.webp' : undefined} title={lockKind === 'expense' ? 'Apunta tus gastos' : lockKind === 'income' ? 'Aquí verás tus ventas' : 'Sin movimientos'} hint={emptyHint} />
      ) : (
        <>
          {/* Móvil: lista compacta */}
          <Card className="p-0 sm:hidden">
            <ul className="divide-y divide-slate-100">
              {filtered.map((t) => {
                const inc = t.kind === 'income'
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => (t.invoiceId ? navigate('/facturas') : setModal({ kind: t.kind, tx: t }))}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.invoiceId ? 'bg-teal-50 text-teal-700' : inc ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-600'}`}>
                        {t.invoiceId ? <Receipt size={20} weight="duotone" /> : inc ? <ArrowDownLeft size={20} weight="bold" /> : <ArrowUpRight size={20} weight="bold" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{t.description || catName(t.categoryId)}</span>
                        <span className="block truncate text-xs text-slate-500">{formatDate(t.date)} · {catName(t.categoryId)}{contactName(t.contactId) ? ` · ${contactName(t.contactId)}` : ''}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`ge-nums block text-sm font-extrabold ${inc ? 'text-teal-700' : 'text-red-600'}`}>{inc ? '+' : '−'}{money(t.amount)}</span>
                        {t.status === 'pending' && <span className="mt-0.5 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">Pendiente</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          {/* Tableta / ordenador: tabla */}
          <Card className="hidden overflow-x-auto p-0 sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
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
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800">{t.invoiceId && <Receipt size={16} weight="duotone" className="shrink-0 text-teal-700" aria-label="Viene de una factura" />}{t.description || catName(t.categoryId)}</div>
                    {contactName(t.contactId) && <div className="text-xs text-slate-400">{contactName(t.contactId)}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{catName(t.categoryId)}</td>
                  <td className="px-4 py-3">
                    {t.invoiceId
                      ? <Badge status={t.status} />
                      : <button onClick={() => togglePaid(t)} title="Cambiar estado"><Badge status={t.status} /></button>}
                  </td>
                  <td className={`ge-nums px-4 py-3 text-right font-bold ${t.kind === 'income' ? 'text-teal-700' : 'text-red-600'}`}>
                    {t.kind === 'income' ? '+' : '−'}{money(t.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {t.invoiceId ? (
                      // Los cobros/deudas de una factura se gestionan desde Facturas
                      <button onClick={() => navigate('/facturas')} className="text-xs font-semibold text-teal-700">Ver factura →</button>
                    ) : (
                      <div className="flex justify-end gap-0.5">
                        <IconButton onClick={() => setModal({ kind: t.kind, tx: t })} title="Editar"><PencilSimple size={20} /></IconButton>
                        {canDelete && <IconButton onClick={() => remove(t.id)} title="Eliminar" className="text-slate-400 hover:text-red-600"><Trash size={20} /></IconButton>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </Card>
        </>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.tx ? 'Editar movimiento' : modal?.kind === 'expense' ? 'Registrar gasto' : 'Nuevo movimiento'}>
        {modal && (modal.kind === 'expense' && usesQuickExpense(current?.businessType) ? (
          <QuickExpenseForm existing={modal.tx} onDone={() => setModal(null)} />
        ) : (
          <TxForm kind={modal.kind} existing={modal.tx} onDone={() => setModal(null)} />
        ))}
      </Modal>
    </div>
  )
}
