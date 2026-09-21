import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type RecordCard, type RecordEntry } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { formatDate, todayISO } from '../lib/format'
import { fileToDataURL } from '../lib/image'
import { recordPDF, type PdfBusiness } from '../lib/pdf'
import { Button, Input, Textarea, EmptyState } from './ui'

export default function RecordDetail({
  record,
  onEdit,
  onClose,
}: {
  record: RecordCard
  onEdit: () => void
  onClose: () => void
}) {
  const { current } = useBusiness()
  const entries = useLiveQuery(
    () => ldb.recordEntries.where('recordId').equals(record.id).reverse().sortBy('date'),
    [record.id],
  )
  const [text, setText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [photo, setPhoto] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  async function onPhoto(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      setPhoto(await fileToDataURL(file))
    } catch (e) {
      alert((e as Error).message)
    }
    setBusy(false)
  }

  async function addEntry() {
    if (!text.trim() && !photo) return
    await ldb.recordEntries.add({
      recordId: record.id,
      date,
      text: text.trim(),
      photo,
      createdAt: new Date().toISOString(),
    } as RecordEntry)
    setText('')
    setPhoto(undefined)
    setDate(todayISO())
  }

  async function delEntry(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar esta entrada del seguimiento?')) await removeRow('recordEntries', id)
  }

  async function exportPDF() {
    if (!current || !entries) return
    const biz: PdfBusiness = {
      businessName: current.name,
      sector: current.sector,
      address: current.address,
      phone: current.phone,
      currency: current.currency,
    }
    // El PDF ordena cronológicamente (más antiguo primero)
    const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date))
    recordPDF(record, ordered, biz)
  }

  async function toggleArchive() {
    await ldb.records.update(record.id, { archived: !record.archived })
    onClose()
  }

  async function del() {
    if (!confirm(`¿Eliminar la ficha de "${record.name}" y todo su seguimiento? No se puede deshacer.`)) return
    const kids = await ldb.recordEntries.where('recordId').equals(record.id).toArray()
    for (const e of kids) await removeRow('recordEntries', e.id)
    await removeRow('records', record.id)
    onClose()
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-start gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-2xl text-slate-300">
          {record.photo ? <img src={record.photo} alt={record.name} className="h-full w-full object-cover" /> : '👤'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase text-teal-600">{record.type}</div>
          <h3 className="text-lg font-bold text-slate-800">{record.name}</h3>
          <p className="text-sm text-slate-500">Registrado: {formatDate(record.registeredAt)}</p>
        </div>
      </div>

      {/* Galería */}
      {record.photos && record.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {record.photos.map((p, i) => (
            <a key={i} href={p} target="_blank" rel="noreferrer">
              <img src={p} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
            </a>
          ))}
        </div>
      )}

      {/* Datos */}
      {record.fields.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {record.fields.map((f, i) => (
              <div key={i} className="text-sm">
                <dt className="inline font-medium text-slate-500">{f.label}: </dt>
                <dd className="inline text-slate-800">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={exportPDF}>⬇ Expediente PDF</Button>
        <Button variant="outline" onClick={onEdit}>✎ Editar datos</Button>
        <Button variant="ghost" onClick={toggleArchive}>{record.archived ? 'Reactivar' : 'Archivar'}</Button>
        <Button variant="ghost" onClick={del} className="text-red-600">Eliminar</Button>
      </div>

      {/* Nueva entrada de seguimiento */}
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-sm font-semibold text-slate-700">Añadir seguimiento</div>
        <div className="space-y-2">
          <Textarea
            rows={2}
            placeholder="Ej. Revisión médica, evolución, incidencia, nueva visita…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              {busy ? 'Procesando…' : photo ? '✓ Foto lista' : '📷 Foto'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            {photo && (
              <img src={photo} alt="" className="h-9 w-9 rounded object-cover" />
            )}
            <Button onClick={addEntry} className="ml-auto" disabled={!text.trim() && !photo}>
              Añadir
            </Button>
          </div>
        </div>
      </div>

      {/* Historial */}
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-700">
          Historial de seguimiento {entries && entries.length > 0 && `(${entries.length})`}
        </div>
        {!entries || entries.length === 0 ? (
          <EmptyState title="Sin seguimiento aún" hint="Añade la primera entrada arriba." />
        ) : (
          <ol className="space-y-3">
            {entries.map((e: RecordEntry) => (
              <li key={e.id} className="relative border-l-2 border-teal-200 pl-4">
                <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-teal-500" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{formatDate(e.date)}</span>
                  <button onClick={() => delEntry(e.id)} className="text-xs text-slate-300 hover:text-red-500">
                    eliminar
                  </button>
                </div>
                {e.text && <p className="whitespace-pre-wrap text-sm text-slate-700">{e.text}</p>}
                {e.photo && <img src={e.photo} alt="" className="mt-1 max-h-40 rounded-lg object-cover" />}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
