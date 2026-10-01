-- ============================================================================
-- Notificaciones push: tabla de suscripciones por dispositivo.
-- Idempotente: se puede volver a ejecutar sin problema.
-- ============================================================================

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_business_idx on public.push_subscriptions (business_id);

alter table public.push_subscriptions enable row level security;

-- Cada usuario gestiona SOLO sus propias suscripciones.
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- La Edge Function lee las suscripciones con la service role key (salta RLS),
-- así que no hace falta política para anónimos.
