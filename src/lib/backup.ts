import { db } from '../db/db'
import { triggerDownload } from './csv'
import { saveSettings } from './hooks'

// Exporta TODA la base de datos a un .json y registra la fecha de la copia.
export async function exportBackup() {
  const data = {
    _app: 'emprende-ge',
    _version: 3,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    categories: await db.categories.toArray(),
    contacts: await db.contacts.toArray(),
    transactions: await db.transactions.toArray(),
    invoices: await db.invoices.toArray(),
    records: await db.records.toArray(),
    recordEntries: await db.recordEntries.toArray(),
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  triggerDownload(blob, `emprende-ge-copia-${new Date().toISOString().slice(0, 10)}.json`)
  await saveSettings({ lastBackupAt: new Date().toISOString() })
}

// Reemplaza todos los datos por los de una copia.
export async function restoreBackup(file: File) {
  const data = JSON.parse(await file.text())
  if (data._app !== 'emprende-ge') throw new Error('Archivo no válido')
  await db.transaction(
    'rw',
    [db.settings, db.categories, db.contacts, db.transactions, db.invoices, db.records, db.recordEntries],
    async () => {
      await Promise.all([
        db.settings.clear(), db.categories.clear(), db.contacts.clear(),
        db.transactions.clear(), db.invoices.clear(), db.records.clear(), db.recordEntries.clear(),
      ])
      if (data.settings?.length) await db.settings.bulkAdd(data.settings)
      if (data.categories?.length) await db.categories.bulkAdd(data.categories)
      if (data.contacts?.length) await db.contacts.bulkAdd(data.contacts)
      if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions)
      if (data.invoices?.length) await db.invoices.bulkAdd(data.invoices)
      if (data.records?.length) await db.records.bulkAdd(data.records)
      if (data.recordEntries?.length) await db.recordEntries.bulkAdd(data.recordEntries)
    },
  )
}

// Días desde la última copia (Infinity si nunca se hizo).
export function daysSinceBackup(lastBackupAt?: string): number {
  if (!lastBackupAt) return Infinity
  const ms = Date.now() - new Date(lastBackupAt).getTime()
  return Math.floor(ms / 86400000)
}
