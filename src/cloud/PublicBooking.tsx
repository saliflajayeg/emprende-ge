import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Field, Input, Select, Textarea } from '../components/ui'

interface PublicBiz {
  id: string
  name: string
  logo?: string | null
  currency: string
  services: { name: string; price: number }[]
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function PublicBooking() {
  const { bid = '' } = useParams()
  const [biz, setBiz] = useState<PublicBiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ service: '', date: todayISO(), time: '10:00', name: '', phone: '', notes: '' })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('public_business', { p_business: bid })
        if (error || !data) { setNotFound(true) } else { setBiz(data as PublicBiz) }
      } catch {
        setNotFound(true)
      }
      setLoading(false)
    })()
  }, [bid])

  async function submit() {
    setError('')
    if (!form.name.trim() && !form.phone.trim()) { setError('Escribe tu nombre o tu teléfono.'); return }
    if (!form.date) { setError('Elige una fecha.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('request_appointment', {
        p_business: bid,
        p_service: form.service.trim(),
        p_date: form.date,
        p_time: form.time,
        p_client_name: form.name.trim(),
        p_client_phone: form.phone.trim(),
        p_notes: form.notes.trim(),
      })
      if (error) throw error
      setSent(true)
    } catch (e) {
      setError((e as Error).message || 'No se pudo enviar la solicitud.')
    }
    setBusy(false)
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg sm:p-8">{children}</div>
    </div>
  )

  if (loading) return <Shell><p className="text-center text-slate-400">Cargando…</p></Shell>
  if (notFound || !biz) return (
    <Shell>
      <div className="text-center">
        <div className="mb-2 text-3xl">🔍</div>
        <h1 className="text-lg font-bold text-slate-800">Negocio no encontrado</h1>
        <p className="mt-1 text-sm text-slate-500">El enlace no es válido o el negocio ya no está disponible.</p>
      </div>
    </Shell>
  )

  if (sent) return (
    <Shell>
      <div className="text-center">
        <div className="mb-2 text-4xl">✅</div>
        <h1 className="text-xl font-bold text-slate-800">¡Solicitud enviada!</h1>
        <p className="mt-2 text-sm text-slate-600">
          <b>{biz.name}</b> recibirá tu solicitud de cita para el <b>{form.date}</b>
          {form.time ? ` a las ${form.time}` : ''}. Te confirmarán en cuanto la aprueben.
        </p>
        <p className="mt-4 text-xs text-slate-400">Puedes cerrar esta página.</p>
      </div>
    </Shell>
  )

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-3">
        {biz.logo
          ? <img src={biz.logo} alt={biz.name} className="h-12 w-12 rounded-xl bg-white object-contain shadow-sm" />
          : <div className="grid h-12 w-12 place-items-center rounded-xl bg-teal-100 text-xl">📅</div>}
        <div>
          <h1 className="text-lg font-bold text-slate-800">{biz.name}</h1>
          <p className="text-sm text-slate-500">Pide tu cita</p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Servicio">
          {biz.services.length > 0 ? (
            <Select value={form.service} onChange={(e) => set('service', e.target.value)}>
              <option value="">— Elige un servicio —</option>
              {biz.services.map((s) => (
                <option key={s.name} value={s.name}>{s.name}{s.price ? ` · ${s.price.toLocaleString('es-GQ').replace(/,/g, '.')} ${biz.currency}` : ''}</option>
              ))}
            </Select>
          ) : (
            <Input value={form.service} onChange={(e) => set('service', e.target.value)} placeholder="¿Qué necesitas?" />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día"><Input type="date" min={todayISO()} value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} /></Field>
        </div>
        <Field label="Tu nombre"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre y apellidos" /></Field>
        <Field label="Tu teléfono (WhatsApp)"><Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+240 …" /></Field>
        <Field label="Comentario (opcional)"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Algo que deban saber…" /></Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={busy}>{busy ? 'Enviando…' : 'Pedir cita'}</Button>
        <p className="text-center text-xs text-slate-400">Tu solicitud queda pendiente hasta que el negocio la confirme.</p>
      </div>

      <p className="mt-5 text-center text-xs text-slate-300">Con GEmprende · emprendege.mercadosemu.com</p>
    </Shell>
  )
}
