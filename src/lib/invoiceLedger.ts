import { ldb, removeRow, type Category, type Contact, type Invoice, type Transaction } from '../cloud/localdb'
import { invoiceTotals } from './pdf'
import { todayISO } from './format'

// ============================================================
//  "Libro" de cada factura: la factura genera sus movimientos de caja.
//  - Lo cobrado  -> ingresos PAGADOS (uno por cada pago/abono, con su fecha)
//  - Lo que falta -> un ingreso PENDIENTE (la deuda del cliente)
//  Así la caja, el panel, "por cobrar" e informes salen solos de las facturas.
//  Los presupuestos no generan movimientos. Las facturas antiguas (sin
//  movimientos enlazados) no se tocan para no duplicar ingresos.
// ============================================================

// Nombre que se usa cuando la venta es a un cliente sin identificar.
export const WALK_IN = 'Cliente de mostrador'

export async function linkedTxs(bid: string, invoiceId: string): Promise<Transaction[]> {
  return ldb.transactions.where('businessId').equals(bid).filter((t) => t.invoiceId === invoiceId).toArray()
}

// Resumen de cobro a partir de los movimientos enlazados.
export function paymentSummary(inv: Invoice, txs: Transaction[]) {
  const { total } = invoiceTotals(inv)
  const paid = txs.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0)
  const linked = txs.length > 0
  // Factura antigua (sin movimientos): se fía de su estado manual.
  const remaining = linked ? Math.max(0, total - paid) : inv.status === 'paid' ? 0 : total
  const state: 'paid' | 'partial' | 'pending' = remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending'
  return { total, paid: linked ? paid : inv.status === 'paid' ? total : 0, remaining, state, linked }
}

// Categoría de ingresos "Ventas" (se crea si no existe).
async function ensureSalesCategory(bid: string): Promise<string | undefined> {
  const cats = await ldb.categories.where('businessId').equals(bid).toArray()
  const found = cats.find((c) => c.kind === 'income' && /^ventas?$/i.test(c.name.trim()))
  if (found) return found.id
  return (await ldb.categories.add({ kind: 'income', name: 'Ventas', color: '#0d9488' } as Category)) as string
}

const label = (inv: Invoice) => `${inv.docType === 'receipt' ? 'Recibo' : 'Factura'} ${inv.number} · ${inv.clientName || 'Cliente'}`

// Ajusta el movimiento PENDIENTE (deuda) para que sea total − cobrado, y el
// estado de la factura. Llamar tras crear/editar la factura o tras un abono.
export async function syncInvoiceLedger(bid: string, inv: Invoice) {
  if (inv.docType === 'quote') return
  const txs = await linkedTxs(bid, inv.id)
  const { total } = invoiceTotals(inv)
  const paid = txs.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0)
  const remaining = Math.max(0, Math.round(total - paid))
  const pending = txs.filter((t) => t.status === 'pending')
  // Solo debe haber un pendiente por factura
  for (const extra of pending.slice(1)) await removeRow('transactions', extra.id)
  const current = pending[0]

  if (remaining > 0) {
    const categoryId = current?.categoryId ?? (await ensureSalesCategory(bid))
    const rec = {
      kind: 'income' as const,
      date: inv.date,
      amount: remaining,
      description: label(inv),
      categoryId,
      contactId: inv.contactId,
      paymentMethod: current?.paymentMethod ?? 'Efectivo',
      status: 'pending' as const,
      invoiceId: inv.id,
      createdAt: current?.createdAt ?? new Date().toISOString(),
    }
    if (current) await ldb.transactions.update(current.id, rec)
    else await ldb.transactions.add(rec as Transaction)
  } else if (current) {
    await removeRow('transactions', current.id)
  }

  // Mantener los cobros ya hechos con el cliente/descripción al día
  for (const t of txs.filter((x) => x.status === 'paid')) {
    if (t.contactId !== inv.contactId) await ldb.transactions.update(t.id, { contactId: inv.contactId })
  }

  const status = remaining > 0 ? 'pending' : 'paid'
  if (inv.status !== status) await ldb.invoices.update(inv.id, { status })
}

// Registra un cobro/abono de la factura (se limita a lo que falta).
export async function addInvoicePayment(
  bid: string,
  inv: Invoice,
  amount: number,
  opts: { date?: string; method?: string; note?: string } = {},
) {
  if (inv.docType === 'quote') return
  const txs = await linkedTxs(bid, inv.id)
  const { remaining } = paymentSummary(inv, txs)
  const value = Math.min(Math.round(amount), remaining)
  if (!value || value <= 0) return
  const categoryId = await ensureSalesCategory(bid)
  await ldb.transactions.add({
    kind: 'income',
    date: opts.date ?? todayISO(),
    amount: value,
    description: (value < remaining ? 'Abono · ' : 'Cobro · ') + label(inv),
    categoryId,
    contactId: inv.contactId,
    paymentMethod: opts.method ?? 'Efectivo',
    status: 'paid',
    invoiceId: inv.id,
    createdAt: new Date().toISOString(),
  } as Transaction)
  await syncInvoiceLedger(bid, inv)
}

// Cobra la deuda de un cliente repartiendo el importe entre sus facturas
// pendientes, de la más antigua a la más reciente. Devuelve lo aplicado.
export async function payClientDebt(
  bid: string,
  contactId: string,
  amount: number,
  opts: { date?: string; method?: string } = {},
): Promise<number> {
  const invs = (await ldb.invoices.where('businessId').equals(bid).filter((i) => i.contactId === contactId && i.docType !== 'quote').toArray())
    .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt))
  let left = Math.round(amount)
  let applied = 0
  for (const inv of invs) {
    if (left <= 0) break
    const { remaining } = paymentSummary(inv, await linkedTxs(bid, inv.id))
    if (remaining <= 0) continue
    const pay = Math.min(left, remaining)
    await addInvoicePayment(bid, inv, pay, opts)
    left -= pay
    applied += pay
  }
  return applied
}

// Registra una factura ANTIGUA del talonario: se guarda con su fecha real y entra
// en la caja de ese mes (cobrada, a deber o con parte pagada).
export async function registerOldInvoice(
  bid: string,
  d: { date: string; total: number; clientName?: string; number?: string; photo?: string; pay: 'paid' | 'debt' | 'partial'; paidAmount?: number },
): Promise<Invoice> {
  const name = (d.clientName ?? '').trim()
  let contactId: string | undefined
  if (name && name !== WALK_IN) {
    const clients = await ldb.contacts.where('businessId').equals(bid).filter((c) => c.type === 'client').toArray()
    const found = clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    contactId = found?.id ?? ((await ldb.contacts.add({ type: 'client', name, phone: '', email: '', notes: '', createdAt: new Date().toISOString() } as Contact)) as string)
  }
  let number = (d.number ?? '').trim()
  if (!number) {
    const sameDay = await ldb.invoices.where('businessId').equals(bid).filter((i) => i.origin === 'talonario' && i.date === d.date).count()
    number = `T-${d.date}-${sameDay + 1}`
  }
  const id = (await ldb.invoices.add({
    docType: 'invoice',
    number,
    date: d.date,
    clientName: name || WALK_IN,
    clientDetails: '',
    contactId,
    items: [{ description: 'Factura del talonario', qty: 1, price: Math.round(d.total) }],
    taxRate: 0,
    notes: '',
    status: 'pending',
    origin: 'talonario',
    photo: d.photo,
    createdAt: new Date().toISOString(),
  } as Invoice)) as string
  const inv = (await ldb.invoices.get(id)) as Invoice
  if (d.pay === 'paid') await addInvoicePayment(bid, inv, d.total, { date: d.date })
  else if (d.pay === 'partial' && (d.paidAmount ?? 0) > 0) await addInvoicePayment(bid, inv, d.paidAmount ?? 0, { date: d.date })
  else await syncInvoiceLedger(bid, inv)
  return (await ldb.invoices.get(id)) as Invoice
}

// Borra la factura junto con sus cobros y su deuda.
export async function deleteInvoiceWithLedger(bid: string, inv: Invoice) {
  const txs = await linkedTxs(bid, inv.id)
  for (const t of txs) await removeRow('transactions', t.id)
  await removeRow('invoices', inv.id)
}
