// Bloqueo por PIN. El PIN nunca se guarda en claro: solo su hash SHA-256 con sal.
// Nota: es un bloqueo de acceso a la interfaz en el dispositivo (disuasorio para
// datos sensibles como los de menores), no cifrado completo de la base de datos.

const UNLOCK_KEY = 'emprende-unlocked'

export function randomSalt(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// La sesión desbloqueada se recuerda mientras la pestaña siga abierta.
export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function setUnlocked(v: boolean) {
  try {
    if (v) sessionStorage.setItem(UNLOCK_KEY, '1')
    else sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* sessionStorage no disponible: se pedirá el PIN igualmente */
  }
}
