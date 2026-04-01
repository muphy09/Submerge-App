create table if not exists public.ledger_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  franchise_id text,
  franchise_name text,
  actor_auth_user_id text,
  actor_profile_id text,
  actor_name text not null,
  actor_email text,
  actor_role text not null,
  effective_role text not null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_ledger_events_created_at on public.ledger_events (created_at desc);
create index if not exists idx_ledger_events_franchise_id on public.ledger_events (franchise_id);
create index if not exists idx_ledger_events_target_type on public.ledger_events (target_type);

alter table public.ledger_events enable row level security;

drop policy if exists "master can read ledger events" on public.ledger_events;
create policy "master can read ledger events"
on public.ledger_events
for select
to authenticated
using (
  exists (
    select 1
    from public.franchise_users fu
    where fu.auth_user_id = auth.uid()
      and lower(coalesce(fu.role, '')) = 'master'
      and coalesce(fu.is_active, true)
  )
);
