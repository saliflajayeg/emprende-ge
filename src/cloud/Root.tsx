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
  if (businesses.length === 0) {
    // Primera vez en este teléfono y sin internet: aún no hay copia local que abrir.
    if (!navigator.onLine) {
      return (
        <div className="grid min-h-dvh place-items-center bg-cream p-6 text-center">
          <div className="max-w-xs">
            <img src="/logo-mark.png" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl" />
            <h1 className="text-xl font-bold text-slate-900">Conéctate una vez</h1>
            <p className="mt-2 text-sm text-slate-600">
              Es la primera vez que abres tu negocio en este teléfono. Conéctate a internet un momento para
              descargarlo; después funcionará también sin conexión.
            </p>
            <button onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white">Reintentar</button>
          </div>
        </div>
      )
    }
    return <CreateBusiness />
  }
  return <CloudApp />
}
