import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ldb, removeRow, type Transaction } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { usePerms } from '../cloud/perms'
import { deleteInvoiceWithLedger, syncInvoiceLedger } from '../lib/invoiceLedger'
import { money, formatDate } from '../lib/format'
import { Button } from './ui'
import { Receipt, ArrowCounterClockwise, Trash, CaretRight } from '@phosphor-icons/react'

// Ficha de un movimiento que sale de una factura (cobro, abono o deuda).
// No se edita a mano: o se anula el cobro (la factura vuelve a deber ese importe),
// o se elimina la factura entera con sus cobros y su deuda. El empleado solo puede
// abrir la factura.
export default function LinkedTxSheet({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const bid = useBusiness().current?.id ?? ''
  const { canDelete } = usePerms()
  const navigate = useNavigate()
  const inv = useLiveQuery(() => (tx.invoiceId ? ldb.invoices.get(tx.invoiceId) : undefined), [tx.invoiceId])
  const paid = tx.status === 'paid'
  const docName = inv ? `${inv.docType === 'receipt' ? 'el recibo' : 'la factura'} ${inv.number}` : 'la factura'

  function openInvoice() {
    onDone()
    navigate('/facturas', { state: { openInvoice: tx.invoiceId } })
  }

  // Anular un cobro/abono: se borra y se recalcula la deuda de la factura.
  async function undoPayment() {
    if (!confirm(`¿Anular este cobro de ${money(tx.amount)}? ${inv ? `${docName[0].toUpperCase()}${docName.slice(1)} volverá a quedar debiendo ese importe.` : ''}`)) return
    await removeRow('transactions', tx.id)
    if (inv) await syncInvoiceLedger(bid, inv)
    onDone()
  }

  // Eliminar la factura entera (y con ella todos sus cobros y su deuda).
  async function deleteInvoice() {
    if (!inv) return
    if (!confirm(`¿Eliminar ${docName} de ${inv.clientName || 'este cliente'}? Se borran también sus cobros y su deuda de la caja. No se puede deshacer.`)) return
    await deleteInvoiceWithLedger(bid, inv)
    onDone()
  }

  // Movimiento huérfano (su factura ya no existe): se puede borrar sin más.
  async function deleteOrphan() {
    if (!confirm('¿Eliminar este movimiento? No se puede deshacer.')) return
    await removeRow('transactions', tx.id)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Receipt size={22} weight="duotone" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-900">{tx.description}</div>
          <div className="text-xs text-slate-500">{formatDate(tx.date)} · {paid ? 'Cobrado' : 'Pendiente de cobro'}</div>
        </div>
        <div className={`ge-nums shrink-0 text-base font-extrabold ${paid ? 'text-teal-700' : 'text-amber-700'}`}>{money(tx.amount)}</div>
      </div>

      <p className="text-sm text-slate-600">
        {inv === undefined && tx.invoiceId ? 'Este movimiento venía de una factura que ya no existe.' : (
          paid
            ? <>Este cobro pertenece a {docName}. Para corregirlo puedes anularlo o eliminar la factura entera.</>
            : <>Esta deuda sale de {docName}: es lo que el cliente aún no ha pagado. Para quitarla, registra el cobro en la factura o elimina la factura entera.</>
        )}
      </p>

      <div className="space-y-2">
        {inv && (
          <Button variant="outline" onClick={openInvoice} className="w-full justify-between">
            <span className="flex items-center gap-1.5"><Receipt size={18} /> Abrir {docName}</span> <CaretRight size={16} weight="bold" />
          </Button>
        )}
        {canDelete && inv && paid && (
          <Button variant="outline" onClick={undoPayment} className="w-full !text-red-600">
            <ArrowCounterClockwise size={18} /> Anular este cobro
          </Button>
        )}
        {canDelete && inv && (
          <Button variant="outline" onClick={deleteInvoice} className="w-full !text-red-600">
            <Trash size={18} /> Eliminar la factura entera
          </Button>
        )}
        {canDelete && inv === undefined && (
          <Button variant="outline" onClick={deleteOrphan} className="w-full !text-red-600">
            <Trash size={18} /> Eliminar este movimiento
          </Button>
        )}
      </div>
    </div>
  )
}
