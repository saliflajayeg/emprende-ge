import { Routes, Route, Navigate } from 'react-router-dom'
import CloudLayout from './CloudLayout'
import Dashboard from '../pages/Dashboard'
import Transactions from '../pages/Transactions'
import Contacts from '../pages/Contacts'
import Catalog, { CATALOG_SERVICES, CATALOG_PRODUCTS, CATALOG_INGREDIENTS } from '../pages/Catalog'
import Stock from '../pages/Stock'
import Appointments from '../pages/Appointments'
import Jobs from '../pages/Jobs'
import Employees from '../pages/Employees'
import Settings from '../pages/Settings'
import Invoices from '../pages/Invoices'
import Records from '../pages/Records'
import Reports from '../pages/Reports'
import AdminPanel from './AdminPanel'
import { useBusiness } from './business'

const Loader = () => <div className="grid place-items-center py-20 text-slate-400">Cargando…</div>

export default function CloudApp() {
  const { role, isAdmin, loading } = useBusiness()
  // Rutas solo para el dueño: mientras el rol no se conozca (arranque), mostramos
  // cargando en vez de redirigir; el empleado tiene rol 'employee' (no null).
  const ownerOnly = (page: JSX.Element) =>
    role === 'owner' ? page : role === 'employee' ? <Navigate to="/" replace /> : <Loader />
  const adminOnly = (page: JSX.Element) =>
    isAdmin ? page : loading ? <Loader /> : <Navigate to="/" replace />
  return (
    <CloudLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transacciones" element={<Transactions />} />
        <Route path="/ventas" element={<Transactions title="Ventas" lockKind="income" emptyHint="Registra tu primera venta." />} />
        <Route path="/gastos" element={<Transactions title="Gastos" lockKind="expense" emptyHint="Registra tu primer gasto." />} />
        <Route path="/deudas" element={<Transactions title="Deudas" lockKind="income" pendingOnly emptyHint="Aquí verás lo que te deben los clientes." />} />
        <Route path="/cobros" element={<Transactions title="Cobros pendientes" lockKind="income" pendingOnly emptyHint="Aquí verás los cobros pendientes." />} />
        <Route path="/servicios" element={<Catalog cfg={CATALOG_SERVICES} />} />
        <Route path="/productos" element={<Catalog cfg={CATALOG_PRODUCTS} />} />
        <Route path="/ingredientes" element={<Catalog cfg={CATALOG_INGREDIENTS} />} />
        <Route path="/clientes" element={<Contacts />} />
        <Route path="/contactos" element={<Contacts />} />

        <Route path="/stock" element={<Stock />} />
        <Route path="/citas" element={<Appointments />} />
        <Route path="/trabajos" element={<Jobs />} />
        <Route path="/empleados" element={<Employees />} />

        <Route path="/facturas" element={<Invoices mode="invoices" />} />
        <Route path="/presupuestos" element={<Invoices mode="quotes" />} />

        <Route path="/fichas" element={<Records />} />
        <Route path="/informes" element={ownerOnly(<Reports />)} />
        <Route path="/ajustes" element={ownerOnly(<Settings />)} />
        <Route path="/admin" element={adminOnly(<AdminPanel />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CloudLayout>
  )
}
