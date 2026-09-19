import { useState } from 'react'
import type { Settings } from '../db/db'
import { hashPin, setUnlocked } from '../lib/lock'
import { Button } from './ui'

export default function LockScreen({ settings, onUnlock }: { settings: Settings; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  async function submit() {
    if (!pin || !settings.pinSalt || !settings.pinHash) return
    setChecking(true)
    const h = await hashPin(pin, settings.pinSalt)
    setChecking(false)
    if (h === settings.pinHash) {
      setUnlocked(true)
      onUnlock()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-teal-600 text-2xl">🔒</div>
        <h1 className="text-lg font-bold text-slate-800">{settings.businessName || 'EmprendeGE'}</h1>
        <p className="mb-4 text-sm text-slate-500">Introduce tu PIN para acceder</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className={`w-full rounded-lg border px-3 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:ring-2 ${
            error ? 'border-red-400 focus:ring-red-100' : 'border-slate-300 focus:ring-teal-100'
          }`}
          placeholder="••••"
        />
        {error && <p className="mt-2 text-sm text-red-500">PIN incorrecto</p>}
        <Button onClick={submit} className="mt-4 w-full" disabled={checking || !pin}>
          {checking ? 'Comprobando…' : 'Entrar'}
        </Button>
        <p className="mt-4 text-xs text-slate-400">
          Datos protegidos en este dispositivo. Si olvidas el PIN, tendrás que restaurar una copia de seguridad.
        </p>
      </div>
    </div>
  )
}
