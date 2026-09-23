import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ldb } from '../cloud/localdb'
import { money, formatDate, todayISO } from '../lib/format'
import { Card } from './ui'

// Desplaza una fecha 'YYYY-MM-DD' n días (aritmética en UTC para no
// desfasar por zona horaria al convertir a ISO).
function shiftDay(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekday(iso: string): string {
  const w = new Date(iso + 'T00:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' })
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
  done: { label: 'Atendida', cls: 'bg-teal-50 text-teal-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500' },
}
const JOB_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'En curso', cls: 'bg-sky-50 text-sky-700' },
  done: { label: 'Terminado', cls: 'bg-teal-50 text-teal-700' },
}

export default function DayAgenda({ bid, enabled, recordsLabel }: { bid: string; enabled: string[]; recordsLabel?: string }) {
  const navigate = useNavigate()
  const [day, setDay] = useState(todayISO())
  const has = (id: string) => enabled.includes(id)
  const hasMoney = ['sales', 'expenses', 'transactions', 'debts', 'collections', 'invoices'].some(has)
  const hasAppointments = has('appointments')
  const hasJobs = has('jobs')
  const hasRecords = has('records')

  const appts = useLiveQuery(
    () => (bid && hasAppointments ? ldb.appointments.where('businessId').equals(bid).filter((a) => a.date === day).toArray() : []),
    [bid, day, hasAppointments],
  )
  const jobs = useLiveQuery(
    () => (bid && hasJobs ? ldb.jobs.where('businessId').equals(bid).filter((j) => j.dueDate === day).toArray() : []),
    [bid, day, hasJobs],
  )
  const records = useLiveQuery(
    () => (bid && hasRecords ? ldb.records.where('businessId').equals(bid).filter((r) => r.registeredAt === day).toArray() : []),
    [bid, day, hasRecords],
  )
  const txs = useLiveQuery(
    () => (bid && hasMoney ? ldb.transactions.where('businessId').equals(bid).filter((t) => t.date === day).toArray() : []),
    [bid, day, hasMoney],
  )

  const apptList = useMemo(() => [...(appts ?? [])].sort((a, b) => (a.time || '').localeCompare(b.time || '')), [appts])
  const dayIncome = (txs ?? []).filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const dayExpense = (txs ?? []).filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  const today = todayISO()
  const rel =
    day === today ? 'Hoy' : day === shiftDay(today, -1) ? 'Ayer' : day === shiftDay(today, 1) ? 'Mañana' : null

  const recLabel = recordsLabel || 'Fichas'

  return (
    <Card className="p-0">
      {/* Navegación de día */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <button onClick={() => setDay(shiftDay(day, -1))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Día anterior">‹</button>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-800">
            {weekday(day)}, {formatDate(day)}
            {rel && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">{rel}</span>}
          </div>
          {day !== today && (
            <button onClick={() => setDay(today)} className="text-xs text-teal-600 hover:underline">Volver a hoy</button>
          )}
        </div>
        <button onClick={() => setDay(shiftDay(day, 1))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Día siguiente">›</button>
      </div>

      <div className="space-y-4 p-4">
        {/* Ventas / movimientos del día */}
        {hasMoney && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">💵 Ventas del día</h3>
              <button onClick={() => navigate('/ventas')} className="text-xs text-teal-600 hover:underline">Ver ventas</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-teal-50 px-3 py-2">
                <div className="text-lg font-bold text-teal-700">{money(dayIncome)}</div>
                <div className="text-xs text-slate-500">ingresos</div>
              </div>
              <div className="rounded-lg bg-red-50 px-3 py-2">
                <div className="text-lg font-bold text-red-600">{money(dayExpense)}</div>
                <div className="text-xs text-slate-500">gastos</div>
              </div>
            </div>
            {(txs ?? []).length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100">
                {(txs ?? []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="min-w-0 truncate text-slate-600">{t.description || (t.kind === 'income' ? 'Ingreso' : 'Gasto')}</span>
                    <span className={`ml-2 shrink-0 font-medium ${t.kind === 'income' ? 'text-teal-700' : 'text-red-600'}`}>
                      {t.kind === 'income' ? '+' : '−'}{money(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Citas del día */}
        {hasAppointments && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">📅 Citas del día</h3>
              <button onClick={() => navigate('/citas')} className="text-xs text-teal-600 hover:underline">Ver todas</button>
            </div>
            {apptList.length === 0 ? (
              <p className="text-sm text-slate-400">Sin citas este día.</p>
            ) : (
              <ul className="space-y-1.5">
                {apptList.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm font-bold text-teal-700">{a.time || '—'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{a.clientName || 'Cliente'}</div>
                      <div className="truncate text-xs text-slate-500">{a.service}{a.price ? ` · ${money(a.price)}` : ''}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${APPT_STATUS[a.status]?.cls ?? ''}`}>{APPT_STATUS[a.status]?.label ?? a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Trabajos que vencen ese día */}
        {hasJobs && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">🛠️ Trabajos del día</h3>
              <button onClick={() => navigate('/trabajos')} className="text-xs text-teal-600 hover:underline">Ver todos</button>
            </div>
            {(jobs ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Sin trabajos para este día.</p>
            ) : (
              <ul className="space-y-1.5">
                {(jobs ?? []).map((j) => (
                  <li key={j.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{j.title}</div>
                      {j.clientName && <div className="truncate text-xs text-slate-500">{j.clientName}</div>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${JOB_STATUS[j.status]?.cls ?? ''}`}>{JOB_STATUS[j.status]?.label ?? j.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Fichas registradas ese día (acogidas / ONG) */}
        {hasRecords && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">🗂️ {recLabel} registradas</h3>
              <button onClick={() => navigate('/fichas')} className="text-xs text-teal-600 hover:underline">Ver todas</button>
            </div>
            {(records ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Ninguna registrada este día.</p>
            ) : (
              <ul className="space-y-1.5">
                {(records ?? []).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-200 text-sm text-slate-400">
                      {r.photo ? <img src={r.photo} alt="" className="h-full w-full object-cover" /> : '👤'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="truncate text-xs text-slate-500">{r.type}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Card>
  )
}
