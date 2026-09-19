import type { Category, Transaction } from '../db/db'
import { monthKey, shortMonth } from './format'

export function sumIn(txs: Transaction[], kind: 'income' | 'expense', month?: string) {
  return txs
    .filter((t) => t.kind === kind && (!month || monthKey(t.date) === month))
    .reduce((s, t) => s + t.amount, 0)
}

export function monthlySeries(txs: Transaction[], months: string[]) {
  return months.map((ym) => ({
    label: shortMonth(ym),
    ym,
    income: sumIn(txs, 'income', ym),
    expense: sumIn(txs, 'expense', ym),
  }))
}

export function byCategory(
  txs: Transaction[],
  categories: Category[],
  kind: 'income' | 'expense',
  month?: string,
) {
  const map = new Map<number | 0, number>()
  for (const t of txs) {
    if (t.kind !== kind) continue
    if (month && monthKey(t.date) !== month) continue
    const key = t.categoryId ?? 0
    map.set(key, (map.get(key) ?? 0) + t.amount)
  }
  const out = [...map.entries()].map(([id, amount]) => {
    const cat = categories.find((c) => c.id === id)
    return {
      name: cat?.name ?? 'Sin categoría',
      color: cat?.color ?? '#94a3b8',
      amount,
    }
  })
  return out.sort((a, b) => b.amount - a.amount)
}

export function pendingTotals(txs: Transaction[]) {
  const toCollect = txs
    .filter((t) => t.kind === 'income' && t.status === 'pending')
    .reduce((s, t) => s + t.amount, 0)
  const toPay = txs
    .filter((t) => t.kind === 'expense' && t.status === 'pending')
    .reduce((s, t) => s + t.amount, 0)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = txs.filter(
    (t) => t.status === 'pending' && t.dueDate && t.dueDate < today,
  )
  return { toCollect, toPay, overdue }
}
