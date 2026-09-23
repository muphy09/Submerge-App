-- A second independent app-session slot is reserved for master accounts using
-- the local development build. The existing table remains the production slot.
create table if not exists public.master_dev_app_sessions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text,
  device_label text,
  active_app_session_id text,
  active_lease_token text not null,
  claimed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.master_dev_app_sessions enable row level security;
revoke all on public.master_dev_app_sessions from anon;
revoke all on public.master_dev_app_sessions from authenticated;

comment on table public.master_dev_app_sessions is
  'Tracks one development app session for each master account, separate from its installed app session.';
