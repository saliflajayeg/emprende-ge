-- ============================================================
--  EmprendeGE — Esquema Supabase (Postgres)
--  Ejecuta TODO este archivo en: Supabase → SQL Editor → New query → Run
--  Es seguro re-ejecutarlo (usa IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- ---------- Tablas ----------

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  owner_name text default '',
  sector text default '',
  currency text default 'XAF',
  phone text default '',
  address text default '',
  tax_rate numeric default 15,
  records_label text default 'Fichas',
  created_at timestamptz default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('admin','employee')),
  name text default '',
  created_at timestamptz default now(),
  unique (user_id)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  name text not null,
  color text default '#0d9488'
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null check (type in ('client','provider')),
  name text not null,
  phone text default '',
  email text default '',
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  date date not null,
  category_id uuid references categories(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  description text default '',
  amount numeric not null,
  payment_method text default '',
  status text not null default 'paid' check (status in ('paid','pending')),
  due_date date,
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  doc_type text not null default 'invoice',
  number text not null,
  contact_id uuid references contacts(id) on delete set null,
  client_name text default '',
  client_details text default '',
  date date not null,
  items jsonb not null default '[]',
  tax_rate numeric default 15,
  notes text default '',
  status text not null default 'pending',
  created_at timestamptz default now()
);

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text default '',
  name text not null,
  photo text,                 -- foto principal (dataURL JPEG)
  photos jsonb default '[]',  -- galería (array de dataURL)
  registered_at date,
  fields jsonb default '[]',
  archived boolean default false,
  created_at timestamptz default now()
);

create table if not exists record_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  date date not null,
  text text default '',
  photo text,
  created_at timestamptz default now()
);

create table if not exists invites (
  code text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  role text not null default 'employee',
  created_at timestamptz default now()
);

-- ---------- Función auxiliar (evita recursión en RLS) ----------

create or replace function my_business_id()
returns uuid language sql security definer stable set search_path = public as $$
  select business_id from members where user_id = auth.uid() limit 1;
$$;

create or replace function my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from members where user_id = auth.uid() limit 1;
$$;

-- ---------- Límite de 2 usuarios por empresa ----------

create or replace function check_member_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from members where business_id = new.business_id) >= 2 then
    raise exception 'La empresa ya tiene el máximo de 2 usuarios';
  end if;
  return new;
end; $$;

drop trigger if exists member_limit on members;
create trigger member_limit before insert on members
  for each row execute function check_member_limit();

-- ---------- RPC: crear empresa (al registrarse el admin) ----------

create or replace function create_business(biz_name text, owner text)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una empresa';
  end if;
  insert into businesses (name, owner_name) values (biz_name, owner) returning id into bid;
  insert into members (business_id, user_id, role, name) values (bid, auth.uid(), 'admin', owner);
  -- categorías por defecto
  insert into categories (business_id, kind, name, color) values
    (bid,'income','Ventas','#0d9488'),
    (bid,'income','Servicios','#0ea5e9'),
    (bid,'income','Otros ingresos','#8b5cf6'),
    (bid,'expense','Alquiler','#ef4444'),
    (bid,'expense','Proveedores / Compras','#f97316'),
    (bid,'expense','Inventario','#eab308'),
    (bid,'expense','Transporte','#84cc16'),
    (bid,'expense','Salarios','#ec4899'),
    (bid,'expense','Servicios (luz, agua)','#6366f1');
  return bid;
end; $$;

-- ---------- RPC: crear invitación (solo admin) ----------

create or replace function create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare c text; bid uuid;
begin
  select business_id into bid from members where user_id = auth.uid() and role = 'admin';
  if bid is null then raise exception 'Solo el administrador puede invitar'; end if;
  if (select count(*) from members where business_id = bid) >= 2 then
    raise exception 'La empresa ya tiene 2 usuarios';
  end if;
  delete from invites where business_id = bid; -- solo una invitación activa
  c := upper(substr(md5(random()::text), 1, 6));
  insert into invites (code, business_id, role) values (c, bid, 'employee');
  return c;
end; $$;

-- ---------- RPC: canjear invitación (el empleado se une) ----------

create or replace function redeem_invite(invite_code text, member_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid; r text;
begin
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una empresa';
  end if;
  select business_id, role into bid, r from invites where code = upper(invite_code);
  if bid is null then raise exception 'Código de invitación no válido'; end if;
  if (select count(*) from members where business_id = bid) >= 2 then
    raise exception 'La empresa ya tiene 2 usuarios';
  end if;
  insert into members (business_id, user_id, role, name) values (bid, auth.uid(), r, member_name);
  delete from invites where code = upper(invite_code);
  return bid;
end; $$;

-- ============================================================
--  Row Level Security
-- ============================================================

alter table businesses     enable row level security;
alter table members        enable row level security;
alter table categories     enable row level security;
alter table contacts       enable row level security;
alter table transactions   enable row level security;
alter table invoices       enable row level security;
alter table records        enable row level security;
alter table record_entries enable row level security;
alter table invites        enable row level security;

-- businesses: ver/editar la propia
drop policy if exists biz_sel on businesses;
create policy biz_sel on businesses for select using (id = my_business_id());
drop policy if exists biz_upd on businesses;
create policy biz_upd on businesses for update using (id = my_business_id());

-- members: ver los de mi empresa; el admin puede borrar (quitar empleado)
drop policy if exists mem_sel on members;
create policy mem_sel on members for select using (business_id = my_business_id());
drop policy if exists mem_del on members;
create policy mem_del on members for delete using (business_id = my_business_id() and my_role() = 'admin');

-- Macro-patrón para tablas de datos: acceso si es de mi empresa
-- categories
drop policy if exists cat_all on categories;
create policy cat_all on categories for all using (business_id = my_business_id()) with check (business_id = my_business_id());
-- contacts
drop policy if exists con_all on contacts;
create policy con_all on contacts for all using (business_id = my_business_id()) with check (business_id = my_business_id());
-- transactions
drop policy if exists tx_all on transactions;
create policy tx_all on transactions for all using (business_id = my_business_id()) with check (business_id = my_business_id());
-- invoices
drop policy if exists inv_all on invoices;
create policy inv_all on invoices for all using (business_id = my_business_id()) with check (business_id = my_business_id());
-- records
drop policy if exists rec_all on records;
create policy rec_all on records for all using (business_id = my_business_id()) with check (business_id = my_business_id());
-- record_entries
drop policy if exists ren_all on record_entries;
create policy ren_all on record_entries for all using (business_id = my_business_id()) with check (business_id = my_business_id());

-- invites: el admin gestiona las de su empresa (el canje va por RPC security definer)
drop policy if exists invite_admin on invites;
create policy invite_admin on invites for all using (business_id = my_business_id() and my_role() = 'admin') with check (business_id = my_business_id());

-- ---------- Realtime (para que admin y empleado vean cambios en vivo) ----------
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table records;
alter publication supabase_realtime add table record_entries;
alter publication supabase_realtime add table contacts;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table members;

-- ============================================================
--  FIN. Deberías ver "Success. No rows returned".
-- ============================================================
