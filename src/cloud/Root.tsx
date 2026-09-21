import { useAuth } from './auth'
import { useBusiness } from './business'
import AuthScreen from './AuthScreen'
import CreateBusiness from './CreateBusiness'
import CloudApp from './CloudApp'

export default function Root() {
  const { user, loading: authLoading } = useAuth()
  const { businesses, loading: bizLoading } = useBusiness()

  if (authLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  if (!user) return <AuthScreen />
  if (bizLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  if (businesses.length === 0) return <CreateBusiness />
  return <CloudApp />
}
