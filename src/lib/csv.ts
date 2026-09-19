// Exportación a CSV (se abre directamente en Excel / LibreOffice).

function escapeCell(v: string | number): string {
  const s = String(v ?? '')
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  // Usamos ';' como separador: Excel en configuración regional española lo espera así.
  const content = rows.map((r) => r.map(escapeCell).join(';')).join('\r\n')
  // BOM para que Excel reconozca UTF-8 (acentos correctos)
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
