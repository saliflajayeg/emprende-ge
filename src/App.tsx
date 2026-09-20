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
import Catalog, { CATALOG_SERVICES, CATALOG_PRODUCTS, CATALOG_INGREDIENTS } from './pages/Catalog'
import Stock from './pages/Stock'
import Appointments from './pages/Appointments'
import Jobs from './pages/Jobs'
import Employees from './pages/Employees'

export default function App() {
  const settings = useSettings()
  const [unlocked, setUnlockedState] = useState(isUnlocked())

  if (settings === undefined) {
    return <div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>
  }

  if (!settings || !settings.onboarded) {
    return <Onboarding />
  }

  if (settings.pinHash && !unlocked) {
    return <LockScreen settings={settings} onUnlock={() => setUnlockedState(true)} />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />

        {/* Movimientos (vistas reutilizadas) */}
        <Route path="/transacciones" element={<Transactions />} />
        <Route path="/ventas" element={<Transactions title="Ventas" lockKind="income" emptyHint="Registra tu primera venta." />} />
        <Route path="/gastos" element={<Transactions title="Gastos" lockKind="expense" emptyHint="Registra tu primer gasto." />} />
        <Route path="/deudas" element={<Transactions title="Deudas" lockKind="income" pendingOnly emptyHint="Aquí verás lo que te deben los clientes (ventas pendientes de cobro)." />} />
        <Route path="/cobros" element={<Transactions title="Cobros pendientes" lockKind="income" pendingOnly emptyHint="Aquí verás los cobros pendientes." />} />

        {/* Catálogo */}
        <Route path="/servicios" element={<Catalog cfg={CATALOG_SERVICES} />} />
        <Route path="/productos" element={<Catalog cfg={CATALOG_PRODUCTS} />} />
        <Route path="/ingredientes" element={<Catalog cfg={CATALOG_INGREDIENTS} />} />
        <Route path="/stock" element={<Stock />} />

        {/* Operativa */}
        <Route path="/citas" element={<Appointments />} />
        <Route path="/trabajos" element={<Jobs />} />
        <Route path="/empleados" element={<Employees />} />

        {/* Documentos */}
        <Route path="/facturas" element={<Invoices />} />
        <Route path="/presupuestos" element={<Invoices mode="quotes" />} />

        {/* Contactos y fichas */}
        <Route path="/clientes" element={<Contacts />} />
        <Route path="/contactos" element={<Contacts />} />
        <Route path="/fichas" element={<Records />} />

        <Route path="/informes" element={<Reports />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
