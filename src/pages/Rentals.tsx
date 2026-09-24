import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Unit, type UnitType, type UnitStatus, type RentFreq, type Transaction, type Category } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { money, formatDate, todayISO, currentMonthKey, monthLabel } from '../lib/format'
import { Button, Card, Modal, Field, Input, Select, Textarea, EmptyState } from '../components/ui'

const TYPE_LABEL: Record<UnitType, string> = { apartment: 'Apartamento', room: 'Habitación', commercial: 'Local', other: 'Otro' }
const TYPE_ICON: Record<UnitType, string> = { apartment: '🏢', room: '🛏️', commercial: '🏬', other: '🏠' }

const FREQ_LABEL: Record<RentFreq, string> = { monthly: 'Mensual', bimonthly: 'Bimensual', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' }
const FREQ_UNIT: Record<RentFreq, string> = { monthly: 'mes', bimonthly: 'bimestre', quarterly: 'trimestre', semiannual: 'semestre', annual: 'año' }

// Desplaza un mes 'YYYY-MM' n meses (aritmética en UTC)
function shiftMonth(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Clave del periodo de facturación de una unidad para el mes de referencia 'ym',
// según su frecuencia. Un trimestral comparte clave en sus 3 meses.
function periodKey(freq: RentFreq, ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  switch (freq) {
    case 'bimonthly': return `${y}-B${Math.ceil(m / 2)}`
    case 'quarterly': return `${y}-Q${Math.ceil(m / 3)}`
    case 'semiannual': return `${y}-S${m <= 6 ? 1 : 2}`
    case 'annual': return `${y}`
    default: return `${y}-${String(m).padStart(2, '0')}`
  }
}

const ORD = ['', '1.º', '2.º', '3.er', '4.º', '5.º', '6.º']

// Etiqueta legible de una clave de periodo (para el historial y las tarjetas).
function labelPeriodKey(key: string): string {
  let mt
  if ((mt = key.match(/^(\d{4})-(\d{2})$/))) return monthLabel(key)
  if ((mt = key.match(/^(\d{4})-B(\d)$/))) return `${ORD[+mt[2]]} bimestre ${mt[1]}`
  if ((mt = key.match(/^(\d{4})-Q(\d)$/))) return `${ORD[+mt[2]]} trimestre ${mt[1]}`
  if ((mt = key.match(/^(\d{4})-S(\d)$/))) return `${ORD[+mt[2]]} semestre ${mt[1]}`
  if ((mt = key.match(/^(\d{4})$/))) return `Año ${mt[1]}`
  return key
}

// Nombre del mes en un idioma concreto (para el recordatorio multilingüe)
function monthIn(period: string, locale: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function UnitForm({ existing, onDone }: { existing?: Unit; onDone: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    type: (existing?.type ?? 'apartment') as UnitType,
    rent: existing?.rent ? String(existing.rent) : '',
    tenantName: existing?.tenantName ?? '',
    tenantPhone: existing?.tenantPhone ?? '',
    deposit: existing?.deposit ? String(existing.deposit) : '',
    status: (existing?.status ?? 'occupied') as UnitStatus,
    frequency: (existing?.frequency ?? 'monthly') as RentFreq,
    notes: existing?.notes ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    const rec = {
      name: form.name.trim(),
      type: form.type,
      rent: Number(form.rent) || 0,
      tenantName: form.tenantName.trim(),
      tenantPhone: form.tenantPhone.trim(),
      deposit: form.deposit ? Number(form.deposit) : undefined,
      status: form.status,
      frequency: form.frequency,
      notes: form.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing?.id) await ldb.units.update(existing.id, rec)
    else await ldb.units.add(rec as Unit)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre / número *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Apto 2B, Habitación 3, Local calle X" /></Field>
        <Field label="Tipo">
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="apartment">Apartamento</option>
            <option value="room">Habitación</option>
            <option value="commercial">Local</option>
            <option value="other">Otro</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Renta por ${FREQ_UNIT[form.frequency]}`}><Input type="number" value={form.rent} onChange={(e) => set('rent', e.target.value)} placeholder="0" /></Field>
        <Field label="Frecuencia de pago">
          <Select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
            <option value="monthly">Mensual</option>
            <option value="bimonthly">Bimensual (cada 2 meses)</option>
            <option value="quarterly">Trimestral (cada 3 meses)</option>
            <option value="semiannual">Semestral (cada 6 meses)</option>
            <option value="annual">Anual</option>
          </Select>
        </Field>
      </div>
      <Field label="Estado">
        <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="occupied">Ocupado</option>
          <option value="vacant">Vacío</option>
        </Select>
      </Field>
      <Field label="Inquilino"><Input value={form.tenantName} onChange={(e) => set('tenantName', e.target.value)} placeholder="Nombre del inquilino" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono del inquilino"><Input value={form.tenantPhone} onChange={(e) => set('tenantPhone', e.target.value)} placeholder="+240 …" /></Field>
        <Field label="Fianza / depósito"><Input type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} placeholder="0" /></Field>
      </div>
      <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button onClick={save} className="flex-1" disabled={!form.name.trim()}>{existing ? 'Guardar' : 'Añadir'}</Button>
      </div>
    </div>
  )
}

function History({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const bid = useBusiness().current?.id ?? ''
  const { canDelete } = usePerms()
  const pays = useLiveQuery(
    () => (bid ? ldb.transactions.where('businessId').equals(bid).filter((t) => t.unitId === unit.id).toArray() : []),
    [bid, unit.id],
  )
  const list = useMemo(() => [...(pays ?? [])].sort((a, b) => (b.period || '').localeCompare(a.period || '')), [pays])

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="font-semibold text-slate-800">{TYPE_ICON[unit.type]} {unit.name}</div>
        <div className="text-slate-500">{unit.tenantName || 'Sin inquilino'} · Renta {money(unit.rent)}</div>
      </div>
      <div className="text-sm font-semibold text-slate-700">Historial de pagos</div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">Todavía no hay pagos registrados.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium text-slate-800">{p.period ? labelPeriodKey(p.period) : '—'}</div>
                <div className="text-xs text-slate-400">Pagado el {formatDate(p.date)}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-teal-700">{money(p.amount)}</span>
                {canDelete && (
                  <button onClick={() => removeRow('transactions', p.id)} className="text-slate-300 hover:text-red-500" title="Anular pago">✕</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" onClick={onClose} className="w-full">Cerrar</Button>
    </div>
  )
}

export default function Rentals() {
  const { current } = useBusiness()
  const bid = current?.id ?? ''
  const units = useLiveQuery(() => (bid ? ldb.units.where('businessId').equals(bid).toArray() : []), [bid])
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).toArray() : []), [bid])
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const { canDelete } = usePerms()
  const [period, setPeriod] = useState(currentMonthKey())
  const [modal, setModal] = useState<null | { unit?: Unit }>(null)
  const [history, setHistory] = useState<Unit | null>(null)

  if (!units || !txs) return <div className="text-slate-400">Cargando…</div>

  const sorted = [...units].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'occupied' ? -1 : 1))
  // El periodo de cada unidad depende de su frecuencia y del mes de referencia.
  const unitPeriod = (u: Unit) => periodKey(u.frequency ?? 'monthly', period)
  const paymentFor = (u: Unit) => txs.find((t) => t.unitId === u.id && t.period === unitPeriod(u))

  const occupied = units.filter((u) => u.status === 'occupied')
  const expected = occupied.reduce((s, u) => s + (u.rent || 0), 0)
  const collected = occupied.reduce((s, u) => { const p = paymentFor(u); return s + (p ? p.amount : 0) }, 0)
  const pending = Math.max(0, expected - collected)

  async function ensureRentCategory(): Promise<string | undefined> {
    const found = (categories ?? []).find((c) => c.kind === 'income' && /alquiler/i.test(c.name))
    if (found) return found.id
    return (await ldb.categories.add({ kind: 'income', name: 'Alquileres', color: '#0ea5e9' } as Category)) as string
  }

  async function markPaid(unit: Unit) {
    const catId = await ensureRentCategory()
    await ldb.transactions.add({
      kind: 'income',
      date: todayISO(),
      amount: unit.rent || 0,
      description: `Renta · ${unit.name}${unit.tenantName ? ` (${unit.tenantName})` : ''}`,
      categoryId: catId,
      unitId: unit.id,
      period: unitPeriod(unit),
      status: 'paid',
      paymentMethod: 'Efectivo',
      createdAt: new Date().toISOString(),
    } as Transaction)
  }

  async function unmark(unit: Unit) {
    const pay = paymentFor(unit)
    if (pay) await removeRow('transactions', pay.id)
  }

  // Recordatorio de pago por WhatsApp, con el mensaje escrito en ES / FR / EN
  function remind(unit: Unit) {
    const rent = money(unit.rent)
    const name = unit.tenantName || ''
    const biz = current?.name || ''
    const perLabel = (locale: string) => (!unit.frequency || unit.frequency === 'monthly' ? monthIn(period, locale) : labelPeriodKey(unitPeriod(unit)))
    const es = perLabel('es-ES'), fr = perLabel('fr-FR'), en = perLabel('en-US')
    const msg =
      `Hola ${name}, le recordamos amablemente el pago del alquiler de "${unit.name}" correspondiente a ${es}: ${rent}. Gracias.\n\n` +
      `Bonjour ${name}, nous vous rappelons aimablement le paiement du loyer de « ${unit.name} » pour ${fr} : ${rent}. Merci.\n\n` +
      `Hello ${name}, this is a friendly reminder for the rent payment of "${unit.name}" for ${en}: ${rent}. Thank you.` +
      (biz ? `\n\n— ${biz}` : '')
    const digits = (unit.tenantPhone || '').replace(/[^0-9]/g, '')
    const base = digits.length >= 8 ? `https://wa.me/${digits}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  async function removeUnit(u: Unit) {
    if (confirm(`¿Eliminar "${u.name}"? Su historial de pagos quedará sin unidad asignada.`)) await removeRow('units', u.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Alquileres</h1>
        <Button onClick={() => setModal({})}>+ Nueva unidad</Button>
      </div>

      {/* Selector de mes */}
      <Card className="flex items-center justify-between">
        <button onClick={() => setPeriod(shiftMonth(period, -1))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">‹</button>
        <div className="text-center">
          <div className="font-bold text-slate-800">{monthLabel(period)}</div>
          {period !== currentMonthKey() && (
            <button onClick={() => setPeriod(currentMonthKey())} className="text-xs text-teal-600 hover:underline">Mes actual</button>
          )}
        </div>
        <button onClick={() => setPeriod(shiftMonth(period, 1))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">›</button>
      </Card>

      <Card className="grid grid-cols-3 gap-2 text-center">
        <div className="min-w-0">
          <div className="truncate text-xs uppercase tracking-wide text-slate-400">Cobrado</div>
          <div className="break-words text-sm font-bold leading-tight text-teal-600 sm:text-lg">{money(collected)}</div>
        </div>
        <div className="min-w-0 border-x border-slate-100">
          <div className="truncate text-xs uppercase tracking-wide text-slate-400">Pendiente</div>
          <div className={`break-words text-sm font-bold leading-tight sm:text-lg ${pending > 0 ? 'text-red-600' : 'text-teal-600'}`}>{money(pending)}</div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs uppercase tracking-wide text-slate-400">Esperado</div>
          <div className="break-words text-sm font-bold leading-tight text-slate-700 sm:text-lg">{money(expected)}</div>
        </div>
      </Card>
      <p className="-mt-2 text-xs text-slate-400">Se muestra el pago que corresponde a cada unidad según su frecuencia en {monthLabel(period)}.</p>

      {units.length === 0 ? (
        <EmptyState title="Sin unidades" hint="Añade tu primer apartamento, habitación o local." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((u) => {
            const pay = paymentFor(u)
            const vacant = u.status === 'vacant'
            const freq = u.frequency ?? 'monthly'
            return (
              <Card key={u.id}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{TYPE_ICON[u.type]} {u.name}</div>
                    <div className="text-xs text-slate-400">{TYPE_LABEL[u.type]}{vacant ? ' · Vacío' : u.tenantName ? ` · ${u.tenantName}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setHistory(u)} className="text-slate-400 hover:text-teal-600" title="Historial">🕑</button>
                    <button onClick={() => setModal({ unit: u })} className="text-slate-400 hover:text-teal-600" title="Editar">✎</button>
                    {canDelete && <button onClick={() => removeUnit(u)} className="text-slate-400 hover:text-red-600" title="Eliminar">🗑</button>}
                  </div>
                </div>

                <div className="mt-2 text-lg font-bold text-slate-700">{money(u.rent)}<span className="text-xs font-normal text-slate-400"> / {FREQ_UNIT[freq]}</span></div>
                {!vacant && <div className="text-xs text-slate-400">{FREQ_LABEL[freq]} · {labelPeriodKey(unitPeriod(u))}</div>}

                {vacant ? (
                  <div className="mt-3 rounded-lg bg-slate-50 py-2 text-center text-sm text-slate-400">Sin inquilino</div>
                ) : pay ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2">
                    <span className="text-sm font-medium text-teal-700">✓ Pagado · {formatDate(pay.date)}</span>
                    {canDelete && <button onClick={() => unmark(u)} className="text-xs text-teal-600 hover:underline">Anular</button>}
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => markPaid(u)} className="flex-1">Marcar pagado</Button>
                    {u.tenantPhone && (
                      <button
                        onClick={() => remind(u)}
                        className="grid w-11 shrink-0 place-items-center rounded-lg bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                        title="Recordar el pago por WhatsApp"
                      >
                        📲
                      </button>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.unit ? 'Editar unidad' : 'Nueva unidad'}>
        {modal && <UnitForm existing={modal.unit} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={history !== null} onClose={() => setHistory(null)} title="Historial de pagos">
        {history && <History unit={history} onClose={() => setHistory(null)} />}
      </Modal>
    </div>
  )
}
