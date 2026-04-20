-- Founder pricing & status columns (WayForPay recurring)

alter table public.subscriptions
  add column if not exists is_founder boolean not null default false;

alter table public.subscriptions
  add column if not exists plan_price numeric not null default 5;

alter table public.subscriptions
  add column if not exists status text not null default 'pending_verify';

alter table public.subscriptions
  add column if not exists trial_end timestamptz;

alter table public.subscriptions
  add column if not exists next_billing_date timestamptz;

alter table public.subscriptions
  add column if not exists retry_count integer not null default 0;

alter table public.subscriptions
  add column if not exists suspended_at timestamptz;

alter table public.subscriptions
  add column if not exists plan text;

-- Backfill: existing rows → founders at $5/mo (launch lock)
update public.subscriptions
set
  is_founder = true,
  plan_price = 5,
  plan = coalesce(plan, 'founding')
where is_founder = false;

-- Sync status + billing dates from legacy phase columns
update public.subscriptions
set status = case
  when phase = 'pending_verify' then 'pending_verify'
  when phase = 'trial' then 'trialing'
  when phase in ('discounted', 'full') then 'active'
  when phase = 'cancelled' then 'canceled'
  else status
end;

update public.subscriptions
set
  trial_end = coalesce(trial_end, phase_ends_at),
  next_billing_date = coalesce(next_billing_date, phase_ends_at, trial_end)
where phase = 'trial' or status = 'trialing';

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (
    status in (
      'pending_verify',
      'trialing',
      'active',
      'past_due',
      'suspended',
      'canceled'
    )
  );

-- New user trigger: include status
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, client_email, phase, has_access, status)
  values (
    new.id,
    new.email,
    'pending_verify',
    false,
    'pending_verify'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Atomic claim for billing cron (returns row + previous next charge date)
create or replace function public.claim_due_subscriptions(p_limit int)
returns table (
  id uuid,
  user_id uuid,
  subscription_status text,
  previous_next_billing timestamptz,
  trial_end timestamptz,
  rec_token text,
  plan_price numeric,
  client_email text,
  client_phone text,
  retry_count int,
  is_founder boolean,
  consecutive_failed_charges int,
  phase text
)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select
      s.id,
      s.next_billing_date as previous_next_billing
    from public.subscriptions s
    where s.rec_token is not null
      and s.next_billing_date is not null
      and s.next_billing_date <= now()
      and s.status in ('trialing', 'active', 'past_due')
    order by s.next_billing_date
    for update skip locked
    limit p_limit
  ),
  upd as (
    update public.subscriptions s
    set next_billing_date = null,
        updated_at = now()
    from picked p
    where s.id = p.id
    returning s.id
  )
  select
    s.id,
    s.user_id,
    s.status as subscription_status,
    p.previous_next_billing,
    s.trial_end,
    s.rec_token,
    s.plan_price,
    s.client_email,
    s.client_phone,
    s.retry_count,
    s.is_founder,
    s.consecutive_failed_charges,
    s.phase
  from public.subscriptions s
  join picked p on p.id = s.id
  join upd u on u.id = s.id;
$$;

revoke all on function public.claim_due_subscriptions(int) from public;
grant execute on function public.claim_due_subscriptions(int) to service_role;
