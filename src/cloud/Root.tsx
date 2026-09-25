import { Routes, Route, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { useBusiness } from './business'
import AuthScreen from './AuthScreen'
import CreateBusiness from './CreateBusiness'
import CloudApp from './CloudApp'
import PublicBooking from './PublicBooking'

export default function Root() {
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const { businesses, loading: bizLoading } = useBusiness()

  // Página PÚBLICA de reservas (no requiere iniciar sesión)
  if (location.pathname.startsWith('/reservar/')) {
    return (
      <Routes>
        <Route path="/reservar/:bid" element={<PublicBooking />} />
      </Routes>
    )
  }

  if (authLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  if (!user) return <AuthScreen />
  if (bizLoading) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  if (businesses.length === 0) return <CreateBusiness />
  return <CloudApp />
}
