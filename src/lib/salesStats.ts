import type { Invoice, Transaction } from '../cloud/localdb'
import { paymentSummary, WALK_IN } from './invoiceLedger'

// ============================================================
//  Información que sale sola de las facturas: clientes y productos.
// ============================================================

export function groupByInvoice(txs: Transaction[]): Map<string, Transaction[]> {
  const m = new Map<string, Transaction[]>()
  for (const t of txs) if (t.invoiceId) m.set(t.invoiceId, [...(m.get(t.invoiceId) ?? []), t])
  return m
}

export interface ClientStat { contactId: string; name: string; bought: number; paid: number; owed: number; count: number; lastDate: string }

// Compras, pagos y deuda de cada cliente (solo facturas/recibos con cliente).
export function clientStats(invoices: Invoice[], txs: Transaction[]): Map<string, ClientStat> {
  const byInv = groupByInvoice(txs)
  const out = new Map<string, ClientStat>()
  for (const inv of invoices) {
    if (inv.docType === 'quote' || !inv.contactId) continue
    const s = paymentSummary(inv, byInv.get(inv.id) ?? [])
    const cur = out.get(inv.contactId) ?? { contactId: inv.contactId, name: inv.clientName, bought: 0, paid: 0, owed: 0, count: 0, lastDate: '' }
    cur.bought += s.total
    cur.paid += s.paid
    cur.owed += s.remaining
    cur.count += 1
    if (inv.date > cur.lastDate) { cur.lastDate = inv.date; cur.name = inv.clientName }
    out.set(inv.contactId, cur)
  }
  return out
}

export interface ProductStat { name: string; qty: number; revenue: number }

// Lo más vendido según las líneas de las facturas.
export function topProducts(invoices: Invoice[], limit = 10): ProductStat[] {
  const m = new Map<string, ProductStat>()
  for (const inv of invoices) {
    if (inv.docType === 'quote' || inv.origin === 'talonario') continue // las antiguas solo tienen el total
    for (const it of inv.items) {
      const name = it.description.trim()
      if (!name) continue
      const key = name.toLowerCase()
      const cur = m.get(key) ?? { name, qty: 0, revenue: 0 }
      cur.qty += Number(it.qty) || 0
      cur.revenue += (Number(it.qty) || 0) * (Number(it.price) || 0)
      m.set(key, cur)
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

// Mejores clientes (por lo comprado) en un conjunto de facturas.
export function topClients(invoices: Invoice[], txs: Transaction[], limit = 5): ClientStat[] {
  return [...clientStats(invoices, txs).values()]
    .filter((c) => c.name !== WALK_IN)
    .sort((a, b) => b.bought - a.bought)
    .slice(0, limit)
}
