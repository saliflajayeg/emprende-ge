import type { Invoice } from '../cloud/localdb'
import { invoicePDF, invoicePDFFile, invoiceTotals, type PdfBusiness } from './pdf'
import { money } from './format'

const DOC_LABEL: Record<string, string> = { invoice: 'Factura', receipt: 'Recibo', quote: 'Presupuesto' }

// ¿Puede este dispositivo compartir el archivo por el menú nativo? (móviles)
export function canShareFiles(): boolean {
  try {
    const nav = navigator as any
    return typeof nav.canShare === 'function' && typeof nav.share === 'function'
  } catch {
    return false
  }
}

// Comparte la factura por WhatsApp/otros. En el móvil abre el menú del sistema
// con el PDF adjunto (WhatsApp aparece ahí). En escritorio descarga el PDF y
// abre WhatsApp Web con un texto. Devuelve cómo se resolvió.
export async function shareInvoice(
  inv: Invoice,
  biz: PdfBusiness,
  clientPhone?: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { total } = invoiceTotals(inv)
  const label = DOC_LABEL[inv.docType] ?? 'Documento'
  const text = `${label} ${inv.number} — ${biz.businessName}\nTotal: ${money(total, biz.currency)}`
  const file = invoicePDFFile(inv, biz)

  const nav = navigator as any
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${label} ${inv.number}`, text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // otro error: caemos al plan B
    }
  }

  // Plan B (escritorio / sin soporte de compartir archivos): descargar + WhatsApp con texto
  invoicePDF(inv, biz)
  const digits = (clientPhone || '').replace(/[^0-9]/g, '')
  const base = digits.length >= 8 ? `https://wa.me/${digits}` : 'https://wa.me/'
  window.open(`${base}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  return 'downloaded'
}
