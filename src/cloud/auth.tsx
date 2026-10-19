import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, withTimeout } from '../lib/supabase'
import { DEMO, DEMO_USER_ID } from './demo'

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
  // OFFLINE PRIMERO: si este teléfono ya tiene una cuenta guardada, la app abre
  // AL INSTANTE con ella y con los datos locales. La comprobación con Supabase va
  // después, en segundo plano, y nunca bloquea la apertura (sin internet, o con
  // internet "de mentira" sin saldo, la app se quedaba en «Cargando…»).
  const [user, setUser] = useState<User | null>(() => (DEMO ? null : readCachedUser()))
  const [loading, setLoading] = useState(() => DEMO || !readCachedUser())

  useEffect(() => {
    // Modo demo (solo desarrollo): usuario ficticio, sin iniciar sesión.
    if (DEMO) {
      setUser({ id: DEMO_USER_ID, email: 'demo@gemprende.app' } as User)
      setLoading(false)
      return
    }
    let alive = true
    withTimeout(supabase.auth.getSession(), 8000, null)
      .then((res) => {
        if (!alive) return
        if (res === null) return // tarda demasiado: seguimos con la cuenta guardada
        const u = res.data.session?.user ?? null
        if (u) {
          setUser(u)
          cacheUser(u)
        } else if (!res.error) {
          // No hay ninguna sesión guardada en este navegador: hay que iniciar sesión.
          setUser(null)
          clearCachedUser()
        }
        // Con error (normalmente de red) se mantiene la cuenta guardada.
      })
      .catch(() => { /* sin red: seguimos con la cuenta guardada */ })
      .finally(() => { if (alive) setLoading(false) })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      if (u) {
        setUser(u)
        cacheUser(u)
      } else if (event === 'SIGNED_OUT' && navigator.onLine) {
        // Solo cerramos sesión cuando el servidor la rechaza de verdad o el usuario
        // la cierra. Un fallo de red al renovar el token NO expulsa a nadie.
        setUser(null)
        clearCachedUser()
        try { localStorage.removeItem('gemprende-biz-cache') } catch { /* */ }
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
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
