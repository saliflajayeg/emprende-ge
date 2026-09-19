import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Kind } from '../db/db'
import { SECTORS } from '../db/seed'
import { saveSettings, useSettings } from '../lib/hooks'
import { exportBackup, restoreBackup } from '../lib/backup'
import { hashPin, randomSalt, setUnlocked } from '../lib/lock'
import { formatDate } from '../lib/format'
import { Card, Button, Field, Input, Select } from '../components/ui'

const PALETTE = ['#0d9488', '#0ea5e9', '#8b5cf6', '#ef4444', '#f97316', '#eab308', '#84cc16', '#ec4899', '#6366f1']

export default function Settings() {
  const settings = useSettings()
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [newCat, setNewCat] = useState<{ income: string; expense: string }>({ income: '', expense: '' })

  if (!settings || !categories) return <div className="text-slate-400">Cargando…</div>

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 2500)
  }

  async function saveBiz(patch: Record<string, string | number>) {
    await saveSettings(patch)
    flash('Guardado ✓')
  }

  async function addCategory(kind: Kind) {
    const name = newCat[kind].trim()
    if (!name) return
    await db.categories.add({ kind, name, color: PALETTE[Math.floor(Math.random() * PALETTE.length)] })
    setNewCat((s) => ({ ...s, [kind]: '' }))
  }

  async function delCategory(id?: number) {
    if (!id) return
    if (confirm('¿Eliminar la categoría? Los movimientos existentes quedarán sin categoría.'))
      await db.categories.delete(id)
  }

  async function backup() {
    await exportBackup()
    flash('Copia descargada ✓')
  }

  async function restore(file: File) {
    try {
      if (!confirm('Esto reemplazará TODOS los datos actuales por los de la copia. ¿Continuar?')) return
      await restoreBackup(file)
      flash('Datos restaurados ✓')
    } catch (e) {
      flash('Error: ' + (e as Error).message)
    }
  }

  async function setPin() {
    const pin = prompt('Elige un PIN (4 o más dígitos). Lo necesitarás para abrir la app en este dispositivo:')
    if (pin === null) return
    if (!/^\d{4,}$/.test(pin)) {
      flash('El PIN debe tener al menos 4 dígitos')
      return
    }
    const confirmPin = prompt('Repite el PIN para confirmar:')
    if (confirmPin !== pin) {
      flash('Los PIN no coinciden')
      return
    }
    const salt = randomSalt()
    const pinHash = await hashPin(pin, salt)
    await saveSettings({ pinSalt: salt, pinHash })
    setUnlocked(true)
    flash('PIN activado ✓')
  }

  async function removePin() {
    const pin = prompt('Introduce tu PIN actual para desactivarlo:')
    if (pin === null || !settings) return
    const h = await hashPin(pin, settings.pinSalt || '')
    if (h !== settings.pinHash) {
      flash('PIN incorrecto')
      return
    }
    await saveSettings({ pinHash: undefined, pinSalt: undefined })
    flash('PIN desactivado ✓')
  }

  async function wipe() {
    if (!confirm('⚠️ Esto BORRARÁ todos tus datos de este dispositivo de forma permanente. ¿Seguro?')) return
    if (!confirm('Última confirmación: se perderán ingresos, gastos, facturas y contactos.')) return
    await Promise.all([
      db.settings.clear(), db.categories.clear(), db.contacts.clear(),
      db.transactions.clear(), db.invoices.clear(), db.records.clear(), db.recordEntries.clear(),
    ])
    location.reload()
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
            <Input defaultValue={settings.businessName} onBlur={(e) => saveBiz({ businessName: e.target.value })} />
          </Field>
          <Field label="Propietario/a">
            <Input defaultValue={settings.ownerName} onBlur={(e) => saveBiz({ ownerName: e.target.value })} />
          </Field>
          <Field label="Sector">
            <Select defaultValue={settings.sector} onChange={(e) => saveBiz({ sector: e.target.value })}>
              {SECTORS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Moneda">
            <Select defaultValue={settings.currency} onChange={(e) => saveBiz({ currency: e.target.value })}>
              <option value="XAF">XAF (Franco CFA)</option>
              <option value="EUR">EUR (Euro)</option>
              <option value="USD">USD (Dólar)</option>
            </Select>
          </Field>
          <Field label="Teléfono">
            <Input defaultValue={settings.phone} onBlur={(e) => saveBiz({ phone: e.target.value })} />
          </Field>
          <Field label="IVA por defecto (%)">
            <Input type="number" defaultValue={settings.taxRate} onBlur={(e) => saveBiz({ taxRate: Number(e.target.value) })} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input defaultValue={settings.address} onBlur={(e) => saveBiz({ address: e.target.value })} />
          </Field>
          <Field label="Nombre del módulo de fichas" className="sm:col-span-2">
            <Input
              defaultValue={settings.recordsLabel}
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
        <h2 className="mb-4 font-semibold text-slate-800">Categorías</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <Cats kind="income" title="Ingresos" />
          <Cats kind="expense" title="Gastos" />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">Acceso con PIN</h2>
        <p className="mb-3 text-sm text-slate-500">
          Protege la app con un código en este dispositivo. Recomendado si guardas datos sensibles (p. ej. expedientes
          de menores). Es un bloqueo de acceso; recuerda tu PIN, no se puede recuperar.
        </p>
        {settings.pinHash ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">🔒 PIN activado</span>
            <Button variant="outline" onClick={setPin}>Cambiar PIN</Button>
            <Button variant="ghost" onClick={removePin} className="text-red-600">Desactivar</Button>
          </div>
        ) : (
          <Button onClick={setPin}>🔒 Activar PIN de acceso</Button>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">Copia de seguridad</h2>
        <p className="mb-2 text-sm text-slate-500">
          Tus datos viven solo en este dispositivo. Descarga una copia con frecuencia y guárdala en un lugar seguro
          (correo, USB…). Podrás restaurarla aquí o en otro dispositivo.
        </p>
        <p className="mb-4 text-xs text-slate-400">
          Última copia: {settings.lastBackupAt ? formatDate(settings.lastBackupAt.slice(0, 10)) : 'nunca'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={backup}>⬇ Descargar copia (.json)</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>⬆ Restaurar copia</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
          />
        </div>
      </Card>

      <Card className="border-red-200">
        <h2 className="mb-1 font-semibold text-red-700">Zona peligrosa</h2>
        <p className="mb-3 text-sm text-slate-500">Borra todos los datos de este dispositivo. Haz una copia antes.</p>
        <Button variant="danger" onClick={wipe}>Borrar todos los datos</Button>
      </Card>
    </div>
  )
}
