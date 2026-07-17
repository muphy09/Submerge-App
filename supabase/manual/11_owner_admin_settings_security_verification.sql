-- READ ONLY. Run in STAGING after 202607170003_secure_owner_admin_settings.sql.
-- Does not return the Admin Panel PIN or any branding values.

do $$
declare
  v_policies text[];
begin
  select array_agg(policyname order by policyname)
  into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_branding';
  if coalesce(v_policies, array[]::text[]) <> array['franchise_branding_member_select'] then
    raise exception 'Unexpected franchise_branding policies: %', v_policies;
  end if;

  select array_agg(policyname order by policyname)
  into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'franchises';
  if coalesce(v_policies, array[]::text[]) <> array['franchise_member_select'] then
    raise exception 'Unexpected franchises policies: %', v_policies;
  end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in ('franchise_branding', 'franchises')
      and lower(grantee) in ('public', 'anon')
  ) then raise exception 'PUBLIC/anon still has privileges on protected franchise settings.'; end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'franchise_branding'
      and column_name = 'admin_panel_pin'
      and lower(grantee) in ('public', 'anon', 'authenticated')
  ) then raise exception 'The Admin Panel PIN column is still directly readable or writable.'; end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'franchises'
      and lower(grantee) = 'authenticated'
      and privilege_type <> 'SELECT'
  ) then raise exception 'authenticated still has direct franchise write privileges.'; end if;

  if to_regprocedure('public.get_franchise_admin_panel_pin(text)') is null
     or to_regprocedure('public.verify_franchise_admin_panel_pin(text,text)') is null
     or to_regprocedure('public.save_franchise_branding_owner_settings(text,jsonb,text)') is null
     or to_regprocedure('public.save_franchise_code_owner_setting(text,text,text)') is null then
    raise exception 'One or more protected Admin Settings functions are missing.';
  end if;
end;
$$;

select
  franchise.franchise_code,
  franchise.name,
  branding.franchise_id is not null as has_branding_record,
  branding.logo_url is not null as has_custom_logo,
  branding.app_name is not null as has_custom_app_name,
  branding.admin_panel_pin is not null as has_custom_admin_pin
from public.franchises franchise
left join public.franchise_branding branding on branding.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '9724', '8669')
order by franchise.franchise_code;

select 'OWNER ADMIN SETTINGS SECURITY VERIFICATION PASSED' as result;
