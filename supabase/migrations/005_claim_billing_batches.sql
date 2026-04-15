-- Atomic claim for billing cron: one statement UPDATE ... RETURNING (no SELECT-then-UPDATE race).
-- FOR UPDATE SKIP LOCKED lets multiple workers process different rows without double-charging.

create or replace function public.claim_trial_billing_batch(p_limit int)
returns table (
  id uuid,
  user_id uuid,
  phase text,
  phase_ends_at timestamptz,
  rec_token text,
  client_email text,
  client_phone text,
  trial_verified_at timestamptz,
  created_at timestamptz,
  consecutive_failed_charges int,
  previous_phase_ends_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select
      s.id,
      s.phase_ends_at as previous_phase_ends_at
    from public.subscriptions s
    where s.phase = 'trial'
      and s.rec_token is not null
      and s.phase_ends_at is not null
      and s.phase_ends_at <= now()
    order by s.phase_ends_at
    for update skip locked
    limit p_limit
  ),
  upd as (
    update public.subscriptions s
    set phase_ends_at = null
    from picked p
    where s.id = p.id
    returning s.*
  )
  select
    u.id,
    u.user_id,
    u.phase,
    u.phase_ends_at,
    u.rec_token,
    u.client_email,
    u.client_phone,
    u.trial_verified_at,
    u.created_at,
    u.consecutive_failed_charges,
    p.previous_phase_ends_at
  from upd u
  join picked p on p.id = u.id;
$$;

create or replace function public.claim_discounted_price_change_batch(p_limit int)
returns table (
  id uuid,
  phase text,
  phase_ends_at timestamptz,
  recurring_order_ref text,
  previous_phase_ends_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select
      s.id,
      s.phase_ends_at as previous_phase_ends_at
    from public.subscriptions s
    where s.phase = 'discounted'
      and s.recurring_order_ref is not null
      and s.phase_ends_at is not null
      and s.phase_ends_at <= now()
    order by s.phase_ends_at
    for update skip locked
    limit p_limit
  ),
  upd as (
    update public.subscriptions s
    set phase_ends_at = null
    from picked p
    where s.id = p.id
    returning s.*
  )
  select
    u.id,
    u.phase,
    u.phase_ends_at,
    u.recurring_order_ref,
    p.previous_phase_ends_at
  from upd u
  join picked p on p.id = u.id;
$$;

revoke all on function public.claim_trial_billing_batch(int) from public;
revoke all on function public.claim_discounted_price_change_batch(int) from public;
grant execute on function public.claim_trial_billing_batch(int) to service_role;
grant execute on function public.claim_discounted_price_change_batch(int) to service_role;
