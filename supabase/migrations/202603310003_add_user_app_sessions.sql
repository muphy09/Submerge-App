create table if not exists public.user_app_sessions (
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

create index if not exists idx_user_app_sessions_last_seen_at
  on public.user_app_sessions(last_seen_at desc);

alter table public.user_app_sessions enable row level security;

revoke all on public.user_app_sessions from anon;
revoke all on public.user_app_sessions from authenticated;

comment on table public.user_app_sessions is
  'Tracks the currently active Submerge desktop app session for each authenticated user.';
