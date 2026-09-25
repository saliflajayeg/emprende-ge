-- ============================================================
--  Reservas / pedidos públicos: enlace compartible del negocio
--  Ejecuta este bloque en el SQL Editor de Supabase.
--  Es seguro re-ejecutarlo (idempotente).
-- ============================================================

-- Columnas para distinguir solicitudes públicas pendientes de aprobación
alter table appointments add column if not exists approved boolean default true;
alter table appointments add column if not exists source text default 'manual';
alter table appointments add column if not exists client_phone text;

-- Info PÚBLICA mínima de un negocio + sus SERVICIOS y PRODUCTOS (para el enlace).
-- SECURITY DEFINER: expone solo nombre, logo, moneda y catálogo; nada privado.
create or replace function public_business(p_business uuid)
returns json language sql security definer stable set search_path = public as $$
  select json_build_object(
    'id', b.id,
    'name', b.name,
    'logo', b.logo,
    'currency', b.currency,
    'services', coalesce((
      select json_agg(json_build_object('name', i.name, 'price', i.price) order by i.name)
      from items i where i.business_id = b.id and i.kind = 'service'
    ), '[]'::json),
    'products', coalesce((
      select json_agg(json_build_object('name', i.name, 'price', i.price) order by i.name)
      from items i where i.business_id = b.id and i.kind = 'product'
    ), '[]'::json)
  )
  from businesses b where b.id = p_business;
$$;

-- Solicitar una CITA o un PEDIDO desde el enlace público. Queda pendiente de aprobación.
drop function if exists request_appointment(uuid, text, date, text, text, text, text);
create or replace function request_appointment(
  p_business uuid, p_service text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_notes text default '', p_price numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid; v_price numeric;
begin
  if p_business is null or not exists (select 1 from businesses where id = p_business) then
    raise exception 'Negocio no válido';
  end if;
  if coalesce(trim(p_client_name), '') = '' and coalesce(trim(p_client_phone), '') = '' then
    raise exception 'Indica tu nombre o tu teléfono';
  end if;
  if p_date is null or p_date < current_date then
    raise exception 'Elige una fecha válida';
  end if;
  v_price := coalesce(
    p_price,
    (select price from items where business_id = p_business and kind = 'service' and name = p_service limit 1),
    0
  );
  insert into appointments
    (business_id, date, time, client_name, client_phone, service, price, status, notes, approved, source)
  values
    (p_business, p_date, coalesce(p_time, ''), coalesce(p_client_name, ''), coalesce(p_client_phone, ''),
     coalesce(p_service, ''), v_price, 'pending', coalesce(p_notes, ''), false, 'public')
  returning id into aid;
  return aid;
end; $$;

grant execute on function public_business(uuid) to anon, authenticated;
grant execute on function request_appointment(uuid, text, date, text, text, text, text, numeric) to anon, authenticated;
