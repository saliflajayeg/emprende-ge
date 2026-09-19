import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/db'
import { setCurrency } from './format'

export const SETTINGS_ID = 'app'

// Hook reactivo con las preferencias del negocio.
// `undefined` = cargando IndexedDB · `null` = aún no configurado · Settings = listo.
export function useSettings(): Settings | null | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get(SETTINGS_ID)
    if (s) setCurrency(s.currency)
    return s ?? null
  }, [])
}

export async function saveSettings(patch: Partial<Settings>) {
  const existing = await db.settings.get(SETTINGS_ID)
  const merged: Settings = {
    id: SETTINGS_ID,
    businessName: '',
    ownerName: '',
    sector: '',
    currency: 'XAF',
    phone: '',
    address: '',
    taxRate: 15,
    recordsLabel: 'Fichas',
    onboarded: false,
    createdAt: new Date().toISOString(),
    ...existing,
    ...patch,
  }
  await db.settings.put(merged)
  setCurrency(merged.currency)
  return merged
}
