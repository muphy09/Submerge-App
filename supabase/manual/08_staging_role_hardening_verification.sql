-- READ ONLY. Run in STAGING after 202607170001_harden_role_permissions.sql.

do $$
declare
  v_actual text[];
  v_expected text[];
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'franchise_proposals'
      and column_name = 'designer_auth_user_id'
      and data_type = 'uuid'
  ) then raise exception 'designer_auth_user_id UUID column is missing.'; end if;

  if to_regprocedure('public.current_user_owns_proposal(text,uuid,text,jsonb)') is null then
    raise exception 'Proposal ownership helper is missing.';
  end if;
  if to_regprocedure('public.touch_current_user_last_login()') is null then
    raise exception 'Last-login helper is missing.';
  end if;
  if to_regprocedure('public.update_franchise_user_approval_settings(text,numeric,numeric,boolean)') is null then
    raise exception 'Approval-settings helper is missing.';
  end if;
  if to_regprocedure('public.update_franchise_user_commission_rates(text,numeric,numeric)') is null then
    raise exception 'Commission-settings helper is missing.';
  end if;

  select array_agg(policyname order by policyname)
  into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_proposals';
  v_expected := array[
    'proposal_role_delete', 'proposal_role_insert',
    'proposal_role_select', 'proposal_role_update'
  ];
  if coalesce(v_actual, array[]::text[]) <> v_expected then
    raise exception 'Unexpected franchise_proposals policies: %', v_actual;
  end if;

  select array_agg(policyname order by policyname)
  into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_pricing_models';
  v_expected := array[
    'pricing_model_role_delete', 'pricing_model_role_insert',
    'pricing_model_role_select', 'pricing_model_role_update'
  ];
  if coalesce(v_actual, array[]::text[]) <> v_expected then
    raise exception 'Unexpected franchise_pricing_models policies: %', v_actual;
  end if;

  select array_agg(policyname order by policyname)
  into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_users';
  v_expected := array['franchise_user_role_select'];
  if coalesce(v_actual, array[]::text[]) <> v_expected then
    raise exception 'Unexpected franchise_users policies: %', v_actual;
  end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in ('franchise_proposals', 'franchise_pricing_models', 'franchise_users')
      and lower(grantee) in ('public', 'anon')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then raise exception 'PUBLIC/anon still has direct privileges on a protected table.'; end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'franchise_users'
      and lower(grantee) = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then raise exception 'authenticated still has a direct franchise_users write privilege.'; end if;
end;
$$;

select
  franchise.franchise_code,
  franchise.name,
  count(proposal.proposal_number) as proposals,
  count(proposal.designer_auth_user_id) as ownership_id_pinned,
  count(proposal.proposal_number) - count(proposal.designer_auth_user_id) as legacy_compatibility_rows
from public.franchises franchise
left join public.franchise_proposals proposal on proposal.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '9724', '8669')
group by franchise.franchise_code, franchise.name
order by franchise.franchise_code;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('franchise_proposals', 'franchise_pricing_models', 'franchise_users')
order by tablename, policyname;

select 'STAGING ROLE HARDENING VERIFICATION PASSED' as result;
