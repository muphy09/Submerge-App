create table if not exists public.franchise_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  franchise_id text not null references public.franchises(id) on delete cascade,
  franchise_name text,
  submitter_auth_user_id uuid not null references auth.users(id) on delete cascade,
  submitter_profile_id text,
  submitter_name text not null,
  submitter_email text,
  submitter_role text not null,
  effective_role text not null,
  app_version text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'resolved', 'archived')),
  resolution_message text,
  resolved_at timestamptz,
  resolved_by_name text,
  resolved_by_email text,
  response_read_at timestamptz,
  archived_at timestamptz,
  archived_by_name text,
  archived_by_email text
);

create index if not exists idx_franchise_feedback_status_created_at
  on public.franchise_feedback (status, created_at desc);

create index if not exists idx_franchise_feedback_franchise_status_created_at
  on public.franchise_feedback (franchise_id, status, created_at desc);

create index if not exists idx_franchise_feedback_submitter_status
  on public.franchise_feedback (submitter_auth_user_id, status, response_read_at);

alter table public.franchise_feedback enable row level security;

revoke all on public.franchise_feedback from anon;
revoke insert, update, delete on public.franchise_feedback from authenticated;
grant select on public.franchise_feedback to authenticated;

drop policy if exists "master can read feedback" on public.franchise_feedback;
create policy "master can read feedback"
on public.franchise_feedback
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

drop policy if exists "submitters can read own feedback" on public.franchise_feedback;
create policy "submitters can read own feedback"
on public.franchise_feedback
for select
to authenticated
using (submitter_auth_user_id = auth.uid());

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

create or replace function public.resolve_franchise_feedback(
  p_feedback_id uuid,
  p_resolution_message text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile record;
  v_feedback record;
  v_resolution_message text := nullif(trim(coalesce(p_resolution_message, '')), '');
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

  if p_feedback_id is null then
    raise exception 'Feedback item is required.';
  end if;

  if v_resolution_message is null then
    raise exception 'Resolution message is required.';
  end if;

  if char_length(v_resolution_message) > 4000 then
    raise exception 'Resolution message is too long.';
  end if;

  select id, status
  into v_feedback
  from public.franchise_feedback
  where id = p_feedback_id
  limit 1;

  if not found then
    raise exception 'Feedback item not found.';
  end if;

  if coalesce(v_feedback.status, '') = 'resolved' then
    raise exception 'Feedback item is already resolved.';
  end if;

  v_actor_name := nullif(trim(coalesce(v_profile.name, '')), '');
  if v_actor_name is null then
    v_actor_name := nullif(trim(coalesce(v_profile.email, '')), '');
  end if;
  if v_actor_name is null then
    v_actor_name := 'Master';
  end if;

  update public.franchise_feedback
  set
    status = 'resolved',
    resolution_message = v_resolution_message,
    resolved_at = timezone('utc', now()),
    resolved_by_name = v_actor_name,
    resolved_by_email = nullif(trim(coalesce(v_profile.email, '')), ''),
    response_read_at = null,
    archived_at = null,
    archived_by_name = null,
    archived_by_email = null,
    updated_at = timezone('utc', now())
  where id = p_feedback_id;

  return true;
end;
$$;

create or replace function public.archive_franchise_feedback(
  p_feedback_id uuid
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

  if p_feedback_id is null then
    raise exception 'Feedback item is required.';
  end if;

  v_actor_name := nullif(trim(coalesce(v_profile.name, '')), '');
  if v_actor_name is null then
    v_actor_name := nullif(trim(coalesce(v_profile.email, '')), '');
  end if;
  if v_actor_name is null then
    v_actor_name := 'Master';
  end if;

  update public.franchise_feedback
  set
    status = 'archived',
    archived_at = timezone('utc', now()),
    archived_by_name = v_actor_name,
    archived_by_email = nullif(trim(coalesce(v_profile.email, '')), ''),
    updated_at = timezone('utc', now())
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback item not found.';
  end if;

  return true;
end;
$$;

create or replace function public.delete_franchise_feedback(
  p_feedback_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile record;
begin
  if v_auth_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select id, role, is_active
  into v_profile
  from public.franchise_users
  where auth_user_id = v_auth_user_id
  limit 1;

  if not found or coalesce(v_profile.is_active, true) is false or lower(coalesce(v_profile.role, '')) <> 'master' then
    raise exception 'Forbidden.';
  end if;

  if p_feedback_id is null then
    raise exception 'Feedback item is required.';
  end if;

  delete from public.franchise_feedback
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback item not found.';
  end if;

  return true;
end;
$$;

create or replace function public.acknowledge_franchise_feedback(
  p_feedback_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile record;
begin
  if v_auth_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select id, role, is_active
  into v_profile
  from public.franchise_users
  where auth_user_id = v_auth_user_id
  limit 1;

  if not found or coalesce(v_profile.is_active, true) is false then
    raise exception 'Forbidden.';
  end if;

  if p_feedback_id is null then
    raise exception 'Feedback item is required.';
  end if;

  update public.franchise_feedback
  set
    response_read_at = coalesce(response_read_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = p_feedback_id
    and submitter_auth_user_id = v_auth_user_id
    and status = 'resolved';

  if not found then
    raise exception 'Feedback response not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.submit_franchise_feedback(text, text, text, text) from public;
revoke all on function public.resolve_franchise_feedback(uuid, text) from public;
revoke all on function public.archive_franchise_feedback(uuid) from public;
revoke all on function public.delete_franchise_feedback(uuid) from public;
revoke all on function public.acknowledge_franchise_feedback(uuid) from public;

grant execute on function public.submit_franchise_feedback(text, text, text, text) to authenticated;
grant execute on function public.resolve_franchise_feedback(uuid, text) to authenticated;
grant execute on function public.archive_franchise_feedback(uuid) to authenticated;
grant execute on function public.delete_franchise_feedback(uuid) to authenticated;
grant execute on function public.acknowledge_franchise_feedback(uuid) to authenticated;
