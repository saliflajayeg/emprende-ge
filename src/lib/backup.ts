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
    items: await db.items.toArray(),
    appointments: await db.appointments.toArray(),
    jobs: await db.jobs.toArray(),
    employees: await db.employees.toArray(),
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
    [db.settings, db.categories, db.contacts, db.transactions, db.invoices, db.records, db.recordEntries, db.items, db.appointments, db.jobs, db.employees],
    async () => {
      await Promise.all([
        db.settings.clear(), db.categories.clear(), db.contacts.clear(),
        db.transactions.clear(), db.invoices.clear(), db.records.clear(), db.recordEntries.clear(),
        db.items.clear(), db.appointments.clear(), db.jobs.clear(), db.employees.clear(),
      ])
      if (data.settings?.length) await db.settings.bulkAdd(data.settings)
      if (data.categories?.length) await db.categories.bulkAdd(data.categories)
      if (data.contacts?.length) await db.contacts.bulkAdd(data.contacts)
      if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions)
      if (data.invoices?.length) await db.invoices.bulkAdd(data.invoices)
      if (data.records?.length) await db.records.bulkAdd(data.records)
      if (data.recordEntries?.length) await db.recordEntries.bulkAdd(data.recordEntries)
      if (data.items?.length) await db.items.bulkAdd(data.items)
      if (data.appointments?.length) await db.appointments.bulkAdd(data.appointments)
      if (data.jobs?.length) await db.jobs.bulkAdd(data.jobs)
      if (data.employees?.length) await db.employees.bulkAdd(data.employees)
    },
  )
}

// Días desde la última copia (Infinity si nunca se hizo).
export function daysSinceBackup(lastBackupAt?: string): number {
  if (!lastBackupAt) return Infinity
  const ms = Date.now() - new Date(lastBackupAt).getTime()
  return Math.floor(ms / 86400000)
}
