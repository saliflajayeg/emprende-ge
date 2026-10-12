-- ============================================================================
-- Facturas antiguas del talonario: se registran a posteriori, con foto de la
-- hoja (opcional) o solo con el total.
-- Idempotente: se puede volver a ejecutar sin problema.
-- ============================================================================

alter table public.invoices add column if not exists origin text default 'app';
alter table public.invoices add column if not exists photo text;
