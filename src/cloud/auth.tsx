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

// Helpers de autenticación (email + contraseña)
export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}
export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
