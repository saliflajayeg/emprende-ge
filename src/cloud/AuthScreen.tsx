import { useState } from 'react'
import { signIn, signUp, storageAvailable } from './auth'
import { Button, Field, Input } from '../components/ui'
import { Money, ChartLineUp, Receipt, WifiSlash, Users, DeviceMobile, EnvelopeSimple, WarningCircle, type Icon } from '@phosphor-icons/react'

const BENEFITS: { icon: Icon; text: string }[] = [
  { icon: Receipt, text: 'Facturas bonitas en PDF, listas para WhatsApp' },
  { icon: Money, text: 'Apunta ventas y gastos en segundos' },
  { icon: ChartLineUp, text: 'Tu contabilidad del mes, hecha sola' },
  { icon: WifiSlash, text: 'Funciona sin internet y se guarda solo' },
  { icon: Users, text: 'Compártelo con un empleado, en cualquier móvil' },
]

// Normaliza un número de GE a dígitos, quitando prefijo +240 y ceros iniciales,
// para que el mismo número (escrito de varias formas) dé siempre el mismo id.
function normPhone(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('240')) d = d.slice(3)
  d = d.replace(/^0+/, '')
  return d
}
// El teléfono se usa como identificador con un correo sintético (sin SMS).
const phoneToEmail = (raw: string) => `${normPhone(raw)}@telefono.gemprende.app`

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [idType, setIdType] = useState<'email' | 'phone'>('phone')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const storageOk = storageAvailable()

  async function submit() {
    setError('')
    const isPhone = idType === 'phone'
    const identifier = isPhone ? phoneToEmail(phone) : email.trim()
    if (isPhone && normPhone(phone).length < 6) {
      setError('Introduce un número de teléfono válido.')
      return
    }
    if (!isPhone && !email.trim()) {
      setError('Introduce tu correo electrónico.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setBusy(true)
    try {
      // Tiempo límite: si la red se cuelga, mostramos error en vez de dejar el
      // botón en "Un momento…" para siempre.
      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('La conexión está tardando demasiado. Revisa tu internet e inténtalo de nuevo.')), 20000),
      )
      const action = mode === 'register' ? signUp(identifier, password) : signIn(identifier, password)
      await Promise.race([action, timeout])
      // La sesión se detecta automáticamente (AuthProvider)
    } catch (e) {
      const msg = (e as Error).message || ''
      if (/invalid login/i.test(msg)) setError(isPhone ? 'Teléfono o contraseña incorrectos.' : 'Correo o contraseña incorrectos.')
      else if (/already registered/i.test(msg)) setError(isPhone ? 'Ese teléfono ya tiene cuenta. Inicia sesión.' : 'Ese correo ya tiene cuenta. Inicia sesión.')
      else if (/fetch|network|failed to fetch/i.test(msg)) setError('Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.')
      else setError(msg || 'No se pudo completar. Inténtalo de nuevo.')
    }
    setBusy(false)
  }

  return (
    <div className="min-h-dvh bg-cream px-4 pb-10 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-2 md:items-center md:gap-10 md:pt-8">
        {/* Presentación: qué es GEmprende y cómo ayuda */}
        <div className="md:row-span-2">
          <div className="mb-5 flex items-center gap-3">
            <img src="/logo-mark.png" alt="GEmprende" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
            <div>
              <div className="font-display text-lg font-bold leading-tight text-slate-900">GEmprende</div>
              <div className="text-xs text-slate-500">para los negocios de Guinea Ecuatorial</div>
            </div>
          </div>

          <h1 className="text-[2rem] font-bold leading-[1.05] text-slate-900 sm:text-4xl">
            Tu negocio, claro y <span className="text-teal-700">bajo control</span>
          </h1>
          <p className="mt-2 max-w-md text-[15px] text-slate-600">
            Facturas, ventas, gastos y tu caja del mes — todo desde el móvil y <b className="text-slate-800">aunque no tengas internet</b>. Gratis.
          </p>

          <img
            src="/ill/hero-vendedora.webp"
            alt="Vendedora del mercado usando GEmprende en su móvil"
            className="mt-5 aspect-[16/10] w-full rounded-3xl object-cover shadow-[0_18px_40px_-22px_rgba(43,39,34,0.45)]"
            loading="eager"
          />

          <ul className="mt-6 hidden space-y-2.5 md:block">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><b.icon size={20} weight="duotone" /></span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Formulario de acceso */}
        <div className="w-full">
          <div className="mx-auto w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_18px_40px_-22px_rgba(43,39,34,0.35)] ring-1 ring-slate-200/70 sm:p-8">
            <h2 className="text-lg font-bold text-slate-800">
              {mode === 'login' ? 'Entra en tu cuenta' : 'Crea tu cuenta gratis'}
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              {mode === 'login' ? 'Continúa gestionando tu negocio.' : 'Empieza hoy, en menos de un minuto.'}
            </p>

            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setMode('login')}
                className={`min-h-10 rounded-lg py-2 text-sm font-semibold ${mode === 'login' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => setMode('register')}
                className={`min-h-10 rounded-lg py-2 text-sm font-semibold ${mode === 'register' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
              >
                Registrarme
              </button>
            </div>

            {!storageOk && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <WarningCircle size={16} weight="fill" className="mr-1 inline align-[-3px]" /> Tu navegador está bloqueando el almacenamiento (modo privado/incógnito o datos del sitio
                bloqueados). El registro no funcionará hasta que lo desactives o abras la app en una pestaña normal.
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  onClick={() => setIdType('phone')}
                  className={`min-h-10 rounded-lg py-1.5 text-sm font-semibold ${idType === 'phone' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <span className="inline-flex items-center gap-1.5"><DeviceMobile size={16} weight="bold" /> Teléfono</span>
                </button>
                <button
                  onClick={() => setIdType('email')}
                  className={`min-h-10 rounded-lg py-1.5 text-sm font-semibold ${idType === 'email' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <span className="inline-flex items-center gap-1.5"><EnvelopeSimple size={16} weight="bold" /> Correo</span>
                </button>
              </div>

              {idType === 'phone' ? (
                <Field label="Número de teléfono">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej. 222 111 333"
                    autoComplete="tel"
                  />
                  <p className="mt-1 text-xs text-slate-400">Sin SMS. Usa el mismo número y contraseña para volver a entrar.</p>
                </Field>
              ) : (
                <Field label="Correo electrónico">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@ejemplo.com"
                    autoComplete="email"
                  />
                </Field>
              )}
              <Field label="Contraseña">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Field>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
              <Button className="w-full" onClick={submit} disabled={busy}>
                {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta gratis'}
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-400">
              Gestiona tus negocios desde cualquier dispositivo. Gratis.
            </p>
          </div>
        </div>

        <ul className="space-y-2.5 md:hidden">
          {BENEFITS.map((b) => (
            <li key={b.text} className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><b.icon size={20} weight="duotone" /></span>
              {b.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
