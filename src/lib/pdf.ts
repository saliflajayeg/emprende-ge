import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, RecordCard, RecordEntry } from '../cloud/localdb'
import { formatDate, moneyPlain } from './format'

// Datos del negocio que necesitan los PDF (independiente de la BD).
export interface PdfBusiness {
  businessName: string
  sector?: string
  address?: string
  phone?: string
  currency: string
  logo?: string | null // dataURL del logo del negocio (opcional)
}

// Totales de una factura/presupuesto.
export function invoiceTotals(inv: { items: { qty: number; price: number }[]; taxRate: number }) {
  const subtotal = inv.items.reduce((s, it) => s + it.qty * it.price, 0)
  const tax = subtotal * (inv.taxRate / 100)
  return { subtotal, tax, total: subtotal + tax }
}

const TEAL: [number, number, number] = [13, 148, 136]
const DARK: [number, number, number] = [15, 23, 42]
const GRAY: [number, number, number] = [100, 116, 139]
const RED: [number, number, number] = [220, 38, 38]

function header(doc: jsPDF, s: PdfBusiness, title: string) {
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, 210, 4, 'F')

  // Logo del negocio (si hay), arriba a la izquierda
  let textX = 14
  if (s.logo) {
    try {
      const props = doc.getImageProperties(s.logo)
      const maxH = 18
      const maxW = 32
      let w = maxW
      let h = (props.height / props.width) * w
      if (h > maxH) { h = maxH; w = (props.width / props.height) * h }
      doc.addImage(s.logo, 'PNG', 14, 10, w, h)
      textX = 14 + w + 4
    } catch { /* logo no embebible: se ignora */ }
  }

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(s.businessName || 'Mi Negocio', textX, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  let y = 26
  if (s.sector) { doc.text(s.sector, textX, y); y += 4 }
  if (s.address) { doc.text(s.address, textX, y); y += 4 }
  if (s.phone) { doc.text(`Tel: ${s.phone}`, textX, y); y += 4 }

  doc.setTextColor(...TEAL)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(title, 196, 20, { align: 'right' })
}

// Estado de cobro que se imprime en la factura (opcional).
export interface InvoicePay { paid: number; remaining: number }

// ============================================================
//  FACTURA UNIVERSAL — plantilla profesional válida para cualquier negocio.
//  Cabecera con logo y datos, bloque cliente + datos del documento, tabla de
//  conceptos limpia, totales destacados, estado de cobro y pie de contacto.
// ============================================================
const BRAND: [number, number, number] = [15, 118, 110] // teal-700
const BRAND_SOFT: [number, number, number] = [236, 248, 245]
const INK: [number, number, number] = [28, 25, 23]
const MUTED: [number, number, number] = [120, 113, 102]
const LINE: [number, number, number] = [231, 225, 214]
const AMBER: [number, number, number] = [180, 83, 9]
const AMBER_SOFT: [number, number, number] = [254, 243, 199]

function buildInvoiceDoc(inv: Invoice, s: PdfBusiness, pay?: InvoicePay): { doc: jsPDF; filename: string } {
  const doc = new jsPDF()
  const TITLES: Record<string, string> = { invoice: 'FACTURA', receipt: 'RECIBO', quote: 'PRESUPUESTO' }
  const title = TITLES[inv.docType] ?? 'FACTURA'
  const cur = s.currency
  const L = 16 // margen izquierdo
  const R = 194 // margen derecho
  const { subtotal, tax, total } = invoiceTotals(inv)

  // Franja de color superior
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, 210, 3.5, 'F')

  // --- Emisor (logo + nombre + datos) ---
  let textX = L
  if (s.logo) {
    try {
      const props = doc.getImageProperties(s.logo)
      const maxH = 20
      const maxW = 34
      let w = maxW
      let h = (props.height / props.width) * w
      if (h > maxH) { h = maxH; w = (props.width / props.height) * h }
      doc.addImage(s.logo, 'PNG', L, 13, w, h)
      textX = L + w + 5
    } catch { /* logo no embebible: se ignora */ }
  }
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(doc.splitTextToSize(s.businessName || 'Mi negocio', 100 - (textX - L))[0], textX, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  let hy = 25.5
  for (const line of [s.sector, s.address, s.phone ? `Tel. ${s.phone}` : '']) {
    if (line) { doc.text(line, textX, hy); hy += 4.4 }
  }

  // --- Tipo de documento + estado ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...BRAND)
  doc.text(title, R, 21, { align: 'right' })
  if (pay && inv.docType !== 'quote') {
    const paid = pay.remaining <= 0
    const label = paid ? 'PAGADA' : pay.paid > 0 ? 'PAGO PARCIAL' : 'PENDIENTE DE PAGO'
    doc.setFontSize(8)
    const w = doc.getTextWidth(label) + 8
    doc.setFillColor(...(paid ? BRAND_SOFT : AMBER_SOFT))
    doc.roundedRect(R - w, 25.5, w, 6.5, 3.2, 3.2, 'F')
    doc.setTextColor(...(paid ? BRAND : AMBER))
    doc.text(label, R - w / 2, 29.8, { align: 'center' })
  }

  // --- Bloques: cliente | datos del documento ---
  const top = Math.max(hy, 36) + 6
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.line(L, top - 4, R, top - 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(inv.docType === 'quote' ? 'PRESUPUESTO PARA' : 'FACTURADO A', L, top + 2)
  doc.setFontSize(12.5)
  doc.setTextColor(...INK)
  doc.text(inv.clientName || 'Cliente', L, top + 8.5)
  if (inv.clientDetails) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(inv.clientDetails, 92), L, top + 13.5)
  }

  const meta: [string, string][] = [
    [inv.docType === 'quote' ? 'Nº presupuesto' : inv.docType === 'receipt' ? 'Nº recibo' : 'Nº factura', inv.number],
    ['Fecha', formatDate(inv.date)],
    ['Moneda', cur],
  ]
  const mx = 128
  meta.forEach(([k, v], i) => {
    const y = top + 2 + i * 6.2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(k, mx, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(v, R, y, { align: 'right' })
  })

  // --- Conceptos ---
  autoTable(doc, {
    startY: top + 25,
    margin: { left: L, right: 210 - R },
    head: [['#', 'Descripción', { content: 'Cant.', styles: { halign: 'center' } }, { content: 'Precio', styles: { halign: 'right' } }, { content: 'Importe', styles: { halign: 'right' } }]],
    body: inv.items.map((it, i) => [String(i + 1), it.description, String(it.qty), moneyPlain(it.price), moneyPlain(it.qty * it.price)]),
    theme: 'plain',
    headStyles: { fillColor: BRAND_SOFT, textColor: BRAND, fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    bodyStyles: { textColor: INK, fontSize: 10, cellPadding: { top: 3.4, bottom: 3.4, left: 3, right: 3 } },
    columnStyles: {
      0: { cellWidth: 9, textColor: MUTED },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    didDrawCell: (d) => {
      if (d.section === 'body') {
        doc.setDrawColor(...LINE)
        doc.setLineWidth(0.25)
        doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height)
      }
    },
  })

  // @ts-expect-error autotable añade lastAutoTable en runtime
  let y = doc.lastAutoTable.finalY + 7
  const boxX = 118
  const boxW = R - boxX

  // --- Totales ---
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  if (Number(inv.taxRate) > 0) {
    doc.text('Subtotal', boxX + 3, y)
    doc.setTextColor(...INK)
    doc.text(`${moneyPlain(subtotal)} ${cur}`, R - 3, y, { align: 'right' })
    y += 5.5
    doc.setTextColor(...MUTED)
    doc.text(`IVA (${inv.taxRate}%)`, boxX + 3, y)
    doc.setTextColor(...INK)
    doc.text(`${moneyPlain(tax)} ${cur}`, R - 3, y, { align: 'right' })
    y += 4
  }
  doc.setFillColor(...BRAND)
  doc.roundedRect(boxX, y, boxW, 13, 2.5, 2.5, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL', boxX + 4, y + 8.3)
  doc.setFontSize(14)
  doc.text(`${moneyPlain(total)} ${cur}`, R - 4, y + 8.6, { align: 'right' })
  y += 13

  if (pay && inv.docType !== 'quote') {
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    doc.text('Pagado', boxX + 3, y)
    doc.setTextColor(...INK)
    doc.text(`${moneyPlain(pay.paid)} ${cur}`, R - 3, y, { align: 'right' })
    if (pay.remaining > 0) {
      y += 5.5
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...AMBER)
      doc.text('Pendiente', boxX + 3, y)
      doc.text(`${moneyPlain(pay.remaining)} ${cur}`, R - 3, y, { align: 'right' })
    }
  }

  // --- Notas ---
  if (inv.notes) {
    y += 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text('NOTAS', L, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(inv.notes, R - L), L, y + 5)
  }

  // --- Pie ---
  const fy = 272
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.line(L, fy, R, fy)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(inv.docType === 'quote' ? 'Gracias por su confianza.' : 'Gracias por su compra.', L, fy + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  const contact = [s.businessName, s.phone ? `Tel. ${s.phone}` : '', s.address].filter(Boolean).join('  ·  ')
  doc.text(doc.splitTextToSize(contact, R - L)[0] ?? '', L, fy + 12)
  doc.setTextColor(...BRAND)
  doc.setFontSize(7.5)
  doc.text('Hecho con GEmprende · emprendege.mercadosemu.com', R, fy + 7, { align: 'right' })

  return { doc, filename: `${title}-${inv.number}.pdf` }
}

// Descarga la factura como PDF.
export function invoicePDF(inv: Invoice, s: PdfBusiness, pay?: InvoicePay) {
  const { doc, filename } = buildInvoiceDoc(inv, s, pay)
  doc.save(filename)
}

// Devuelve la factura como archivo PDF (para compartir por WhatsApp, etc.).
export function invoicePDFFile(inv: Invoice, s: PdfBusiness, pay?: InvoicePay): File {
  const { doc, filename } = buildInvoiceDoc(inv, s, pay)
  const blob = doc.output('blob')
  return new File([blob], filename, { type: 'application/pdf' })
}

interface ReportData {
  periodLabel: string
  totalIncome: number
  totalExpense: number
  byIncomeCat: { name: string; amount: number }[]
  byExpenseCat: { name: string; amount: number }[]
  monthly: { label: string; income: number; expense: number }[]
}

export function reportPDF(r: ReportData, s: PdfBusiness) {
  const doc = new jsPDF()
  header(doc, s, 'INFORME')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text(r.periodLabel, 14, 48)

  const net = r.totalIncome - r.totalExpense
  const cur = s.currency

  autoTable(doc, {
    startY: 54,
    body: [
      ['Ingresos totales', `${moneyPlain(r.totalIncome)} ${cur}`],
      ['Gastos totales', `${moneyPlain(r.totalExpense)} ${cur}`],
      ['Beneficio neto', `${moneyPlain(net)} ${cur}`],
    ],
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', textColor: DARK },
      1: { halign: 'right', textColor: net >= 0 ? TEAL : [220, 38, 38] },
    },
    styles: { fontSize: 12 },
  })

  // @ts-expect-error runtime
  let y = doc.lastAutoTable.finalY + 6

  if (r.monthly.length) {
    autoTable(doc, {
      startY: y,
      head: [['Mes', 'Ingresos', 'Gastos', 'Neto']],
      body: r.monthly.map((m) => [
        m.label,
        moneyPlain(m.income),
        moneyPlain(m.expense),
        moneyPlain(m.income - m.expense),
      ]),
      headStyles: { fillColor: TEAL },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      styles: { fontSize: 9 },
    })
    // @ts-expect-error runtime
    y = doc.lastAutoTable.finalY + 6
  }

  if (r.byIncomeCat.length) {
    autoTable(doc, {
      startY: y,
      head: [['Ingresos por categoría', 'Importe']],
      body: r.byIncomeCat.map((c) => [c.name, `${moneyPlain(c.amount)} ${cur}`]),
      headStyles: { fillColor: TEAL },
      columnStyles: { 1: { halign: 'right' } },
      styles: { fontSize: 9 },
    })
    // @ts-expect-error runtime
    y = doc.lastAutoTable.finalY + 6
  }

  if (r.byExpenseCat.length) {
    autoTable(doc, {
      startY: y,
      head: [['Gastos por categoría', 'Importe']],
      body: r.byExpenseCat.map((c) => [c.name, `${moneyPlain(c.amount)} ${cur}`]),
      headStyles: { fillColor: [239, 68, 68] },
      columnStyles: { 1: { halign: 'right' } },
      styles: { fontSize: 9 },
    })
  }

  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Informe generado con GEmprende', 105, 288, { align: 'center' })

  doc.save(`Informe-${r.periodLabel.replace(/\s+/g, '-')}.pdf`)
}

// Informe para pedir crédito: historial de 12 meses + indicadores del negocio.
export interface CreditReport {
  periodLabel: string
  months: { label: string; sales: number; collected: number; expenses: number }[]
  invoicesCount: number
  clientsCount: number
  repeatClients: number
  collectionRate: number // % cobrado sobre lo facturado
  receivables: number // lo que le deben hoy
  topProducts: { name: string; qty: number; revenue: number }[]
  ownerName?: string
}

export function creditReportPDF(r: CreditReport, s: PdfBusiness) {
  const doc = new jsPDF()
  const cur = s.currency
  header(doc, s, 'HISTORIAL')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text('Informe de actividad del negocio', 196, 28, { align: 'right' })
  doc.text(r.periodLabel, 196, 33, { align: 'right' })
  if (r.ownerName) doc.text(`Titular: ${r.ownerName}`, 14, 44)

  const sales = r.months.reduce((a, m) => a + m.sales, 0)
  const collected = r.months.reduce((a, m) => a + m.collected, 0)
  const expenses = r.months.reduce((a, m) => a + m.expenses, 0)
  const active = r.months.filter((m) => m.sales > 0).length
  const avg = active ? sales / active : 0
  const net = sales - expenses

  autoTable(doc, {
    startY: 50,
    head: [['Indicador', { content: 'Valor', styles: { halign: 'right' } }]],
    body: [
      ['Ventas totales (12 meses)', `${moneyPlain(sales)} ${cur}`],
      ['Venta media por mes activo', `${moneyPlain(avg)} ${cur}`],
      ['Cobrado (dinero recibido)', `${moneyPlain(collected)} ${cur}`],
      ['Gastos totales', `${moneyPlain(expenses)} ${cur}`],
      ['Resultado (ventas menos gastos)', `${moneyPlain(net)} ${cur}`],
      ['Meses con actividad', `${active} de ${r.months.length}`],
      ['Facturas emitidas', String(r.invoicesCount)],
      ['Clientes distintos', String(r.clientsCount)],
      ['Clientes que repiten', String(r.repeatClients)],
      ['Porcentaje cobrado de lo facturado', `${Math.round(r.collectionRate)} %`],
      ['Pendiente de cobro hoy', `${moneyPlain(r.receivables)} ${cur}`],
    ],
    headStyles: { fillColor: TEAL },
    columnStyles: { 0: { fontStyle: 'bold', textColor: DARK }, 1: { halign: 'right' } },
    styles: { fontSize: 10 },
  })

  // @ts-expect-error runtime
  let y = doc.lastAutoTable.finalY + 6
  autoTable(doc, {
    startY: y,
    head: [['Mes', ...['Ventas', 'Cobrado', 'Gastos', 'Resultado'].map((h) => ({ content: h, styles: { halign: 'right' as const } }))]],
    body: r.months.map((m) => [m.label, moneyPlain(m.sales), moneyPlain(m.collected), moneyPlain(m.expenses), moneyPlain(m.sales - m.expenses)]),
    foot: [['Total', ...[sales, collected, expenses, net].map((v) => ({ content: moneyPlain(v), styles: { halign: 'right' as const } }))]],
    headStyles: { fillColor: TEAL },
    footStyles: { fillColor: [240, 253, 250], textColor: DARK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    styles: { fontSize: 9 },
  })

  if (r.topProducts.length) {
    // @ts-expect-error runtime
    y = doc.lastAutoTable.finalY + 6
    autoTable(doc, {
      startY: y,
      head: [['Lo más vendido', ...['Cantidad', 'Importe'].map((h) => ({ content: h, styles: { halign: 'right' as const } }))]],
      body: r.topProducts.map((p) => [p.name, moneyPlain(p.qty), `${moneyPlain(p.revenue)} ${cur}`]),
      headStyles: { fillColor: TEAL },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      styles: { fontSize: 9 },
    })
  }

  const pages = doc.getNumberOfPages()
  const today = new Date().toISOString().slice(0, 10)
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(`Datos registrados por el negocio en GEmprende · Generado el ${formatDate(today)}`, 105, 291, { align: 'center' })
  }
  doc.save(`Historial-${s.businessName.replace(/\s+/g, '-')}-${today}.pdf`)
}

// Informe mensual de alquileres: cobros por inquilino, gastos y la diferencia.
export interface RentalsReport {
  periodLabel: string
  collected: { unit: string; tenant: string; date: string; amount: number }[]
  expenses: { concept: string; date: string; amount: number }[]
  totalCollected: number
  totalExpense: number
}

function buildRentalsReportDoc(r: RentalsReport, s: PdfBusiness): { doc: jsPDF; filename: string } {
  const doc = new jsPDF()
  const cur = s.currency
  header(doc, s, 'ALQUILERES')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text('Informe mensual', 196, 28, { align: 'right' })
  doc.text(r.periodLabel, 196, 33, { align: 'right' })

  const net = r.totalCollected - r.totalExpense

  // Resumen
  autoTable(doc, {
    startY: 50,
    body: [
      ['Cobrado', `${moneyPlain(r.totalCollected)} ${cur}`],
      ['Gastos', `${moneyPlain(r.totalExpense)} ${cur}`],
      ['Diferencia (ingresos menos gastos)', `${moneyPlain(net)} ${cur}`],
    ],
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', textColor: DARK },
      1: { halign: 'right', textColor: net >= 0 ? TEAL : [220, 38, 38] },
    },
    styles: { fontSize: 12 },
  })

  // @ts-expect-error runtime
  let y = doc.lastAutoTable.finalY + 6

  // Cobros del mes (inquilino + importe)
  autoTable(doc, {
    startY: y,
    head: [['Unidad', 'Inquilino', 'Fecha', 'Importe']],
    body: r.collected.length
      ? r.collected.map((c) => [c.unit, c.tenant || '—', formatDate(c.date), `${moneyPlain(c.amount)} ${cur}`])
      : [['—', 'Sin cobros este mes', '', '']],
    foot: r.collected.length ? [['', '', 'Total cobrado', `${moneyPlain(r.totalCollected)} ${cur}`]] : undefined,
    headStyles: { fillColor: TEAL },
    footStyles: { fillColor: [240, 253, 250], textColor: DARK, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    styles: { fontSize: 9 },
  })

  // @ts-expect-error runtime
  y = doc.lastAutoTable.finalY + 6

  // Gastos del mes
  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Fecha', 'Importe']],
    body: r.expenses.length
      ? r.expenses.map((e) => [e.concept, formatDate(e.date), `${moneyPlain(e.amount)} ${cur}`])
      : [['Sin gastos este mes', '', '']],
    foot: r.expenses.length ? [['', 'Total gastos', `${moneyPlain(r.totalExpense)} ${cur}`]] : undefined,
    headStyles: { fillColor: [239, 68, 68] },
    footStyles: { fillColor: [254, 242, 242], textColor: DARK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    styles: { fontSize: 9 },
  })

  // @ts-expect-error runtime
  y = doc.lastAutoTable.finalY + 10
  if (y > 270) { doc.addPage(); y = 20 }
  doc.setDrawColor(...TEAL)
  doc.line(120, y, 196, y)
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...(net >= 0 ? TEAL : RED))
  doc.text('DIFERENCIA', 120, y)
  doc.text(`${moneyPlain(net)} ${cur}`, 196, y, { align: 'right' })

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(`Informe de alquileres · ${s.businessName} · GEmprende`, 105, 291, { align: 'center' })
  }

  return { doc, filename: `Alquileres-${r.periodLabel.replace(/\s+/g, '-')}.pdf` }
}

export function rentalsReportPDF(r: RentalsReport, s: PdfBusiness) {
  const { doc, filename } = buildRentalsReportDoc(r, s)
  doc.save(filename)
}

export function rentalsReportPDFFile(r: RentalsReport, s: PdfBusiness): File {
  const { doc, filename } = buildRentalsReportDoc(r, s)
  return new File([doc.output('blob')], filename, { type: 'application/pdf' })
}

// Expediente completo de una ficha: foto, datos y toda la bitácora de seguimiento.
export function recordPDF(rec: RecordCard, entries: RecordEntry[], s: PdfBusiness) {
  const doc = new jsPDF()
  header(doc, s, 'EXPEDIENTE')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text(rec.type || 'Ficha', 196, 28, { align: 'right' })
  doc.text(`Registro: ${formatDate(rec.registeredAt)}`, 196, 33, { align: 'right' })

  let y = 50

  // Foto principal (si hay)
  if (rec.photo) {
    try {
      const props = doc.getImageProperties(rec.photo)
      const w = 42
      const h = (props.height / props.width) * w
      doc.addImage(rec.photo, 'JPEG', 14, y, w, Math.min(h, 55))
    } catch {
      /* imagen no embebible: se ignora */
    }
  }

  const textX = rec.photo ? 62 : 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...DARK)
  doc.text(rec.name || 'Sin nombre', textX, y + 6)

  // Datos personalizados
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  let fy = y + 14
  for (const f of rec.fields.filter((f) => f.label || f.value)) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${f.label}: `, textX, fy)
    const lw = doc.getTextWidth(`${f.label}: `)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(f.value, 190 - textX - lw), textX + lw, fy)
    fy += 6
  }

  y = Math.max(fy, y + 60) + 4

  // Bitácora de seguimiento
  if (entries.length) {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Seguimiento']],
      body: entries.map((e) => [formatDate(e.date), e.text]),
      headStyles: { fillColor: TEAL },
      columnStyles: { 0: { cellWidth: 28 } },
      styles: { fontSize: 9, cellPadding: 2.5, valign: 'top' },
      theme: 'striped',
    })
  } else {
    doc.setFontSize(10)
    doc.setTextColor(...GRAY)
    doc.text('Sin entradas de seguimiento todavía.', 14, y)
  }

  // Galería de fotos
  const gallery = rec.photos ?? []
  if (gallery.length) {
    // @ts-expect-error runtime
    let gy = (doc.lastAutoTable?.finalY ?? y) + 10
    if (gy > 250) {
      doc.addPage()
      gy = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...DARK)
    doc.text('Fotos', 14, gy)
    gy += 4
    let gx = 14
    const size = 42
    for (const p of gallery) {
      if (gx + size > 196) {
        gx = 14
        gy += size + 4
      }
      if (gy + size > 285) {
        doc.addPage()
        gy = 20
        gx = 14
      }
      try {
        const props = doc.getImageProperties(p)
        const h = Math.min((props.height / props.width) * size, size)
        doc.addImage(p, 'JPEG', gx, gy, size, h)
      } catch {
        /* ignora imagen no embebible */
      }
      gx += size + 4
    }
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(`Expediente confidencial · ${s.businessName} · GEmprende`, 105, 291, { align: 'center' })
  }

  doc.save(`Expediente-${(rec.name || 'ficha').replace(/\s+/g, '-')}.pdf`)
}
