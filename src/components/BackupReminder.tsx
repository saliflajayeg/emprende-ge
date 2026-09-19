import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useSettings } from '../lib/hooks'
import { daysSinceBackup, exportBackup } from '../lib/backup'

export default function BackupReminder() {
  const settings = useSettings()
  const dataCount = useLiveQuery(async () => {
    const [tx, rec] = await Promise.all([db.transactions.count(), db.records.count()])
    return tx + rec
  }, [])
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!settings || dismissed || !dataCount) return null
  const days = daysSinceBackup(settings.lastBackupAt)
  if (days < 7) return null

  const msg =
    days === Infinity
      ? 'Aún no has hecho ninguna copia de seguridad. Tus datos viven solo en este dispositivo.'
      : `Hace ${days} días de tu última copia de seguridad.`

  async function backup() {
    setSaving(true)
    try {
      await exportBackup()
      setDismissed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>💾 {msg} Descárgala y guárdala en un lugar seguro.</span>
      <div className="ml-auto flex gap-2">
        <button
          onClick={backup}
          disabled={saving}
          className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? 'Descargando…' : 'Hacer copia ahora'}
        </button>
        <button onClick={() => setDismissed(true)} className="rounded-lg px-2 py-1.5 text-amber-700 hover:bg-amber-100">
          Ahora no
        </button>
      </div>
    </div>
  )
}
