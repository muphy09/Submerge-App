-- Protect Owner-only franchise settings and stop exposing the Admin Panel PIN.
-- No franchise or branding rows are deleted.

begin;

create or replace function public.current_user_is_owner_for_franchise(target_franchise_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_master() or exists (
    select 1
    from public.franchise_users profile
    where profile.auth_user_id = auth.uid()
      and profile.franchise_id = target_franchise_id
      and lower(profile.role) = 'owner'
      and coalesce(profile.is_active, true) = true
  );
$$;

create or replace function public.get_franchise_admin_panel_pin(p_franchise_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  if not public.current_user_is_owner_for_franchise(p_franchise_id) then
    raise exception 'Only a franchise owner or master can view this setting.' using errcode = '42501';
  end if;

  select nullif(regexp_replace(coalesce(branding.admin_panel_pin, ''), '\D', '', 'g'), '')
  into v_pin
  from public.franchise_branding branding
  where branding.franchise_id = p_franchise_id;

  return coalesce(v_pin, '2026');
end;
$$;

create or replace function public.verify_franchise_admin_panel_pin(
  p_franchise_id text,
  p_pin text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_expected_pin text;
  v_candidate_pin text;
begin
  if not public.current_user_can_manage_franchise(p_franchise_id) then
    raise exception 'Only a franchise owner, admin, or master can access the Admin Panel.' using errcode = '42501';
  end if;

  v_candidate_pin := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  if length(v_candidate_pin) <> 4 then
    return false;
  end if;

  select nullif(regexp_replace(coalesce(branding.admin_panel_pin, ''), '\D', '', 'g'), '')
  into v_expected_pin
  from public.franchise_branding branding
  where branding.franchise_id = p_franchise_id;

  return v_candidate_pin = coalesce(v_expected_pin, '2026');
end;
$$;

create or replace function public.save_franchise_branding_owner_settings(
  p_franchise_id text,
  p_changes jsonb,
  p_updated_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := coalesce(p_changes, '{}'::jsonb);
  v_pin text;
begin
  if not public.current_user_is_owner_for_franchise(p_franchise_id) then
    raise exception 'Only a franchise owner or master can change Admin Settings.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_changes) as keys(key_name)
    where key_name not in ('logoUrl', 'appName', 'adminPanelPin', 'disableSignedWorkflow')
  ) then
    raise exception 'Unsupported franchise branding setting.' using errcode = '22023';
  end if;

  if v_changes ? 'adminPanelPin' and jsonb_typeof(v_changes -> 'adminPanelPin') <> 'null' then
    v_pin := regexp_replace(coalesce(v_changes ->> 'adminPanelPin', ''), '\D', '', 'g');
    if v_pin <> coalesce(v_changes ->> 'adminPanelPin', '') or length(v_pin) <> 4 then
      raise exception 'Admin Panel PIN must be exactly four digits.' using errcode = '22023';
    end if;
  end if;

  insert into public.franchise_branding (
    franchise_id,
    logo_url,
    app_name,
    admin_panel_pin,
    disable_signed_workflow,
    updated_at,
    updated_by
  ) values (
    p_franchise_id,
    case when v_changes ? 'logoUrl' then nullif(v_changes ->> 'logoUrl', '') else null end,
    case when v_changes ? 'appName' then nullif(v_changes ->> 'appName', '') else null end,
    case when v_changes ? 'adminPanelPin' then nullif(v_changes ->> 'adminPanelPin', '') else null end,
    case when v_changes ? 'disableSignedWorkflow'
      then coalesce((v_changes ->> 'disableSignedWorkflow')::boolean, false)
      else false
    end,
    now(),
    p_updated_by
  )
  on conflict (franchise_id) do update
  set logo_url = case when v_changes ? 'logoUrl' then excluded.logo_url else franchise_branding.logo_url end,
      app_name = case when v_changes ? 'appName' then excluded.app_name else franchise_branding.app_name end,
      admin_panel_pin = case when v_changes ? 'adminPanelPin' then excluded.admin_panel_pin else franchise_branding.admin_panel_pin end,
      disable_signed_workflow = case
        when v_changes ? 'disableSignedWorkflow' then excluded.disable_signed_workflow
        else franchise_branding.disable_signed_workflow
      end,
      updated_at = now(),
      updated_by = p_updated_by;
end;
$$;

create or replace function public.save_franchise_code_owner_setting(
  p_franchise_id text,
  p_franchise_code text,
  p_franchise_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_franchise_code, '')));
begin
  if not public.current_user_is_owner_for_franchise(p_franchise_id) then
    raise exception 'Only a franchise owner or master can change franchise identity settings.' using errcode = '42501';
  end if;
  if v_code = '' then
    raise exception 'Franchise code is required.' using errcode = '22023';
  end if;

  update public.franchises
  set franchise_code = v_code,
      name = coalesce(nullif(trim(coalesce(p_franchise_name, '')), ''), name),
      updated_at = now()
  where id = p_franchise_id;

  if not found then
    raise exception 'Franchise not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.current_user_is_owner_for_franchise(text) from public, anon;
revoke all on function public.get_franchise_admin_panel_pin(text) from public, anon;
revoke all on function public.verify_franchise_admin_panel_pin(text, text) from public, anon;
revoke all on function public.save_franchise_branding_owner_settings(text, jsonb, text) from public, anon;
revoke all on function public.save_franchise_code_owner_setting(text, text, text) from public, anon;
grant execute on function public.current_user_is_owner_for_franchise(text) to authenticated;
grant execute on function public.get_franchise_admin_panel_pin(text) to authenticated;
grant execute on function public.verify_franchise_admin_panel_pin(text, text) to authenticated;
grant execute on function public.save_franchise_branding_owner_settings(text, jsonb, text) to authenticated;
grant execute on function public.save_franchise_code_owner_setting(text, text, text) to authenticated;

alter table public.franchise_branding enable row level security;

drop policy if exists "branding_insert" on public.franchise_branding;
drop policy if exists "branding_select" on public.franchise_branding;
drop policy if exists "branding_update" on public.franchise_branding;
drop policy if exists "franchise_branding_insert" on public.franchise_branding;
drop policy if exists "franchise_branding_read" on public.franchise_branding;
drop policy if exists "franchise_branding_update" on public.franchise_branding;

revoke all privileges on public.franchise_branding from public, anon, authenticated;
grant select (
  franchise_id,
  logo_url,
  app_name,
  disable_signed_workflow,
  updated_at,
  updated_by
) on public.franchise_branding to authenticated;

create policy "franchise_branding_member_select"
  on public.franchise_branding for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

alter table public.franchises enable row level security;

drop policy if exists "admins can insert franchise" on public.franchises;
drop policy if exists "admins can update franchise code" on public.franchises;
drop policy if exists "franchises_admin_manage" on public.franchises;
drop policy if exists "franchises_insert" on public.franchises;
drop policy if exists "franchises_read_own" on public.franchises;
drop policy if exists "franchises_select" on public.franchises;
drop policy if exists "franchises_update" on public.franchises;

revoke all privileges on public.franchises from public, anon, authenticated;
grant select on public.franchises to authenticated;

create policy "franchise_member_select"
  on public.franchises for select to authenticated
  using (public.current_user_belongs_to_franchise(id));

commit;
