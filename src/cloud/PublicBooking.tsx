import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Field, Input, Select, Textarea } from '../components/ui'

interface Item { name: string; price: number }
interface PublicBiz {
  id: string
  name: string
  logo?: string | null
  currency: string
  services: Item[]
  products: Item[]
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function fmt(n: number, cur: string) {
  return `${Math.round(n || 0).toLocaleString('es-GQ').replace(/,/g, '.')} ${cur}`
}

// A NIVEL DE MÓDULO: si estuviera dentro del componente, se recrearía en cada
// tecla y el teclado/foco se cerraría al escribir.
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg sm:p-8">{children}</div>
    </div>
  )
}

export default function PublicBooking() {
  const { bid = '' } = useParams()
  const [biz, setBiz] = useState<PublicBiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'cita' | 'pedido'>('cita')
  const [service, setService] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ date: todayISO(), time: '10:00', name: '', phone: '', notes: '' })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('public_business', { p_business: bid })
        if (error || !data) {
          setNotFound(true)
        } else {
          const b = data as PublicBiz
          b.services = b.services || []
          b.products = b.products || []
          setBiz(b)
          setMode(b.services.length ? 'cita' : 'pedido')
        }
      } catch {
        setNotFound(true)
      }
      setLoading(false)
    })()
  }, [bid])

  const hasServices = !!biz?.services.length
  const hasProducts = !!biz?.products.length
  const cur = biz?.currency ?? 'XAF'

  const orderItems = useMemo(
    () => (biz?.products ?? []).map((p) => ({ ...p, q: qty[p.name] || 0 })).filter((x) => x.q > 0),
    [biz, qty],
  )
  const orderTotal = orderItems.reduce((s, x) => s + x.price * x.q, 0)
  const bump = (name: string, d: number) => setQty((q) => ({ ...q, [name]: Math.max(0, (q[name] || 0) + d) }))

  async function submit() {
    setError('')
    if (!form.name.trim() && !form.phone.trim()) { setError('Escribe tu nombre o tu teléfono.'); return }
    if (!form.date) { setError('Elige una fecha.'); return }

    let pService = ''
    let pPrice: number | null = null
    let pTime = form.time
    if (mode === 'cita') {
      if (hasServices && !service) { setError('Elige un servicio.'); return }
      pService = service || form.notes.trim() || 'Cita'
    } else {
      if (orderItems.length === 0) { setError('Elige al menos un producto.'); return }
      pService = 'Pedido: ' + orderItems.map((x) => `${x.q}× ${x.name}`).join(', ')
      pPrice = orderTotal
      pTime = ''
    }

    setBusy(true)
    try {
      const { error } = await supabase.rpc('request_appointment', {
        p_business: bid,
        p_service: pService,
        p_date: form.date,
        p_time: pTime,
        p_client_name: form.name.trim(),
        p_client_phone: form.phone.trim(),
        p_notes: form.notes.trim(),
        p_price: pPrice,
      })
      if (error) throw error
      setSent(true)
    } catch (e) {
      setError((e as Error).message || 'No se pudo enviar la solicitud.')
    }
    setBusy(false)
  }

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
        <h1 className="text-xl font-bold text-slate-800">{mode === 'pedido' ? '¡Pedido enviado!' : '¡Solicitud enviada!'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          <b>{biz.name}</b> recibirá tu {mode === 'pedido' ? 'pedido' : 'solicitud de cita'} para el <b>{form.date}</b>
          {mode === 'cita' && form.time ? ` a las ${form.time}` : ''}. Te confirmarán en cuanto lo revisen.
        </p>
        <p className="mt-4 text-xs text-slate-400">Puedes cerrar esta página.</p>
      </div>
    </Shell>
  )

  const title = mode === 'pedido' ? 'Haz tu pedido' : hasServices ? 'Pide tu cita' : 'Haz tu solicitud'

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-3">
        {biz.logo
          ? <img src={biz.logo} alt={biz.name} className="h-12 w-12 rounded-xl bg-white object-contain shadow-sm" />
          : <div className="grid h-12 w-12 place-items-center rounded-xl bg-teal-100 text-xl">{mode === 'pedido' ? '🛒' : '📅'}</div>}
        <div>
          <h1 className="text-lg font-bold text-slate-800">{biz.name}</h1>
          <p className="text-sm text-slate-500">{title}</p>
        </div>
      </div>

      {/* Si el negocio tiene servicios Y productos, deja elegir */}
      {hasServices && hasProducts && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button onClick={() => setMode('cita')} className={`rounded-md py-2 text-sm font-semibold ${mode === 'cita' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>📅 Pedir cita</button>
          <button onClick={() => setMode('pedido')} className={`rounded-md py-2 text-sm font-semibold ${mode === 'pedido' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>🛒 Hacer pedido</button>
        </div>
      )}

      <div className="space-y-4">
        {mode === 'cita' ? (
          <>
            <Field label="Servicio">
              {hasServices ? (
                <Select value={service} onChange={(e) => setService(e.target.value)}>
                  <option value="">— Elige un servicio —</option>
                  {biz.services.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}{s.price ? ` · ${fmt(s.price, cur)}` : ''}</option>
                  ))}
                </Select>
              ) : (
                <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="¿Qué necesitas?" />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día"><Input type="date" min={todayISO()} value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} /></Field>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Elige tus productos</div>
              <div className="space-y-2">
                {biz.products.map((p) => (
                  <div key={p.name} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                      {p.price ? <div className="text-xs text-slate-400">{fmt(p.price, cur)}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => bump(p.name, -1)} className="grid h-7 w-7 place-items-center rounded bg-slate-100 hover:bg-slate-200">−</button>
                      <span className="w-6 text-center text-sm font-medium">{qty[p.name] || 0}</span>
                      <button onClick={() => bump(p.name, 1)} className="grid h-7 w-7 place-items-center rounded bg-slate-100 hover:bg-slate-200">+</button>
                    </div>
                  </div>
                ))}
              </div>
              {orderTotal > 0 && (
                <div className="mt-2 flex justify-between rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">
                  <span>Total</span><span>{fmt(orderTotal, cur)}</span>
                </div>
              )}
            </div>
            <Field label="¿Para qué día?"><Input type="date" min={todayISO()} value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
          </>
        )}

        <Field label="Tu nombre"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre y apellidos" /></Field>
        <Field label="Tu teléfono (WhatsApp)"><Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+240 …" /></Field>
        <Field label="Comentario (opcional)"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Algo que deban saber…" /></Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={busy}>{busy ? 'Enviando…' : mode === 'pedido' ? 'Enviar pedido' : 'Pedir cita'}</Button>
        <p className="text-center text-xs text-slate-400">Tu {mode === 'pedido' ? 'pedido' : 'solicitud'} queda pendiente hasta que el negocio lo confirme.</p>
      </div>

      <p className="mt-5 text-center text-xs text-slate-300">Con GEmprende · emprendege.mercadosemu.com</p>
    </Shell>
  )
}
