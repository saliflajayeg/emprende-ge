import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, type Transaction } from '../cloud/localdb'
import { money, formatDate, todayISO } from '../lib/format'
import { Card, Button } from './ui'

// Panel sencillo para cuentas personales: patrimonio neto (lo que tienes menos
// lo que debes), ingresos/deudas de un vistazo, y la LISTA de deudas siempre a la
// vista (sin entrar a otra sección).
export default function PersonalPanel({ bid }: { bid: string }) {
  const txs = useLiveQuery(() => (bid ? ldb.transactions.where('businessId').equals(bid).toArray() : []), [bid])
  if (!txs) return <div className="text-slate-400">Cargando…</div>

  const paidIncome = txs.filter((t) => t.kind === 'income' && t.status === 'paid').reduce((s, t) => s + t.amount, 0)
  const paidExpense = txs.filter((t) => t.kind === 'expense' && t.status === 'paid').reduce((s, t) => s + t.amount, 0)
  const cash = paidIncome - paidExpense

  const sortByDue = (a: Transaction, b: Transaction) => (a.dueDate || '9999') .localeCompare(b.dueDate || '9999')
  const debts = txs.filter((t) => t.kind === 'expense' && t.status === 'pending').sort(sortByDue) // lo que YO debo
  const owed = txs.filter((t) => t.kind === 'income' && t.status === 'pending').sort(sortByDue) // lo que ME deben
  const iOwe = debts.reduce((s, t) => s + t.amount, 0)
  const owedToMe = owed.reduce((s, t) => s + t.amount, 0)
  const netWorth = cash + owedToMe - iOwe
  const today = todayISO()

  async function markPaid(id?: string) {
    if (id) await ldb.transactions.update(id, { status: 'paid' })
  }

  return (
    <div className="space-y-5">
      {/* Patrimonio neto */}
      <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white">
        <div className="text-xs font-medium uppercase tracking-wide text-teal-100">Patrimonio neto</div>
        <div className="ge-nums mt-1 text-3xl font-bold">{money(netWorth)}</div>
        <div className="mt-1 text-xs text-teal-100">Lo que tienes más lo que te deben, menos lo que debes.</div>
      </Card>

      {/* Resumen de un vistazo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Saldo</div>
          <div className={`ge-nums mt-1 text-base font-bold sm:text-lg ${cash >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{money(cash)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Me deben</div>
          <div className="ge-nums mt-1 text-base font-bold text-teal-600 sm:text-lg">{money(owedToMe)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Mis deudas</div>
          <div className={`ge-nums mt-1 text-base font-bold sm:text-lg ${iOwe > 0 ? 'text-red-600' : 'text-teal-600'}`}>{money(iOwe)}</div>
        </Card>
      </div>

      {/* Mis deudas — SIEMPRE visibles aquí */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          🔴 Mis deudas {debts.length > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{debts.length}</span>}
        </h2>
        {debts.length === 0 ? (
          <Card className="text-center text-sm text-slate-400">No tienes deudas pendientes. 🎉</Card>
        ) : (
          <div className="space-y-2">
            {debts.map((t) => {
              const overdue = t.dueDate && t.dueDate < today
              return (
                <Card key={t.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{t.description || 'Deuda'}</div>
                    <div className="text-xs text-slate-400">
                      {t.dueDate ? <span className={overdue ? 'font-medium text-red-500' : ''}>Vence {formatDate(t.dueDate)}{overdue ? ' · vencida' : ''}</span> : 'Sin fecha'}
                    </div>
                  </div>
                  <div className="ge-nums shrink-0 font-bold text-red-600">{money(t.amount)}</div>
                  <Button onClick={() => markPaid(t.id)} className="shrink-0 px-3 py-1.5 text-sm">Pagar</Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Me deben */}
      {owed.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            🟢 Me deben <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700">{owed.length}</span>
          </h2>
          <div className="space-y-2">
            {owed.map((t) => (
              <Card key={t.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{t.description || 'Por cobrar'}</div>
                  <div className="text-xs text-slate-400">{t.dueDate ? `Vence ${formatDate(t.dueDate)}` : 'Sin fecha'}</div>
                </div>
                <div className="ge-nums shrink-0 font-bold text-teal-600">{money(t.amount)}</div>
                <Button variant="outline" onClick={() => markPaid(t.id)} className="shrink-0 px-3 py-1.5 text-sm">Cobrado</Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
