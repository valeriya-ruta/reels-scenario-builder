-- Client-side error logging for the carousel builder and other features.
-- The frontend tries to write here when a generation fails so we can correlate
-- errors with the user's request context (slide type, project, etc.).

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  timestamp timestamptz not null default now(),
  error_message text not null,
  error_stack text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_user_id_idx on public.error_logs(user_id);
create index if not exists error_logs_timestamp_idx on public.error_logs(timestamp desc);
create index if not exists error_logs_context_target_idx on public.error_logs((context->>'target'));

alter table public.error_logs enable row level security;

drop policy if exists "users can insert their own error logs" on public.error_logs;
create policy "users can insert their own error logs"
  on public.error_logs for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "users can read their own error logs" on public.error_logs;
create policy "users can read their own error logs"
  on public.error_logs for select
  to authenticated
  using (user_id = auth.uid());
