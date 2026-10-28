import { removeRow, type Transaction } from '../cloud/localdb'
import { usePerms } from '../cloud/perms'
import { Trash } from '@phosphor-icons/react'

// Botón «Eliminar» dentro del formulario de edición de un ingreso/gasto.
// Solo lo ve quien puede borrar (no el empleado). Los movimientos que salen de una
// factura no se borran aquí: se gestionan desde Facturas.
export default function DeleteTxButton({ tx, onDone }: { tx?: Transaction; onDone: () => void }) {
  const { canDelete } = usePerms()
  if (!tx?.id || tx.invoiceId || !canDelete) return null
  const what = tx.kind === 'income' ? 'ingreso' : 'gasto'
  async function del() {
    if (!confirm(`¿Eliminar este ${what}? Desaparecerá de la caja y de los informes. No se puede deshacer.`)) return
    await removeRow('transactions', tx!.id)
    onDone()
  }
  return (
    <button
      type="button"
      onClick={del}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-50"
    >
      <Trash size={18} /> Eliminar este {what}
    </button>
  )
}
