-- Subscriptions & payments for WayForPay (Ruta)
-- Apply via Supabase CLI or SQL editor.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,

  phase text not null default 'pending_verify'
    check (phase in ('pending_verify', 'trial', 'discounted', 'full', 'cancelled')),

  phase_ends_at timestamptz,

  verify_order_ref text unique,
  recurring_order_ref text unique,

  rec_token text,

  wfp_recurring_status text,

  current_amount numeric default 0,
  currency text default 'USD',

  client_phone text,
  client_email text,

  has_access boolean default false,
  access_expires_at timestamptz,

  consecutive_failed_charges int default 0,

  trial_verified_at timestamptz,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  order_reference text not null unique,
  amount numeric not null,
  currency text default 'USD',
  transaction_status text,
  auth_code text,
  card_pan text,
  card_type text,
  issuer_bank_name text,
  payment_system text,
  wfp_raw jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_subscriptions_phase_ends_at on public.subscriptions (phase_ends_at)
  where phase_ends_at is not null;

create or replace function public.set_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_subscriptions_updated_at();

create or replace function public.set_payments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_payments_updated_at();

-- New auth user → subscription row (pending card verify)
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, client_email, phase, has_access)
  values (
    new.id,
    new.email,
    'pending_verify',
    false
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

drop policy if exists "users read own subscription" on public.subscriptions;
create policy "users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "users read own payments" on public.payments;
create policy "users read own payments"
  on public.payments for select
  using (auth.uid() = user_id);

-- Phone before verify: only via RPC (no broad UPDATE on subscriptions for clients)
create or replace function public.set_subscription_client_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.subscriptions
  set client_phone = p_phone, updated_at = now()
  where user_id = auth.uid()
    and phase = 'pending_verify';
end;
$$;

grant execute on function public.set_subscription_client_phone(text) to authenticated;

-- Users created before this migration (no trigger row yet)
insert into public.subscriptions (user_id, client_email, phase, has_access)
select u.id, u.email, 'pending_verify', false
from auth.users u
where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
