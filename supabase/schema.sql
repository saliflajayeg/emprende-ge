-- ============================================================
--  GEmprende — Esquema Supabase v2 (multi-negocio + admin)
--  Ejecuta TODO en: Supabase → SQL Editor → New query → Run
--  ⚠️ Borra y recrea las tablas de GEmprende. Hazlo solo si NO hay
--  datos reales todavía (aún no habíamos conectado el frontend).
-- ============================================================

-- ---------- Limpieza (idempotente) ----------
drop table if exists record_entries cascade;
drop table if exists records cascade;
drop table if exists appointments cascade;
drop table if exists jobs cascade;
drop table if exists employees cascade;
drop table if exists items cascade;
drop table if exists invoices cascade;
drop table if exists transactions cascade;
drop table if exists contacts cascade;
drop table if exists categories cascade;
drop table if exists invites cascade;
drop table if exists members cascade;
drop table if exists businesses cascade;
drop table if exists admins cascade;

-- ---------- Negocios y miembros ----------

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  owner_name text default '',
  sector text default '',
  business_type text default 'other',
  enabled_modules text[] default null,
  currency text default 'XAF',
  phone text default '',
  address text default '',
  tax_rate numeric default 15,
  records_label text default 'Fichas',
  logo text,
  created_at timestamptz default now()
);

-- Para bases ya creadas antes de añadir el logo:
alter table businesses add column if not exists logo text;

-- Un usuario puede pertenecer a VARIOS negocios; máx. 2 personas por negocio.
create table members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('owner','employee')),
  name text default '',
  created_at timestamptz default now(),
  unique (business_id, user_id)
);

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table invites (
  code text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  role text not null default 'employee',
  created_at timestamptz default now()
);

-- ---------- Tablas de datos (todas con business_id) ----------

create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  name text not null, color text default '#0d9488'
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null check (type in ('client','provider')),
  name text not null, phone text default '', email text default '', notes text default '',
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  date date not null,
  category_id uuid references categories(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  description text default '', amount numeric not null, payment_method text default '',
  status text not null default 'paid' check (status in ('paid','pending')),
  due_date date, created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  doc_type text not null default 'invoice', number text not null,
  contact_id uuid references contacts(id) on delete set null,
  client_name text default '', client_details text default '', date date not null,
  items jsonb not null default '[]', tax_rate numeric default 15, notes text default '',
  status text not null default 'pending', created_at timestamptz default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('service','product','ingredient')),
  name text not null, price numeric default 0, category text default '', unit text default '',
  track_stock boolean default false, stock numeric default 0, low_stock numeric default 0,
  notes text default '', created_at timestamptz default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  date date not null, time text default '', client_id uuid references contacts(id) on delete set null,
  client_name text default '', service text default '', price numeric default 0,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  notes text default '', created_at timestamptz default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null, client_id uuid references contacts(id) on delete set null,
  client_name text default '',
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  due_date date, notes text default '', created_at timestamptz default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, role text default '', phone text default '', salary numeric,
  notes text default '', created_at timestamptz default now()
);

create table records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text default '', name text not null, photo text, photos jsonb default '[]',
  registered_at date, fields jsonb default '[]', archived boolean default false,
  created_at timestamptz default now()
);

create table record_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  date date not null, text text default '', photo text, created_at timestamptz default now()
);

-- ---------- Funciones auxiliares (SECURITY DEFINER, sin recursión) ----------

create or replace function is_member(bid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from members where business_id = bid and user_id = auth.uid());
$$;

create or replace function is_owner(bid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from members where business_id = bid and user_id = auth.uid() and role = 'owner');
$$;

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- Límite de 2 personas por negocio
create or replace function check_member_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from members where business_id = new.business_id) >= 2 then
    raise exception 'El negocio ya tiene el máximo de 2 personas';
  end if;
  return new;
end; $$;
drop trigger if exists member_limit on members;
create trigger member_limit before insert on members for each row execute function check_member_limit();

-- ---------- RPCs ----------

-- Crear un negocio (el usuario puede tener varios). Devuelve el id.
create or replace function create_business(
  p_name text, p_owner text, p_type text, p_modules text[], p_currency text, p_tax numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  insert into businesses (owner_id, name, owner_name, business_type, sector, enabled_modules, currency, tax_rate)
  values (auth.uid(), p_name, p_owner, coalesce(p_type,'other'), '', p_modules, coalesce(p_currency,'XAF'), coalesce(p_tax,15))
  returning id into bid;
  insert into members (business_id, user_id, role, name) values (bid, auth.uid(), 'owner', p_owner);
  insert into categories (business_id, kind, name, color) values
    (bid,'income','Ventas','#0d9488'),(bid,'income','Servicios','#0ea5e9'),(bid,'income','Otros ingresos','#8b5cf6'),
    (bid,'expense','Alquiler','#ef4444'),(bid,'expense','Proveedores / Compras','#f97316'),(bid,'expense','Inventario','#eab308'),
    (bid,'expense','Transporte','#84cc16'),(bid,'expense','Salarios','#ec4899'),(bid,'expense','Servicios (luz, agua)','#6366f1');
  return bid;
end; $$;

-- Crear invitación de empleado para un negocio del que soy dueño
create or replace function create_invite(p_business uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_owner(p_business) then raise exception 'Solo el dueño puede invitar'; end if;
  if (select count(*) from members where business_id = p_business) >= 2 then
    raise exception 'El negocio ya tiene 2 personas'; end if;
  delete from invites where business_id = p_business;
  c := upper(substr(md5(random()::text), 1, 6));
  insert into invites (code, business_id, role) values (c, p_business, 'employee');
  return c;
end; $$;

-- Canjear invitación (unirse como empleado)
create or replace function redeem_invite(invite_code text, member_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  select business_id into bid from invites where code = upper(invite_code);
  if bid is null then raise exception 'Código no válido'; end if;
  if exists (select 1 from members where business_id = bid and user_id = auth.uid()) then
    raise exception 'Ya perteneces a este negocio'; end if;
  if (select count(*) from members where business_id = bid) >= 2 then
    raise exception 'El negocio ya tiene 2 personas'; end if;
  insert into members (business_id, user_id, role, name) values (bid, auth.uid(), 'employee', member_name);
  delete from invites where code = upper(invite_code);
  return bid;
end; $$;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table businesses     enable row level security;
alter table members        enable row level security;
alter table admins         enable row level security;
alter table invites        enable row level security;
alter table categories     enable row level security;
alter table contacts       enable row level security;
alter table transactions   enable row level security;
alter table invoices       enable row level security;
alter table items          enable row level security;
alter table appointments   enable row level security;
alter table jobs           enable row level security;
alter table employees      enable row level security;
alter table records        enable row level security;
alter table record_entries enable row level security;

-- businesses
drop policy if exists biz_sel on businesses;
create policy biz_sel on businesses for select using (is_member(id) or is_admin());
drop policy if exists biz_upd on businesses;
create policy biz_upd on businesses for update using (is_member(id));
drop policy if exists biz_del on businesses;
create policy biz_del on businesses for delete using (is_owner(id));

-- members
drop policy if exists mem_sel on members;
create policy mem_sel on members for select using (is_member(business_id) or is_admin());
drop policy if exists mem_del on members;
create policy mem_del on members for delete using (is_owner(business_id));

-- admins: solo lectura de la propia fila (para saber si soy admin)
drop policy if exists adm_sel on admins;
create policy adm_sel on admins for select using (user_id = auth.uid());

-- invites: el dueño gestiona (el canje va por RPC)
drop policy if exists inv_admin on invites;
create policy inv_admin on invites for all using (is_owner(business_id)) with check (is_owner(business_id));

-- Tablas de datos: acceso si soy miembro; admin puede LEER todo
do $$
declare t text;
begin
  foreach t in array array['categories','contacts','transactions','invoices','items','appointments','jobs','employees','records','record_entries']
  loop
    execute format('drop policy if exists %I_member on %I', t, t);
    execute format('create policy %I_member on %I for all using (is_member(business_id)) with check (is_member(business_id))', t, t);
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for select using (is_admin())', t, t);
  end loop;
end $$;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['transactions','invoices','items','appointments','jobs','employees','records','record_entries','contacts','categories','members','businesses']
  loop
    execute format('alter publication supabase_realtime add table %I', t);
  end loop;
exception when others then null; -- ignora si ya están añadidas
end $$;

-- ============================================================
--  FIN. Deberías ver "Success. No rows returned".
--  Para hacerte ADMIN: entra en Table Editor → admins → Insert,
--  y pon tu user_id (lo ves en Authentication → Users tras registrarte).
-- ============================================================
