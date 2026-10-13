import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, todayISO } from '../lib/format'
import { fileToDataURL } from '../lib/image'
import { registerOldInvoice, WALK_IN } from '../lib/invoiceLedger'
import { Button, Field, Input } from './ui'
import { Camera, PencilSimpleLine, CheckCircle, Clock, HandCoins } from '@phosphor-icons/react'

type Mode = 'photo' | 'total'
type Pay = 'paid' | 'debt' | 'partial'

// Registrar facturas ANTIGUAS del talonario, una tras otra: con foto de la hoja
// o solo con el total. Cuentan en la caja de su mes, en los clientes y en el
// informe para crédito.
export default function OldInvoiceForm({ onDone }: { onDone: () => void }) {
  const bid = useBusiness().current?.id ?? ''
  const contacts = useLiveQuery(() => (bid ? ldb.contacts.where('businessId').equals(bid).filter((c) => c.type === 'client').toArray() : []), [bid])
  const fileRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('photo')
  const [date, setDate] = useState(todayISO())
  const [total, setTotal] = useState('')
  const [client, setClient] = useState('')
  const [number, setNumber] = useState('')
  const [photo, setPhoto] = useState<string | undefined>()
  const [pay, setPay] = useState<Pay>('paid')
  const [paidAmount, setPaidAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<{ count: number; sum: number }>({ count: 0, sum: 0 })

  async function onPhoto(f?: File) {
    if (!f) return
    setError('')
    try { setPhoto(await fileToDataURL(f, 1200, 0.7)) } catch (e) { setError((e as Error).message) }
  }

  async function save(finish: boolean) {
    setError('')
    const amount = Number(total) || 0
    const name = client.trim()
    if (mode === 'photo' && !photo) { setError('Haz la foto de la hoja del talonario.'); return }
    if (!date) { setError('Pon la fecha de la factura.'); return }
    if (date > todayISO()) { setError('La fecha no puede ser futura.'); return }
    if (amount <= 0) { setError('Escribe el total de la factura.'); return }
    if (pay !== 'paid' && (!name || name === WALK_IN)) { setError('Para apuntar que te deben, escribe el nombre del cliente.'); return }
    if (pay === 'partial' && !(Number(paidAmount) > 0 && Number(paidAmount) < amount)) { setError('Escribe cuánto te pagó (menos que el total).'); return }

    setBusy(true)
    try {
      await registerOldInvoice(bid, {
        date, total: amount, clientName: name, number, photo: mode === 'photo' ? photo : undefined,
        pay, paidAmount: Number(paidAmount) || 0,
      })
      setSaved((s) => ({ count: s.count + 1, sum: s.sum + amount }))
      if (finish) { onDone(); return }
      // Lista para la siguiente (se mantiene el modo y la fecha)
      setTotal(''); setClient(''); setNumber(''); setPhoto(undefined); setPay('paid'); setPaidAmount('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError((e as Error).message || 'No se pudo guardar.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
        <img src="/ill/talonario.webp" alt="" aria-hidden="true" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
        <p className="text-sm text-slate-600">
          Pasa aquí las facturas que hiciste en papel. Se guardan con su fecha y cuentan en tu historial, tus clientes y el informe para crédito.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <button onClick={() => setMode('photo')} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${mode === 'photo' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}><Camera size={18} weight={mode === 'photo' ? 'fill' : 'regular'} /> Con foto</button>
        <button onClick={() => setMode('total')} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${mode === 'total' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}><PencilSimpleLine size={18} weight={mode === 'total' ? 'fill' : 'regular'} /> Solo el total</button>
      </div>

      {saved.count > 0 && (
        <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          <CheckCircle size={16} weight="fill" className="mr-1 inline -mt-0.5" />{saved.count} factura{saved.count > 1 ? 's' : ''} antigua{saved.count > 1 ? 's' : ''} registrada{saved.count > 1 ? 's' : ''} · <span className="ge-nums font-medium">{money(saved.sum)}</span>
        </div>
      )}

      {mode === 'photo' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          {photo ? (
            <div className="relative">
              <img src={photo} alt="Hoja del talonario" className="max-h-64 w-full rounded-xl bg-slate-50 object-contain" />
              <button onClick={() => fileRef.current?.click()} className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm active:scale-95">Cambiar foto</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-8 text-slate-500 active:scale-[0.99]">
              <Camera size={36} weight="duotone" className="text-teal-700" />
              <span className="font-medium">Hacer foto de la hoja</span>
              <span className="text-xs">o elegirla de la galería</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de la factura">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Total">
          <Input type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" className="ge-nums text-lg font-semibold" />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Cliente (opcional)">
          <Input list="ge-old-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nombre" />
        </Field>
        <Field label="Nº (opcional)">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0123" />
        </Field>
      </div>
      <datalist id="ge-old-clients">
        {(contacts ?? []).map((c) => <option key={c.id} value={c.name} />)}
      </datalist>

      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">¿Te la pagaron?</div>
        <div className="grid grid-cols-3 gap-2">
          {([['paid', CheckCircle, 'Sí, pagada'], ['debt', Clock, 'Aún me debe'], ['partial', HandCoins, 'Pagó parte']] as [Pay, typeof CheckCircle, string][]).map(([p, Icon, lbl]) => (
            <button key={p} onClick={() => setPay(p)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-sm font-semibold transition-[transform,background-color] active:scale-95 ${pay === p ? 'bg-teal-700 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'}`}>
              <Icon size={22} weight={pay === p ? 'fill' : 'regular'} />{lbl}
            </button>
          ))}
        </div>
        {pay === 'partial' && (
          <div className="mt-3">
            <Field label="¿Cuánto te pagó?">
              <Input type="number" inputMode="numeric" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" />
            </Field>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-2">
        <Button onClick={() => save(false)} disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Guardar y añadir otra'}</Button>
        <Button variant="outline" onClick={() => (total || photo ? save(true) : onDone())} disabled={busy} className="w-full">
          {total || photo ? 'Guardar y terminar' : 'Terminar'}
        </Button>
      </div>
    </div>
  )
}
