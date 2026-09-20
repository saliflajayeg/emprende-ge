import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, RecordCard, RecordEntry, Settings } from '../db/db'
import { invoiceTotals } from '../db/db'
import { formatDate, moneyPlain } from './format'

const TEAL: [number, number, number] = [13, 148, 136]
const DARK: [number, number, number] = [15, 23, 42]
const GRAY: [number, number, number] = [100, 116, 139]

function header(doc: jsPDF, s: Settings, title: string) {
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, 210, 4, 'F')

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(s.businessName || 'Mi Negocio', 14, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  let y = 26
  if (s.sector) { doc.text(s.sector, 14, y); y += 4 }
  if (s.address) { doc.text(s.address, 14, y); y += 4 }
  if (s.phone) { doc.text(`Tel: ${s.phone}`, 14, y); y += 4 }

  doc.setTextColor(...TEAL)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(title, 196, 20, { align: 'right' })
}

export function invoicePDF(inv: Invoice, s: Settings) {
  const doc = new jsPDF()
  const TITLES: Record<string, string> = { invoice: 'FACTURA', receipt: 'RECIBO', quote: 'PRESUPUESTO' }
  const title = TITLES[inv.docType] ?? 'FACTURA'
  header(doc, s, title)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text(`Nº ${inv.number}`, 196, 28, { align: 'right' })
  doc.text(`Fecha: ${formatDate(inv.date)}`, 196, 33, { align: 'right' })

  // Cliente
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('FACTURAR A', 14, 48)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text(inv.clientName || 'Cliente', 14, 54)
  if (inv.clientDetails) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text(doc.splitTextToSize(inv.clientDetails, 90), 14, 59)
  }

  const { subtotal, tax, total } = invoiceTotals(inv)

  autoTable(doc, {
    startY: 70,
    head: [['Descripción', 'Cant.', 'Precio', 'Importe']],
    body: inv.items.map((it) => [
      it.description,
      String(it.qty),
      moneyPlain(it.price),
      moneyPlain(it.qty * it.price),
    ]),
    theme: 'striped',
    headStyles: { fillColor: TEAL, halign: 'left' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    styles: { fontSize: 10 },
  })

  // @ts-expect-error autotable añade lastAutoTable en runtime
  let y = doc.lastAutoTable.finalY + 8
  const rightX = 196
  const labelX = 150

  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal', labelX, y)
  doc.text(`${moneyPlain(subtotal)} ${s.currency}`, rightX, y, { align: 'right' })
  y += 6
  doc.text(`IVA (${inv.taxRate}%)`, labelX, y)
  doc.text(`${moneyPlain(tax)} ${s.currency}`, rightX, y, { align: 'right' })
  y += 3
  doc.setDrawColor(...TEAL)
  doc.line(labelX, y, rightX, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...TEAL)
  doc.text('TOTAL', labelX, y)
  doc.text(`${moneyPlain(total)} ${s.currency}`, rightX, y, { align: 'right' })

  if (inv.notes) {
    y += 14
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text('Notas', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(inv.notes, 180), 14, y + 5)
  }

  // Pie
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(
    `${TITLES[inv.docType] ? TITLES[inv.docType].charAt(0) + TITLES[inv.docType].slice(1).toLowerCase() : 'Documento'} generado con EmprendeGE`,
    105,
    288,
    { align: 'center' },
  )

  doc.save(`${title}-${inv.number}.pdf`)
}

interface ReportData {
  periodLabel: string
  totalIncome: number
  totalExpense: number
  byIncomeCat: { name: string; amount: number }[]
  byExpenseCat: { name: string; amount: number }[]
  monthly: { label: string; income: number; expense: number }[]
}

export function reportPDF(r: ReportData, s: Settings) {
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
  doc.text('Informe generado con EmprendeGE', 105, 288, { align: 'center' })

  doc.save(`Informe-${r.periodLabel.replace(/\s+/g, '-')}.pdf`)
}

// Expediente completo de una ficha: foto, datos y toda la bitácora de seguimiento.
export function recordPDF(rec: RecordCard, entries: RecordEntry[], s: Settings) {
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
    doc.text(`Expediente confidencial · ${s.businessName} · EmprendeGE`, 105, 291, { align: 'center' })
  }

  doc.save(`Expediente-${(rec.name || 'ficha').replace(/\s+/g, '-')}.pdf`)
}
