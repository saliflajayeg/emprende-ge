# EmprendeGE

Plataforma sencilla de **contabilidad y control de caja para emprendedores de Guinea Ecuatorial**.
Español · moneda XAF por defecto · **funciona sin internet**.

## Qué hace (MVP)

- **Panel**: ingresos del mes, gastos, beneficio neto y margen; gráfico de flujo de caja (6 meses);
  alertas de saldo negativo, cobros y pagos pendientes.
- **Ingresos y gastos**: registra ventas y compras en pocos clics (fecha, categoría, cliente/proveedor,
  método de pago, estado pagado/pendiente). Filtros, búsqueda y exportación a CSV/Excel.
- **Facturas y recibos**: crea documentos con líneas de detalle e IVA, y descárgalos en **PDF**.
- **Contactos**: base de datos de clientes y proveedores.
- **Informes**: resumen mensual/anual con desglose por categoría, exportable a **PDF y Excel/CSV**.
- **Ajustes**: edita el negocio, gestiona categorías y haz **copia de seguridad / restaura** tus datos.

## Arquitectura

- **Local-first**: 100% en el navegador. Los datos se guardan en **IndexedDB** (vía Dexie) en el
  dispositivo del usuario. No hay servidor, no hay cuentas, no se envía nada a internet.
- Stack: **Vite + React + TypeScript + Tailwind v4**. Gráficos en SVG propio, PDF con jsPDF.
- Se despliega como **archivos estáticos** (GitHub Pages, Netlify, o incluso `file://`).

> ⚠️ Al ser local-first, la única copia de los datos está en el dispositivo. La pantalla de
> **Ajustes → Copia de seguridad** permite exportar/importar todo en un `.json`. Es el camino
> natural para, más adelante, sincronizar con un backend (p. ej. Supabase) sin reescribir la app.

## Uso

Doble clic en **`iniciar-emprende-ge.bat`** (instala dependencias la primera vez y abre el navegador).

O manualmente:

```bash
npm install
npm run dev
```

Compilar para producción (carpeta `dist/`):

```bash
npm run build
```

## Modelo de monetización (para más adelante)

- **Freemium**: panel básico gratis; suscripción baja por inventario multinivel, multiusuario,
  facturación electrónica o pasarelas de pago.
- **Marketplace**: directorio de proveedores, asesoría contable/gestoría contratable.
- **Plantillas premium**: facturas, contratos, módulos analíticos avanzados.
