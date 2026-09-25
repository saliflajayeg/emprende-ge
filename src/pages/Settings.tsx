import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ldb, removeRow, type Kind, type Category } from '../cloud/localdb'
import { useBusiness } from '../cloud/business'
import { useAuth } from '../cloud/auth'
import { legacySummary, importLegacy, type LegacySummary } from '../cloud/importLegacy'
import { fileToDataURL } from '../lib/image'
import { BUSINESS_TYPES, MODULES, TOGGLEABLE, MODULE_DEPS, modulesFor, withDeps, type ModuleId } from '../modules'
import { Card, Button, Field, Input, Select } from '../components/ui'

const TABLE_LABEL: Record<string, string> = {
  transactions: 'movimientos', contacts: 'contactos', items: 'catálogo', invoices: 'facturas',
  appointments: 'citas', jobs: 'trabajos', employees: 'empleados', records: 'fichas', recordEntries: 'seguimientos',
}

const PALETTE = ['#0d9488', '#0ea5e9', '#8b5cf6', '#ef4444', '#f97316', '#eab308', '#84cc16', '#ec4899', '#6366f1']

// Editor de categorías (a nivel de módulo para que el input NO pierda el foco al
// escribir; si estuviera definido dentro de Settings se recrearía en cada tecla).
function CatList({
  title, cats, value, onChange, onAdd, onDelete,
}: {
  title: string
  cats: Category[]
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  onDelete: (id?: string) => void
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-600">{title}</div>
      <div className="mb-2 flex flex-wrap gap-2">
        {cats.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            {c.name}
            <button onClick={() => onDelete(c.id)} className="text-slate-300 hover:text-red-500">✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Nueva categoría…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <Button variant="outline" onClick={onAdd}>Añadir</Button>
      </div>
    </div>
  )
}

export default function Settings() {
  const { current, updateBusiness, members, createInvite, removeMember } = useBusiness()
  const { user } = useAuth()
  const bid = current?.id ?? ''
  const categories = useLiveQuery(() => (bid ? ldb.categories.where('businessId').equals(bid).toArray() : []), [bid])
  const [msg, setMsg] = useState('')
  const [newCat, setNewCat] = useState<{ income: string; expense: string }>({ income: '', expense: '' })
  const [invite, setInvite] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [legacy, setLegacy] = useState<LegacySummary | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  useEffect(() => {
    if (bid) legacySummary(bid).then(setLegacy).catch(() => setLegacy(null))
  }, [bid])

  if (!current || !categories) return <div className="text-slate-400">Cargando…</div>

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 2500)
  }

  async function saveBiz(patch: Record<string, any>) {
    await updateBusiness(patch)
    flash('Guardado ✓')
  }

  async function onLogo(file?: File) {
    if (!file) return
    try {
      const dataUrl = await fileToDataURL(file, 256, 0.9, 'image/png')
      await updateBusiness({ logo: dataUrl })
      flash('Logo actualizado ✓')
    } catch (e) {
      flash('Error: ' + (e as Error).message)
    }
  }

  const enabled = (current.enabledModules as ModuleId[] | undefined) ?? modulesFor(current.businessType)

  async function changeType(type: string) {
    if (!confirm('Esto ajustará los módulos visibles del menú a los de ese tipo de negocio. ¿Continuar?')) return
    await updateBusiness({
      businessType: type,
      enabledModules: withDeps(modulesFor(type)),
      sector: BUSINESS_TYPES.find((b) => b.id === type)?.label ?? '',
    })
    flash('Módulos actualizados ✓')
  }

  async function toggleModule(id: ModuleId) {
    const s = new Set(enabled)
    if (s.has(id)) {
      s.delete(id)
    } else {
      // Al activar un módulo se activan también sus dependencias
      // (servicios→citas, productos/ingredientes→stock).
      s.add(id)
      for (const dep of MODULE_DEPS[id] ?? []) s.add(dep)
    }
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

  async function genInvite() {
    setInviteBusy(true)
    try {
      setInvite(await createInvite())
    } catch (e) {
      flash('Error: ' + (e as Error).message)
    }
    setInviteBusy(false)
  }

  async function kickMember(userId: string, name: string) {
    if (!confirm(`¿Quitar a "${name}" del negocio? Perderá el acceso a estos datos.`)) return
    try {
      await removeMember(userId)
      flash('Empleado quitado ✓')
    } catch (e) {
      flash('Error: ' + (e as Error).message)
    }
  }

  async function runImport() {
    if (!bid) return
    if (!confirm('Se copiarán tus datos anteriores de este dispositivo a este negocio en la nube. ¿Continuar?')) return
    setImportBusy(true)
    try {
      const done = await importLegacy(bid)
      const total = Object.values(done).reduce((s, n) => s + n, 0)
      flash(`Importados ${total} registros ✓`)
      setLegacy(await legacySummary(bid))
    } catch (e) {
      flash('Error: ' + (e as Error).message)
    }
    setImportBusy(false)
  }

  const employee = members.find((m) => m.role === 'employee')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Ajustes</h1>
        {msg && <span className="text-sm font-medium text-teal-600">{msg}</span>}
      </div>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-800">Datos del negocio</h2>

        <div className="mb-4 flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-2xl text-slate-300">
            {current.logo ? <img src={current.logo} alt="Logo" className="h-full w-full object-contain" /> : '🏢'}
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-700">Logo del negocio</div>
            <p className="text-xs text-slate-400">Aparecerá en tus facturas y recibos. PNG o JPG.</p>
            <div className="flex gap-2 pt-1">
              <label className="inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {current.logo ? 'Cambiar logo' : '📷 Subir logo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] || undefined)} />
              </label>
              {current.logo && (
                <button onClick={() => saveBiz({ logo: null })} className="text-sm text-red-500 hover:underline">Quitar</button>
              )}
            </div>
          </div>
        </div>

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
        <p className="mt-2 text-xs text-slate-400">
          Panel, Informes y Ajustes siempre están visibles. Al activar <b>Servicios</b> se añaden las <b>Citas</b>,
          y al activar <b>Productos</b> o <b>Ingredientes</b> se añade el <b>Stock</b>.
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-800">Categorías</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <CatList
            title="Ingresos"
            cats={categories.filter((c) => c.kind === 'income')}
            value={newCat.income}
            onChange={(v) => setNewCat((s) => ({ ...s, income: v }))}
            onAdd={() => addCategory('income')}
            onDelete={delCategory}
          />
          <CatList
            title="Gastos"
            cats={categories.filter((c) => c.kind === 'expense')}
            value={newCat.expense}
            onChange={(v) => setNewCat((s) => ({ ...s, expense: v }))}
            onAdd={() => addCategory('expense')}
            onDelete={delCategory}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">👥 Equipo (acceso compartido)</h2>
        <p className="mb-3 text-sm text-slate-500">
          Da acceso a <b>una</b> persona más (un empleado). Comparte con ella los mismos datos, en tiempo real y
          también sin conexión. El empleado puede registrar y editar, pero no borra, ni ve Informes ni Ajustes.
        </p>

        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  {m.name || (m.role === 'owner' ? 'Dueño/a' : 'Empleado')}
                  {m.userId === user?.id && <span className="ml-1 text-xs text-slate-400">(tú)</span>}
                </div>
                <div className="text-xs text-slate-400">{m.role === 'owner' ? 'Dueño/a' : 'Empleado'}</div>
              </div>
              {m.role === 'employee' && (
                <button onClick={() => kickMember(m.userId, m.name)} className="text-sm text-red-500 hover:underline">
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>

        {!employee && (
          <div className="mt-3">
            {invite ? (
              <div className="rounded-lg bg-teal-50 p-4 text-center">
                <div className="text-xs uppercase text-teal-700">Código de invitación</div>
                <div className="my-1 font-mono text-3xl font-bold tracking-widest text-teal-800">{invite}</div>
                <p className="text-xs text-slate-500">
                  Dáselo a tu empleado. En su móvil: abre GEmprende → crea su cuenta → «Trabajo para un negocio» → escribe este código.
                </p>
              </div>
            ) : (
              <Button onClick={genInvite} disabled={inviteBusy}>
                {inviteBusy ? 'Generando…' : '➕ Invitar a un empleado'}
              </Button>
            )}
          </div>
        )}
      </Card>

      {legacy?.found && (
        <Card className="border-teal-200 bg-teal-50/40">
          <h2 className="mb-1 font-semibold text-slate-800">📥 Importar datos anteriores</h2>
          {legacy.imported ? (
            <p className="text-sm text-slate-500">
              Ya importaste los datos de este dispositivo a este negocio. Si necesitas volver a hacerlo,
              recarga la página con conexión.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-600">
                Hemos encontrado datos de la versión anterior guardados en <b>este dispositivo</b>. Puedes
                copiarlos a tu negocio en la nube (se suman a lo que ya tengas; no se borra nada).
              </p>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {Object.entries(legacy.counts)
                  .filter(([k, n]) => k !== 'categories' && n > 0)
                  .map(([k, n]) => (
                    <span key={k} className="rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
                      {n} {TABLE_LABEL[k] ?? k}
                    </span>
                  ))}
              </div>
              <Button onClick={runImport} disabled={importBusy}>
                {importBusy ? 'Importando…' : '📥 Importar mis datos anteriores'}
              </Button>
              <p className="mt-2 text-xs text-slate-400">
                Hazlo en el móvil donde usabas la app antes. Los datos antiguos no se borran de tu dispositivo.
              </p>
            </>
          )}
        </Card>
      )}

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
