alter table public.franchise_users
  add column if not exists current_app_version text;

alter table public.franchise_users
  add column if not exists current_app_version_reported_at timestamptz;

comment on column public.franchise_users.current_app_version is
  'Last app version reported by the authenticated user after launching an installed update.';

comment on column public.franchise_users.current_app_version_reported_at is
  'UTC timestamp when the user last reported their current installed app version.';

create or replace function public.report_current_user_app_version(p_app_version text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile public.franchise_users%rowtype;
  v_app_version text := nullif(trim(coalesce(p_app_version, '')), '');
begin
  if v_auth_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  if v_app_version is null then
    return false;
  end if;

  if left(lower(v_app_version), 1) = 'v' and substring(v_app_version from 2) ~ '^[0-9]' then
    v_app_version := substring(v_app_version from 2);
  end if;

  select *
  into v_profile
  from public.franchise_users
  where auth_user_id = v_auth_user_id;

  if not found or coalesce(v_profile.is_active, true) is false then
    raise exception 'No active franchise profile found.';
  end if;

  update public.franchise_users
  set current_app_version = v_app_version,
      current_app_version_reported_at = timezone('utc', now())
  where auth_user_id = v_auth_user_id
    and (
      current_app_version is distinct from v_app_version
      or current_app_version_reported_at is null
    );

  return found;
end;
$$;

grant execute on function public.report_current_user_app_version(text) to authenticated;

comment on function public.report_current_user_app_version(text) is
  'Stores the current installed Submerge app version for the authenticated franchise user.';
