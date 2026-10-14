import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Con "internet de mentira" (wifi/datos conectados pero sin saldo o sin señal real)
// una petición puede quedarse colgada minutos. Le ponemos un límite para que nada
// espere eternamente: la app sigue con los datos del teléfono y reintenta luego.
const REQUEST_TIMEOUT_MS = 60_000
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  const outer = init?.signal
  if (outer) {
    if (outer.aborted) ctrl.abort()
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: fetchWithTimeout },
})

/** Resuelve con el resultado o con `fallback` si tarda más de `ms`. */
export function withTimeout<T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return Promise.race([p, new Promise<F>((resolve) => setTimeout(() => resolve(fallback), ms))])
}
