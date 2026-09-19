import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSettings } from './lib/hooks'
import { isUnlocked } from './lib/lock'
import Layout from './components/Layout'
import LockScreen from './components/LockScreen'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Invoices from './pages/Invoices'
import Records from './pages/Records'
import Contacts from './pages/Contacts'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

export default function App() {
  const settings = useSettings()
  const [unlocked, setUnlockedState] = useState(isUnlocked())

  // Cargando IndexedDB
  if (settings === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
    )
  }

  // Primer uso (sin registro o sin completar) → onboarding
  if (!settings || !settings.onboarded) {
    return <Onboarding />
  }

  // Bloqueo por PIN (si está configurado y no se ha desbloqueado esta sesión)
  if (settings.pinHash && !unlocked) {
    return <LockScreen settings={settings} onUnlock={() => setUnlockedState(true)} />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transacciones" element={<Transactions />} />
        <Route path="/facturas" element={<Invoices />} />
        <Route path="/fichas" element={<Records />} />
        <Route path="/contactos" element={<Contacts />} />
        <Route path="/informes" element={<Reports />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
