import { useState } from 'react'
import { useAuth } from './auth'
import { useBusiness } from './business'
import AuthScreen from './AuthScreen'
import CreateBusiness from './CreateBusiness'
import { MODULES, type ModuleId } from '../modules'
import { Button, Card, Select } from '../components/ui'

function AuthedLanding() {
  const { signOut, user } = useAuth()
  const { businesses, current, role, setCurrent } = useBusiness()
  const [creating, setCreating] = useState(false)

  if (creating) return <CreateBusiness onCancel={() => setCreating(false)} />
  if (!current) return null

  const mods = (current.enabledModules as ModuleId[] | null) ?? []

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo-mark.png" alt="GEmprende" className="h-10 w-10 rounded-lg object-cover" />
        <div className="flex-1">
          <div className="font-bold text-slate-800">GEmprende</div>
          <div className="text-xs text-slate-400">{user?.email}</div>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-800">Cerrar sesión</button>
      </div>

      <Card className="mb-4">
        <label className="mb-1 block text-xs font-medium uppercase text-slate-400">Negocio actual</label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1">
            <Select value={current.id} onChange={(e) => setCurrent(e.target.value)}>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name || 'Sin nombre'}</option>
              ))}
            </Select>
          </div>
          <Button variant="outline" onClick={() => setCreating(true)}>＋ Nuevo negocio</Button>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {current.sector || current.businessType} · Rol: <b>{role === 'owner' ? 'Dueño' : 'Empleado'}</b>
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">✅ Tu cuenta y tus negocios están en la nube</h2>
        <p className="mb-3 text-sm text-slate-500">
          Ya puedes tener varios negocios y gestionarlos desde tu cuenta en cualquier dispositivo.
          Los módulos de este negocio son:
        </p>
        <div className="flex flex-wrap gap-2">
          {mods.map((id) => (
            <span key={id} className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {MODULES[id]?.icon} {MODULES[id]?.label}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Estamos conectando estos módulos (panel, ventas, catálogo…) a la nube. En el siguiente paso
          podrás usarlos y subir tus datos actuales.
        </p>
      </Card>
    </div>
  )
}

export default function Root() {
  const { user, loading: authLoading } = useAuth()
  const { businesses, loading: bizLoading } = useBusiness()

  if (authLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  if (!user) return <AuthScreen />
  if (bizLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  if (businesses.length === 0) return <CreateBusiness />
  return <AuthedLanding />
}
