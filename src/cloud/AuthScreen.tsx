import { useState } from 'react'
import { signIn, signUp } from './auth'
import { Button, Field, Input } from '../components/ui'

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
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-mark.png" alt="GEmprende" className="h-12 w-12 rounded-xl object-cover shadow-sm" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">GEmprende</h1>
            <p className="text-sm text-slate-500">
              {mode === 'login' ? 'Entra en tu cuenta' : 'Crea tu cuenta'}
            </p>
          </div>
        </div>

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
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Con tu cuenta gestionas tus negocios desde cualquier dispositivo.
        </p>
      </div>
    </div>
  )
}
