import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Kind, type Category } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { BUSINESS_TYPES, MODULES, TOGGLEABLE, modulesFor, type ModuleId } from '../modules'
import { Card, Button, Field, Input, Select } from '../components/ui'

const PALETTE = ['#0d9488', '#0ea5e9', '#8b5cf6', '#ef4444', '#f97316', '#eab308', '#84cc16', '#ec4899', '#6366f1']

export default function Settings() {
  const { current, updateBusiness } = useBusiness()
  const bid = current?.id ?? ''
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const [msg, setMsg] = useState('')
  const [newCat, setNewCat] = useState<{ income: string; expense: string }>({ income: '', expense: '' })

  if (!current || !categories) return <div className="text-slate-400">Cargando…</div>

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 2500)
  }

  async function saveBiz(patch: Record<string, string | number | string[]>) {
    await updateBusiness(patch)
    flash('Guardado ✓')
  }

  const enabled = (current.enabledModules as ModuleId[] | undefined) ?? modulesFor(current.businessType)

  async function changeType(type: string) {
    if (!confirm('Esto ajustará los módulos visibles del menú a los de ese tipo de negocio. ¿Continuar?')) return
    await updateBusiness({
      businessType: type,
      enabledModules: modulesFor(type),
      sector: BUSINESS_TYPES.find((b) => b.id === type)?.label ?? '',
    })
    flash('Módulos actualizados ✓')
  }

  async function toggleModule(id: ModuleId) {
    const s = new Set(enabled)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    await updateBusiness({ enabledModules: [...s] })
  }

  async function addCategory(kind: Kind) {
    const name = newCat[kind].trim()
    if (!name) return
    await ldb.categories.add({ kind, name, color: PALETTE[Math.floor(Math.random() * PALETTE.length)] } as Category)
    setNewCat((s) => ({ ...s, [kind]: '' }))
  }

  async function delCategory(id?: string) {
    if (!id) return
    if (confirm('¿Eliminar la categoría? Los movimientos existentes quedarán sin categoría.'))
      await removeRow('categories', id)
  }

  const Cats = ({ kind, title }: { kind: Kind; title: string }) => (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-600">{title}</div>
      <div className="mb-2 flex flex-wrap gap-2">
        {categories.filter((c) => c.kind === kind).map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            {c.name}
            <button onClick={() => delCategory(c.id)} className="text-slate-300 hover:text-red-500">✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Nueva categoría…"
          value={newCat[kind]}
          onChange={(e) => setNewCat((s) => ({ ...s, [kind]: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && addCategory(kind)}
        />
        <Button variant="outline" onClick={() => addCategory(kind)}>Añadir</Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Ajustes</h1>
        {msg && <span className="text-sm font-medium text-teal-600">{msg}</span>}
      </div>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-800">Datos del negocio</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre del negocio">
            <Input defaultValue={current.name} onBlur={(e) => saveBiz({ name: e.target.value })} />
          </Field>
          <Field label="Propietario/a">
            <Input defaultValue={current.ownerName} onBlur={(e) => saveBiz({ ownerName: e.target.value })} />
          </Field>
          <Field label="Tipo de negocio">
            <Select value={current.businessType ?? 'other'} onChange={(e) => changeType(e.target.value)}>
              {BUSINESS_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
          <Field label="Moneda">
            <Select defaultValue={current.currency} onChange={(e) => saveBiz({ currency: e.target.value })}>
              <option value="XAF">XAF (Franco CFA)</option>
              <option value="EUR">EUR (Euro)</option>
              <option value="USD">USD (Dólar)</option>
            </Select>
          </Field>
          <Field label="Teléfono">
            <Input defaultValue={current.phone} onBlur={(e) => saveBiz({ phone: e.target.value })} />
          </Field>
          <Field label="IVA por defecto (%)">
            <Input type="number" defaultValue={current.taxRate} onBlur={(e) => saveBiz({ taxRate: Number(e.target.value) })} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input defaultValue={current.address} onBlur={(e) => saveBiz({ address: e.target.value })} />
          </Field>
          <Field label="Nombre del módulo de fichas" className="sm:col-span-2">
            <Input
              defaultValue={current.recordsLabel}
              placeholder="Fichas, Clientes, Expedientes, Pacientes…"
              onBlur={(e) => saveBiz({ recordsLabel: e.target.value || 'Fichas' })}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Los cambios se guardan al salir de cada campo. «Nombre del módulo de fichas» cambia cómo se
          llama la sección de expedientes en el menú (p. ej. «Clientes» para una peluquería, «Niños» para una acogida).
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">Módulos visibles en el menú</h2>
        <p className="mb-4 text-sm text-slate-500">
          Activa o desactiva los módulos que quieres ver. El tipo de negocio elige unos por defecto,
          pero puedes personalizarlo.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOGGLEABLE.map((id) => {
            const on = enabled.includes(id)
            const m = MODULES[id]
            return (
              <button
                key={id}
                onClick={() => toggleModule(id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  on ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
              >
                <span>{m.icon}</span>
                <span className="flex-1 truncate">{id === 'records' ? current.recordsLabel || m.label : m.label}</span>
                <span className={`text-xs ${on ? 'text-teal-600' : 'text-slate-300'}`}>{on ? '●' : '○'}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">Panel, Informes y Ajustes siempre están visibles.</p>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-800">Categorías</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <Cats kind="income" title="Ingresos" />
          <Cats kind="expense" title="Gastos" />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">☁️ Tus datos en la nube</h2>
        <p className="text-sm text-slate-500">
          Tus datos se guardan en este dispositivo y se sincronizan automáticamente a la nube cuando hay conexión.
          Puedes trabajar sin red: todo se subirá solo al reconectar. Al iniciar sesión en otro dispositivo (o al
          añadir a un empleado) verás la misma información.
        </p>
      </Card>
    </div>
  )
}
