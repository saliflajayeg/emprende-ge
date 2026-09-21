import { useState } from 'react'
import { BUSINESS_TYPES, MODULES, modulesFor, type BusinessType } from '../modules'
import { useBusiness } from './business'
import { useAuth } from './auth'
import { Button, Field, Input, Select } from '../components/ui'

export default function CreateBusiness({ onCancel }: { onCancel?: () => void }) {
  const { createBusiness, redeemInvite } = useBusiness()
  const { signOut } = useAuth()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    businessType: '' as BusinessType | '',
    currency: 'XAF',
    taxRate: 15,
  })
  const [join, setJoin] = useState({ code: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }))
  const selectedType = BUSINESS_TYPES.find((b) => b.id === form.businessType)

  async function doJoin() {
    setSaving(true)
    setError('')
    try {
      await redeemInvite(join.code, join.name || 'Empleado')
      onCancel?.()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function finish() {
    setSaving(true)
    setError('')
    try {
      const type = (form.businessType || 'other') as BusinessType
      await createBusiness({
        name: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        businessType: type,
        enabledModules: modulesFor(type),
        currency: form.currency,
        taxRate: form.taxRate,
      })
      onCancel?.()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-mark.png" alt="GEmprende" className="h-11 w-11 rounded-xl object-cover" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {mode === 'join' ? 'Unirme a un negocio' : 'Nuevo negocio'}
              </h1>
              <p className="text-sm text-slate-500">
                {mode === 'join' ? 'Con el código que te dio el dueño' : 'Configúralo en un momento'}
              </p>
            </div>
          </div>
          {onCancel ? (
            <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-700">Cancelar</button>
          ) : (
            <button onClick={signOut} className="text-sm text-slate-400 hover:text-slate-700">Salir</button>
          )}
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50"
            >
              <span className="text-2xl">🏪</span>
              <div>
                <div className="font-semibold text-slate-800">Tengo un negocio</div>
                <div className="text-sm text-slate-500">Créalo y empieza a gestionarlo</div>
              </div>
            </button>
            <button
              onClick={() => setMode('join')}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50"
            >
              <span className="text-2xl">👥</span>
              <div>
                <div className="font-semibold text-slate-800">Trabajo para un negocio</div>
                <div className="text-sm text-slate-500">Únete con el código de invitación del dueño</div>
              </div>
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <Field label="Código de invitación *">
              <Input
                value={join.code}
                onChange={(e) => setJoin((j) => ({ ...j, code: e.target.value.toUpperCase() }))}
                placeholder="Ej. A1B2C3"
                autoFocus
                className="text-center text-lg font-mono tracking-widest"
              />
            </Field>
            <Field label="Tu nombre">
              <Input value={join.name} onChange={(e) => setJoin((j) => ({ ...j, name: e.target.value }))} placeholder="Cómo te verá el dueño" />
            </Field>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMode('choose'); setError('') }}>← Atrás</Button>
              <Button className="flex-1" onClick={doJoin} disabled={saving || join.code.trim().length < 4}>
                {saving ? 'Uniéndome…' : 'Unirme al negocio'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'create' && step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">¿Qué tipo de negocio es?</h2>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_TYPES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => set('businessType', b.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    form.businessType === b.id ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <div className="text-2xl">{b.icon}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{b.label}</div>
                </button>
              ))}
            </div>
            {selectedType && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                Verás: {selectedType.modules.map((m) => MODULES[m].label).join(' · ')}
              </div>
            )}
            <Button className="w-full" onClick={() => setStep(2)} disabled={!form.businessType}>
              Continuar →
            </Button>
          </div>
        )}

        {mode === 'create' && step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Datos del negocio</h2>
            <Field label="Nombre del negocio *">
              <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Ej. Peluquería Bella" autoFocus />
            </Field>
            <Field label="Tu nombre">
              <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="Propietario/a" />
            </Field>
            <Field label="Moneda">
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                <option value="XAF">XAF (Franco CFA)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="USD">USD (Dólar)</option>
              </Select>
            </Field>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Atrás</Button>
              <Button className="flex-1" onClick={finish} disabled={saving || !form.businessName.trim()}>
                {saving ? 'Creando…' : 'Crear negocio'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
