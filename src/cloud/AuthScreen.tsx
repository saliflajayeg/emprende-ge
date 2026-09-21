import { useState } from 'react'
import { signIn, signUp } from './auth'
import { Button, Field, Input } from '../components/ui'

const BENEFITS = [
  { icon: '💵', text: 'Registra ventas y gastos en segundos' },
  { icon: '📊', text: 'Mira tu caja y tus beneficios al instante' },
  { icon: '🧾', text: 'Crea facturas y recibos en PDF' },
  { icon: '📶', text: 'Funciona sin internet y se sincroniza solo' },
  { icon: '👥', text: 'Compártelo con un empleado, en cualquier móvil' },
]

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!email.trim() || password.length < 6) {
      setError('Introduce un email y una contraseña de al menos 6 caracteres.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'register') await signUp(email.trim(), password)
      else await signIn(email.trim(), password)
      // La sesión se detecta automáticamente (AuthProvider)
    } catch (e) {
      const msg = (e as Error).message || ''
      if (/invalid login/i.test(msg)) setError('Email o contraseña incorrectos.')
      else if (/already registered/i.test(msg)) setError('Ese email ya tiene cuenta. Inicia sesión.')
      else setError(msg)
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 px-4 py-8">
      <div className="mx-auto grid w-full max-w-4xl items-center gap-8 md:grid-cols-2">
        {/* Presentación: qué es GEmprende y cómo ayuda */}
        <div className="order-1">
          <div className="mb-4 flex items-center gap-3">
            <img src="/logo-mark.png" alt="GEmprende" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
            <div>
              <div className="text-lg font-bold leading-tight text-slate-800">GEmprende</div>
              <div className="text-xs text-slate-500">para emprendedores de Guinea Ecuatorial</div>
            </div>
          </div>

          <img
            src="/welcome-hero.jpg"
            alt="Emprendedora gestionando su negocio con GEmprende"
            className="mb-5 w-full rounded-2xl shadow-md"
            loading="eager"
          />

          <h1 className="text-2xl font-bold leading-tight text-slate-800 sm:text-3xl">
            Tu negocio, claro y bajo control
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Registra tus ventas y gastos, controla tu caja y sabe si ganas dinero — todo desde el móvil y{' '}
            <b>aunque no tengas internet</b>.
          </p>

          <ul className="mt-4 space-y-2">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-100 text-base">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Formulario de acceso */}
        <div className="order-2 w-full">
          <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg sm:p-8">
            <h2 className="text-lg font-bold text-slate-800">
              {mode === 'login' ? 'Entra en tu cuenta' : 'Crea tu cuenta gratis'}
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              {mode === 'login' ? 'Continúa gestionando tu negocio.' : 'Empieza hoy, en menos de un minuto.'}
            </p>

            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setMode('login')}
                className={`rounded-md py-2 text-sm font-semibold ${mode === 'login' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => setMode('register')}
                className={`rounded-md py-2 text-sm font-semibold ${mode === 'register' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
              >
                Registrarme
              </button>
            </div>

            <div className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  autoComplete="email"
                />
              </Field>
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
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button className="w-full" onClick={submit} disabled={busy}>
                {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta gratis'}
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-400">
              Gestiona tus negocios desde cualquier dispositivo. Gratis para empezar.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
