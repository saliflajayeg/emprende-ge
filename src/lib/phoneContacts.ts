// Elegir clientes de la agenda del teléfono (Contact Picker API).
// Funciona en Chrome para Android (también con la app instalada). En iPhone y
// en ordenador no existe: canPickContacts() da false y el botón no se muestra.

export interface PickedContact { name: string; phone: string; email: string }

interface ContactsManager {
  select(props: ('name' | 'tel' | 'email')[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[]; email?: string[] }[]>
}

const manager = (): ContactsManager | undefined =>
  typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window
    ? (navigator as unknown as { contacts: ContactsManager }).contacts
    : undefined

export const canPickContacts = () => !!manager()

// Deja el número legible: quita guiones y paréntesis, y agrupa los de GE
// como "+240 222 556 677".
function cleanPhone(raw: string): string {
  const n = raw.replace(/[^\d+]/g, '').replace(/^00/, '+')
  const ge = n.match(/^(?:\+240)?(\d{3})(\d{3})(\d{3})$/)
  return ge ? `+240 ${ge[1]} ${ge[2]} ${ge[3]}` : n
}

// Clave para detectar duplicados: solo dígitos, sin prefijo de GE (+240).
export function phoneKey(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('240') && d.length > 9) d = d.slice(3)
  return d
}

/** Abre la agenda del teléfono. Devuelve [] si la persona cancela. */
export async function pickContacts(multiple: boolean): Promise<PickedContact[]> {
  const m = manager()
  if (!m) return []
  try {
    const res = await m.select(['name', 'tel', 'email'], { multiple })
    return res
      .map((r) => {
        const phone = cleanPhone(r.tel?.find((t) => t.trim()) ?? '')
        const name = (r.name?.find((n) => n.trim()) ?? '').trim() || phone
        return { name, phone, email: (r.email?.[0] ?? '').trim() }
      })
      .filter((c) => c.name)
  } catch {
    return [] // cancelado o sin permiso
  }
}
