import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type RecordCard } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { formatDate } from '../lib/format'
import { Button, Card, Modal, Input, Select, EmptyState } from '../components/ui'
import RecordForm from '../components/RecordForm'
import RecordDetail from '../components/RecordDetail'

export default function Records() {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const records = useLiveQuery(() => (bid ? ldb.records.where('businessId').equals(bid).toArray() : []), [bid])
  const entryCounts = useLiveQuery(async () => {
    if (!bid) return {}
    const all = await ldb.recordEntries.where('businessId').equals(bid).toArray()
    const map: Record<string, number> = {}
    for (const e of all) map[e.recordId] = (map[e.recordId] ?? 0) + 1
    return map
  }, [bid])

  const label = current?.recordsLabel || 'Fichas'

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [detail, setDetail] = useState<RecordCard | null>(null)
  const [formModal, setFormModal] = useState<null | { rec?: RecordCard }>(null)

  const types = useMemo(
    () => [...new Set((records ?? []).map((r) => r.type).filter(Boolean))].sort(),
    [records],
  )

  const filtered = useMemo(() => {
    return (records ?? [])
      .filter((r) => (showArchived ? r.archived : !r.archived))
      .filter((r) => typeFilter === 'all' || r.type === typeFilter)
      .filter((r) => {
        if (!query) return true
        const hay = `${r.name} ${r.type} ${r.fields.map((f) => f.value).join(' ')}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [records, showArchived, typeFilter, query])

  if (!records) return <div className="text-slate-400">Cargando…</div>

  // Mantener el detalle sincronizado con la BD (tras editar)
  const liveDetail = detail ? records.find((r) => r.id === detail.id) ?? null : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{label}</h1>
          <p className="text-sm text-slate-500">Expedientes con foto, datos y seguimiento en el tiempo</p>
        </div>
        <Button onClick={() => setFormModal({})}>+ Nueva ficha</Button>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-[140px] flex-1">
          <Input placeholder="Buscar por nombre o dato…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="w-44">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">Todos los tipos</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archivadas
        </label>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={showArchived ? 'Sin fichas archivadas' : 'Sin fichas todavía'}
          hint={showArchived ? undefined : 'Crea la primera ficha: una persona, un cliente, un expediente…'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => setDetail(r)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-teal-300 hover:shadow"
            >
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-xl text-slate-300">
                {r.photo ? <img src={r.photo} alt={r.name} className="h-full w-full object-cover" /> : '👤'}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-800">{r.name}</div>
                <div className="text-xs text-slate-400">
                  {r.type} · {formatDate(r.registeredAt)}
                </div>
                <div className="text-xs text-teal-600">
                  {(entryCounts?.[r.id] ?? 0)} entrada(s) de seguimiento
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detalle */}
      <Modal open={!!liveDetail} onClose={() => setDetail(null)} title={liveDetail?.name ?? ''}>
        {liveDetail && (
          <RecordDetail
            record={liveDetail}
            onEdit={() => setFormModal({ rec: liveDetail })}
            onClose={() => setDetail(null)}
          />
        )}
      </Modal>

      {/* Alta / edición */}
      <Modal
        open={formModal !== null}
        onClose={() => setFormModal(null)}
        title={formModal?.rec ? 'Editar ficha' : 'Nueva ficha'}
      >
        {formModal && (
          <RecordForm
            existing={formModal.rec}
            typeSuggestions={types}
            defaultType={typeFilter !== 'all' ? typeFilter : undefined}
            onDone={() => setFormModal(null)}
          />
        )}
      </Modal>
    </div>
  )
}
