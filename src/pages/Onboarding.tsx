import { useState } from 'react'
import { seedDefaultCategories, DEFAULT_INCOME, DEFAULT_EXPENSE } from '../db/seed'
import { saveSettings } from '../lib/hooks'
import { BUSINESS_TYPES, MODULES, modulesFor, type BusinessType } from '../modules'
import { Button, Field, Input, Select } from '../components/ui'

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    businessType: '' as BusinessType | '',
    currency: 'XAF',
    phone: '',
    taxRate: 15,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }))

  async function finish() {
    setSaving(true)
    await seedDefaultCategories()
    const type = (form.businessType || 'other') as BusinessType
    await saveSettings({
      businessName: form.businessName,
      ownerName: form.ownerName,
      sector: BUSINESS_TYPES.find((b) => b.id === type)?.label ?? '',
      businessType: type,
      enabledModules: modulesFor(type),
      currency: form.currency,
      phone: form.phone,
      taxRate: form.taxRate,
      onboarded: true,
      createdAt: new Date().toISOString(),
    })
  }

  const selectedType = BUSINESS_TYPES.find((b) => b.id === form.businessType)

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-600 text-xl font-bold text-white">E</span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">EmprendeGE</h1>
            <p className="text-sm text-slate-500">Controla tu negocio en minutos</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-teal-600' : 'bg-slate-200'}`} />
          ))}
        </div>

        {/* Paso 1: tipo de negocio */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">¿Qué tipo de negocio tienes?</h2>
            <p className="text-sm text-slate-500">La app se adaptará para mostrarte solo lo que necesitas.</p>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_TYPES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => set('businessType', b.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    form.businessType === b.id
                      ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100'
                      : 'border-slate-200 hover:border-teal-300'
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

        {/* Paso 2: datos del negocio */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Datos de tu negocio</h2>
            <Field label="Nombre del negocio *">
              <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Ej. Peluquería Bella" autoFocus />
            </Field>
            <Field label="Tu nombre">
              <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="Propietario/a" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Moneda">
                <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  <option value="XAF">XAF (Franco CFA)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="USD">USD (Dólar)</option>
                </Select>
              </Field>
              <Field label="Teléfono">
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+240 …" />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Atrás</Button>
              <Button className="flex-1" onClick={() => setStep(3)} disabled={!form.businessName.trim()}>
                Continuar →
              </Button>
            </div>
          </div>
        )}

        {/* Paso 3: listo */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">¡Todo listo!</h2>
            <p className="text-sm text-slate-500">
              Preparamos tu {selectedType?.label.toLowerCase()} con categorías de ingresos y gastos iniciales.
            </p>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-teal-600">Ingresos</div>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_INCOME.map((c) => (
                  <span key={c.name} className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">{c.name}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-red-500">Gastos</div>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_EXPENSE.map((c) => (
                  <span key={c.name} className="rounded-full bg-red-50 px-3 py-1 text-sm text-red-600">{c.name}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              🔒 Tus datos se guardan solo en este dispositivo. Podrás cambiar los módulos visibles en Ajustes.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>← Atrás</Button>
              <Button className="flex-1" onClick={finish} disabled={saving}>
                {saving ? 'Creando…' : 'Empezar a usar EmprendeGE'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
