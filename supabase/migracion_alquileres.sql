-- ============================================================
--  Migración: módulo de ALQUILERES / INMOBILIARIA
--  Ejecuta este bloque una sola vez en el SQL Editor de Supabase.
-- ============================================================

-- Unidades de alquiler (apartamentos, habitaciones, locales)
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null default '', type text default 'apartment',
  rent numeric default 0, tenant_name text default '', tenant_phone text default '',
  deposit numeric, status text not null default 'occupied',
  notes text default '', created_at timestamptz default now()
);

-- Frecuencia de pago de la unidad (mensual, bimensual, trimestral, semestral, anual)
alter table units add column if not exists frequency text default 'monthly';

-- Los pagos de alquiler = transacciones (ingresos) etiquetadas con unidad y periodo
alter table transactions add column if not exists unit_id uuid references units(id) on delete set null;
alter table transactions add column if not exists period text;

-- Seguridad (RLS): miembros del negocio gestionan; el admin puede leer
alter table units enable row level security;
drop policy if exists units_member on units;
create policy units_member on units for all using (is_member(business_id)) with check (is_member(business_id));
drop policy if exists units_admin on units;
create policy units_admin on units for select using (is_admin());

-- Tiempo real
do $$ begin
  begin alter publication supabase_realtime add table units; exception when duplicate_object then null; end;
end $$;
