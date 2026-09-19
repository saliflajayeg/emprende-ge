import { useState } from 'react'
import { db, type RecordCard, type RecordField } from '../db/db'
import { todayISO } from '../lib/format'
import { fileToDataURL } from '../lib/image'
import { Button, Field, Input } from './ui'

const SUGGESTED_FIELDS = ['Edad', 'Fecha de nacimiento', 'Teléfono', 'Dirección', 'Procedencia', 'Estado de salud', 'Notas', 'Documento / DNI']

export default function RecordForm({
  existing,
  typeSuggestions,
  defaultType,
  onDone,
}: {
  existing?: RecordCard
  typeSuggestions: string[]
  defaultType?: string
  onDone: () => void
}) {
  const [form, setForm] = useState({
    type: existing?.type ?? defaultType ?? '',
    name: existing?.name ?? '',
    registeredAt: existing?.registeredAt ?? todayISO(),
    photo: existing?.photo,
  })
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const [fields, setFields] = useState<RecordField[]>(
    existing?.fields?.length ? existing.fields : [{ label: '', value: '' }],
  )
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string | undefined) => setForm((f) => ({ ...f, [k]: v }))

  const setField = (i: number, patch: Partial<RecordField>) =>
    setFields((arr) => arr.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const addField = (label = '') => setFields((a) => [...a, { label, value: '' }])
  const removeField = (i: number) => setFields((a) => a.filter((_, idx) => idx !== i))

  async function onPhoto(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      set('photo', await fileToDataURL(file))
    } catch (e) {
      alert((e as Error).message)
    }
    setBusy(false)
  }

  async function onGalleryAdd(files: FileList | null) {
    if (!files || !files.length) return
    setBusy(true)
    try {
      const added: string[] = []
      for (const f of Array.from(files)) added.push(await fileToDataURL(f))
      setPhotos((p) => [...p, ...added])
    } catch (e) {
      alert((e as Error).message)
    }
    setBusy(false)
  }

  async function save() {
    if (!form.name.trim()) return
    const rec: RecordCard = {
      type: form.type.trim() || 'Ficha',
      name: form.name.trim(),
      registeredAt: form.registeredAt,
      photo: form.photo,
      photos,
      fields: fields.filter((f) => f.label.trim() || f.value.trim()),
      archived: existing?.archived ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await db.records.put({ ...rec, id: existing.id })
    else await db.records.add(rec)
    onDone()
  }

  return (
    <div className="space-y-4">
      {/* Foto */}
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-2xl text-slate-300">
          {form.photo ? (
            <img src={form.photo} alt="Foto" className="h-full w-full object-cover" />
          ) : (
            '👤'
          )}
        </div>
        <div className="space-y-1">
          <label className="inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {busy ? 'Procesando…' : form.photo ? 'Cambiar foto' : '📷 Añadir foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          {form.photo && (
            <button onClick={() => set('photo', undefined)} className="block text-xs text-red-500 hover:underline">
              Quitar foto
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre *">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Tipo de ficha">
          <Input
            list="tipos-ficha"
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            placeholder="Niño, Cliente…"
          />
          <datalist id="tipos-ficha">
            {typeSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Fecha de registro / llegada">
        <Input type="date" value={form.registeredAt} onChange={(e) => set('registeredAt', e.target.value)} />
      </Field>

      {/* Galería de fotos adicionales */}
      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">Más fotos (galería)</div>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              <img src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button
                onClick={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-xs text-white"
                title="Quitar"
              >
                ✕
              </button>
            </div>
          ))}
          <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-2xl text-slate-300 hover:border-teal-400 hover:text-teal-400">
            +
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onGalleryAdd(e.target.files)} />
          </label>
        </div>
      </div>

      {/* Campos personalizados */}
      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">Datos</div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_20px] items-center gap-2">
              <Input placeholder="Etiqueta" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} list="campos-sug" />
              <Input placeholder="Valor" value={f.value} onChange={(e) => setField(i, { value: e.target.value })} />
              <button onClick={() => removeField(i)} className="text-slate-400 hover:text-red-600" title="Quitar">✕</button>
            </div>
          ))}
          <datalist id="campos-sug">
            {SUGGESTED_FIELDS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => addField()} className="text-sm font-medium text-teal-600 hover:underline">
            + Añadir dato
          </button>
          {SUGGESTED_FIELDS.slice(0, 4).map((s) => (
            <button
              key={s}
              onClick={() => addField(s)}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-200"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1" disabled={!form.name.trim()}>
          {existing ? 'Guardar cambios' : 'Crear ficha'}
        </Button>
      </div>
    </div>
  )
}
