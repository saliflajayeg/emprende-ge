import type { Invoice } from '../cloud/localdb'
import { invoicePDF, invoicePDFFile, invoiceTotals, rentalsReportPDF, rentalsReportPDFFile, type PdfBusiness, type RentalsReport } from './pdf'
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

// Comparte el informe mensual de alquileres por WhatsApp/otros (mismo patrón).
export async function shareRentalsReport(
  r: RentalsReport,
  biz: PdfBusiness,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const net = r.totalCollected - r.totalExpense
  const text =
    `Informe de alquileres — ${biz.businessName} · ${r.periodLabel}\n` +
    `Cobrado: ${money(r.totalCollected, biz.currency)}\n` +
    `Gastos: ${money(r.totalExpense, biz.currency)}\n` +
    `Diferencia: ${money(net, biz.currency)}`
  const file = rentalsReportPDFFile(r, biz)

  const nav = navigator as any
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Alquileres ${r.periodLabel}`, text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }

  // Plan B (escritorio): descargar + WhatsApp con texto
  rentalsReportPDF(r, biz)
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  return 'downloaded'
}
