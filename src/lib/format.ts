// Formateo de moneda y fechas — por defecto XAF (franco CFA), sin decimales.

let currentCurrency = 'XAF'

export function setCurrency(c: string) {
  currentCurrency = c || 'XAF'
}

export function money(amount: number, currency = currentCurrency): string {
  const n = Math.round(amount || 0)
  // XAF no usa decimales; separador de miles con punto (uso local)
  const formatted = n.toLocaleString('es-GQ').replace(/,/g, '.')
  return `${formatted} ${currency}`
}

export function moneyPlain(amount: number): string {
  return Math.round(amount || 0).toLocaleString('es-GQ').replace(/,/g, '.')
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

export function monthLabel(ym: string): string {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7)
}

// Devuelve los últimos n meses como claves 'YYYY-MM' (más antiguo primero)
export function lastMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function shortMonth(ym: string): string {
  const [, m] = ym.split('-').map(Number)
  return MONTHS[m - 1].slice(0, 3)
}
