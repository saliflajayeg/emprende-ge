-- ============================================================================
-- Facturas que alimentan la caja: cada cobro/abono (ingreso pagado) y la deuda
-- (ingreso pendiente) quedan enlazados a su factura.
-- Idempotente: se puede volver a ejecutar sin problema.
-- ============================================================================

alter table public.transactions add column if not exists invoice_id uuid;

create index if not exists transactions_invoice_idx on public.transactions (invoice_id);

-- Sin clave foránea a propósito: la app sincroniza sin conexión y el orden de
-- subida no está garantizado. La app borra los cobros al borrar su factura.
