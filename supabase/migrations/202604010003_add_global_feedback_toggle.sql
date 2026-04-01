create table if not exists public.feedback_settings (
  singleton_key boolean primary key default true check (singleton_key),
  feedback_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.feedback_settings (
  singleton_key,
  feedback_enabled
)
values (
  true,
  true
)
on conflict (singleton_key) do nothing;

alter table public.feedback_settings enable row level security;

revoke all on public.feedback_settings from anon;
revoke insert, update, delete on public.feedback_settings from authenticated;
grant select on public.feedback_settings to authenticated;

drop policy if exists "authenticated can read feedback settings" on public.feedback_settings;
create policy "authenticated can read feedback settings"
on public.feedback_settings
for select
to authenticated
using (true);

create or replace function public.set_global_feedback_enabled(
  p_feedback_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile record;
  v_actor_name text;
begin
  if v_auth_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select id, role, is_active, name, email
  into v_profile
  from public.franchise_users
  where auth_user_id = v_auth_user_id
  limit 1;

  if not found or coalesce(v_profile.is_active, true) is false or lower(coalesce(v_profile.role, '')) <> 'master' then
    raise exception 'Forbidden.';
  end if;

  v_actor_name := nullif(trim(coalesce(v_profile.name, '')), '');
  if v_actor_name is null then
    v_actor_name := nullif(trim(coalesce(v_profile.email, '')), '');
  end if;
  if v_actor_name is null then
    v_actor_name := 'Master';
  end if;

  insert into public.feedback_settings (
    singleton_key,
    feedback_enabled,
    updated_at,
    updated_by
  )
  values (
    true,
    coalesce(p_feedback_enabled, true),
    timezone('utc', now()),
    v_actor_name
  )
  on conflict (singleton_key) do update
  set
    feedback_enabled = excluded.feedback_enabled,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return coalesce(p_feedback_enabled, true);
end;
$$;

create or replace function public.submit_franchise_feedback(
  p_franchise_id text,
  p_message text,
  p_app_version text default null,
  p_effective_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile record;
  v_feedback_id uuid;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_submitter_name text;
  v_submitter_role text;
  v_effective_role text;
  v_feedback_enabled boolean := true;
begin
  if v_auth_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select id, franchise_id, role, is_active, name, email
  into v_profile
  from public.franchise_users
  where auth_user_id = v_auth_user_id
  limit 1;

  if not found or coalesce(v_profile.is_active, true) is false then
    raise exception 'Forbidden.';
  end if;

  v_submitter_role := lower(trim(coalesce(v_profile.role, '')));
  if v_submitter_role not in ('master', 'owner', 'admin', 'designer') then
    raise exception 'Forbidden.';
  end if;

  select feedback_enabled
  into v_feedback_enabled
  from public.feedback_settings
  where singleton_key = true
  limit 1;

  if coalesce(v_feedback_enabled, true) is false then
    raise exception 'Global feedback is currently turned off.';
  end if;

  if p_franchise_id is null then
    raise exception 'Franchise is required.';
  end if;

  if v_submitter_role <> 'master' and v_profile.franchise_id is distinct from p_franchise_id then
    raise exception 'Cannot submit feedback for another franchise.';
  end if;

  if v_message is null then
    raise exception 'Feedback message is required.';
  end if;

  if char_length(v_message) > 4000 then
    raise exception 'Feedback message is too long.';
  end if;

  v_effective_role := lower(trim(coalesce(p_effective_role, '')));
  if v_effective_role = '' or v_effective_role not in ('master', 'owner', 'admin', 'designer') then
    v_effective_role := v_submitter_role;
  end if;

  v_submitter_name := nullif(trim(coalesce(v_profile.name, '')), '');
  if v_submitter_name is null then
    v_submitter_name := nullif(trim(coalesce(v_profile.email, '')), '');
  end if;
  if v_submitter_name is null then
    v_submitter_name := 'Unknown User';
  end if;

  insert into public.franchise_feedback (
    franchise_id,
    franchise_name,
    submitter_auth_user_id,
    submitter_profile_id,
    submitter_name,
    submitter_email,
    submitter_role,
    effective_role,
    app_version,
    message
  )
  select
    f.id,
    f.name,
    v_auth_user_id,
    v_profile.id::text,
    v_submitter_name,
    nullif(trim(coalesce(v_profile.email, '')), ''),
    v_submitter_role,
    v_effective_role,
    nullif(trim(coalesce(p_app_version, '')), ''),
    v_message
  from public.franchises f
  where f.id = p_franchise_id
  returning id into v_feedback_id;

  if v_feedback_id is null then
    raise exception 'Franchise not found.';
  end if;

  return v_feedback_id;
end;
$$;

revoke all on function public.set_global_feedback_enabled(boolean) from public;
grant execute on function public.set_global_feedback_enabled(boolean) to authenticated;
