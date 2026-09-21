import { Routes, Route, Navigate } from 'react-router-dom'
import CloudLayout from './CloudLayout'
import Dashboard from '../pages/Dashboard'
import Transactions from '../pages/Transactions'
import Contacts from '../pages/Contacts'
import Catalog, { CATALOG_SERVICES, CATALOG_PRODUCTS, CATALOG_INGREDIENTS } from '../pages/Catalog'
import { Card } from '../components/ui'

function Soon({ name }: { name: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">{name}</h1>
      <Card>
        <p className="text-slate-600">🔌 Este módulo se está conectando a la nube con sincronización offline.</p>
        <p className="mt-1 text-sm text-slate-400">Muy pronto disponible. El panel, ventas, gastos, catálogo y contactos ya funcionan.</p>
      </Card>
    </div>
  )
}

export default function CloudApp() {
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

        {/* Pendientes de migrar a la nube */}
        <Route path="/stock" element={<Soon name="Stock" />} />
        <Route path="/citas" element={<Soon name="Citas" />} />
        <Route path="/trabajos" element={<Soon name="Trabajos pendientes" />} />
        <Route path="/empleados" element={<Soon name="Empleados" />} />
        <Route path="/facturas" element={<Soon name="Facturas" />} />
        <Route path="/presupuestos" element={<Soon name="Presupuestos" />} />
        <Route path="/fichas" element={<Soon name="Fichas" />} />
        <Route path="/informes" element={<Soon name="Informes" />} />
        <Route path="/ajustes" element={<Soon name="Ajustes" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CloudLayout>
  )
}
