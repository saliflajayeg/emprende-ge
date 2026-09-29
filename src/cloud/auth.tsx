import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthCtx {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} })

// Última cuenta conocida. La guardamos para poder seguir trabajando OFFLINE:
// el token de Supabase caduca (~1h) y, sin conexión, no puede renovarse; Supabase
// entonces borra la sesión y la app pediría iniciar sesión de nuevo. Con esta copia,
// si estamos sin conexión usamos la última cuenta para abrir los datos locales.
const LAST_USER_KEY = 'gemprende-last-user'

function cacheUser(u: User | null) {
  try {
    if (u) localStorage.setItem(LAST_USER_KEY, JSON.stringify(u))
  } catch { /* */ }
}
function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch { return null }
}
function clearCachedUser() {
  try { localStorage.removeItem(LAST_USER_KEY) } catch { /* */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const u = data.session?.user ?? null
        if (u) {
          setUser(u)
          cacheUser(u)
        } else if (!navigator.onLine) {
          // Sin conexión y sin sesión válida (token caducado): usa la última cuenta.
          setUser(readCachedUser())
        } else {
          setUser(null)
        }
        setLoading(false)
      })
      .catch(() => {
        // Fallo al leer la sesión (normalmente por falta de red): respaldo offline.
        setUser(readCachedUser())
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      if (u) {
        setUser(u)
        cacheUser(u)
      } else if (event === 'SIGNED_OUT' && navigator.onLine) {
        // Solo cerramos sesión de verdad cuando es intencional y hay conexión.
        // Un evento con sesión nula estando offline (renovación de token fallida)
        // NO debe expulsar al usuario.
        setUser(null)
        clearCachedUser()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    clearCachedUser()
    // Limpia también la copia local de negocios para que cerrar sesión sea real.
    try { localStorage.removeItem('gemprende-biz-cache') } catch { /* */ }
    setUser(null)
    try { await supabase.auth.signOut() } catch { /* */ }
  }

  return <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

// ¿Puede el navegador guardar la sesión? Samsung Internet en modo privado (o con
// datos del sitio bloqueados) impide localStorage: sin esto la sesión no persiste
// y el registro "no hace nada". Lo comprobamos para avisar con un mensaje claro.
export function storageAvailable(): boolean {
  try {
    const k = '__ge_test__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

const STORAGE_MSG =
  'Tu navegador está bloqueando el almacenamiento. Desactiva el modo privado/incógnito ' +
  'o permite los datos del sitio, y vuelve a intentarlo.'

// Helpers de autenticación (email + contraseña)
export async function signUp(email: string, password: string) {
  if (!storageAvailable()) throw new Error(STORAGE_MSG)
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  // Si el registro no devuelve sesión, casi siempre es porque la confirmación de
  // correo está activada en Supabase. Como los teléfonos usan un correo sintético
  // que nunca se confirma, intentamos iniciar sesión directamente.
  if (!data.session) {
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password })
    if (e2) {
      if (/not confirmed|confirm/i.test(e2.message)) {
        throw new Error(
          'Cuenta creada, pero falta confirmar el correo. Desactiva "Confirm email" en Supabase (Authentication → Providers → Email) para permitir el registro por teléfono.',
        )
      }
      throw e2
    }
  }
}
export async function signIn(email: string, password: string) {
  if (!storageAvailable()) throw new Error(STORAGE_MSG)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
