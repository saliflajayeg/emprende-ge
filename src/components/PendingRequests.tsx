import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Appointment } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { money, formatDate } from '../lib/format'
import { Button, Card } from './ui'

// Solicitudes públicas (citas o pedidos) pendientes de aprobación. Se muestra en
// el Panel para cualquier tipo de negocio, y también en Citas.
export default function PendingRequests() {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const reqs = useLiveQuery(
    () => (bid ? ldb.appointments.where('businessId').equals(bid).filter((a) => a.approved === false && a.status !== 'cancelled').toArray() : []),
    [bid],
  )
  if (!reqs || reqs.length === 0) return null
  const sorted = [...reqs].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  async function approve(a: Appointment) {
    if (!a.id) return
    await ldb.appointments.update(a.id, { approved: true, status: 'pending' })
    const digits = (a.clientPhone || '').replace(/[^0-9]/g, '')
    const msg = `✅ Hola ${a.clientName || ''}, tu solicitud en ${current?.name || ''} ha sido confirmada para el ${formatDate(a.date)}${a.time ? ` a las ${a.time}` : ''}${a.service ? ` · ${a.service}` : ''}. ¡Gracias!`
    if (digits.length >= 8) window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }
  async function reject(a: Appointment) {
    if (!a.id) return
    if (confirm('¿Rechazar esta solicitud?')) await ldb.appointments.update(a.id, { status: 'cancelled', approved: true })
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="text-sm font-semibold text-amber-800">🔔 Solicitudes por aprobar ({sorted.length})</div>
      {sorted.map((a) => (
        <Card key={a.id} className="flex flex-wrap items-center gap-3">
          <div className="text-center">
            <div className="text-xs uppercase text-slate-400">{formatDate(a.date)}</div>
            {a.time && <div className="text-lg font-bold text-teal-700">{a.time}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-800">{a.clientName || 'Cliente'}{a.clientPhone ? ` · ${a.clientPhone}` : ''}</div>
            <div className="text-sm text-slate-500">{a.service}{a.price ? ` · ${money(a.price)}` : ''}</div>
            {a.notes && <div className="text-xs text-slate-400">{a.notes}</div>}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => approve(a)} className="px-3 py-1.5 text-sm">✓ Aprobar</Button>
            <Button variant="outline" onClick={() => reject(a)} className="px-3 py-1.5 text-sm">Rechazar</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
