-- READ ONLY. Run in PRODUCTION after migrations 202607170001 through
-- 202607170005. This changes no data and exposes no PIN or branding values.

do $$
declare
  v_actual text[];
  v_expected text[];
  v_select_qual text;
  v_update_qual text;
  v_update_check text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'franchise_proposals'
      and column_name = 'designer_auth_user_id'
      and data_type = 'uuid'
  ) then raise exception 'designer_auth_user_id UUID column is missing.'; end if;

  if exists (
    select 1 from public.franchise_proposals
    where designer_auth_user_id is null
  ) then raise exception 'One or more production proposals do not have a pinned owner.'; end if;

  if exists (
    select 1
    from public.franchise_proposals proposal
    where not exists (
      select 1 from auth.users auth_user
      where auth_user.id = proposal.designer_auth_user_id
    )
  ) then raise exception 'One or more proposal owner IDs do not exist in Auth.'; end if;

  if to_regprocedure('public.current_user_owns_proposal(text,uuid,text,jsonb)') is null
     or to_regprocedure('public.current_user_can_review_franchise(text)') is null
     or to_regprocedure('public.touch_current_user_last_login()') is null
     or to_regprocedure('public.update_franchise_user_approval_settings(text,numeric,numeric,boolean)') is null
     or to_regprocedure('public.update_franchise_user_commission_rates(text,numeric,numeric)') is null then
    raise exception 'One or more protected role/ownership functions are missing.';
  end if;

  if to_regprocedure('public.get_franchise_admin_panel_pin(text)') is null
     or to_regprocedure('public.verify_franchise_admin_panel_pin(text,text)') is null
     or to_regprocedure('public.save_franchise_branding_owner_settings(text,jsonb,text)') is null
     or to_regprocedure('public.save_franchise_code_owner_setting(text,text,text)') is null then
    raise exception 'One or more protected Admin Settings functions are missing.';
  end if;

  select array_agg(policyname order by policyname) into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_proposals';
  v_expected := array[
    'proposal_role_delete', 'proposal_role_insert',
    'proposal_role_select', 'proposal_role_update'
  ];
  if coalesce(v_actual, array[]::text[]) <> v_expected then
    raise exception 'Unexpected franchise_proposals policies: %', v_actual;
  end if;

  select array_agg(policyname order by policyname) into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_pricing_models';
  v_expected := array[
    'pricing_model_role_delete', 'pricing_model_role_insert',
    'pricing_model_role_select', 'pricing_model_role_update'
  ];
  if coalesce(v_actual, array[]::text[]) <> v_expected then
    raise exception 'Unexpected franchise_pricing_models policies: %', v_actual;
  end if;

  select array_agg(policyname order by policyname) into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_users';
  if coalesce(v_actual, array[]::text[]) <> array['franchise_user_role_select'] then
    raise exception 'Unexpected franchise_users policies: %', v_actual;
  end if;

  select array_agg(policyname order by policyname) into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchise_branding';
  if coalesce(v_actual, array[]::text[]) <> array['franchise_branding_member_select'] then
    raise exception 'Unexpected franchise_branding policies: %', v_actual;
  end if;

  select array_agg(policyname order by policyname) into v_actual
  from pg_policies
  where schemaname = 'public' and tablename = 'franchises';
  if coalesce(v_actual, array[]::text[]) <> array['franchise_member_select'] then
    raise exception 'Unexpected franchises policies: %', v_actual;
  end if;

  select qual into v_select_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'franchise_proposals'
    and policyname = 'proposal_role_select';

  select qual, with_check into v_update_qual, v_update_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'franchise_proposals'
    and policyname = 'proposal_role_update';

  if v_select_qual is null
     or v_select_qual not ilike '%current_user_owns_proposal%'
     or v_select_qual not ilike '%current_user_can_review_franchise%'
     or v_select_qual not ilike '%draft%' then
    raise exception 'Proposal SELECT policy does not enforce creator-private drafts.';
  end if;

  if v_update_qual is null or v_update_check is null
     or v_update_qual not ilike '%current_user_owns_proposal%'
     or v_update_qual not ilike '%draft%'
     or v_update_check not ilike '%current_user_owns_proposal%'
     or v_update_check not ilike '%draft%' then
    raise exception 'Proposal UPDATE policy does not protect drafts on both sides.';
  end if;

  if exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in (
        'franchise_proposals', 'franchise_pricing_models', 'franchise_users',
        'franchise_branding', 'franchises'
      )
      and lower(grantee) in ('public', 'anon')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then raise exception 'PUBLIC/anon has direct privileges on a protected table.'; end if;

  if exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'franchise_users'
      and lower(grantee) = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then raise exception 'authenticated has direct franchise_users write privileges.'; end if;

  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'franchise_branding'
      and column_name = 'admin_panel_pin'
      and lower(grantee) in ('public', 'anon', 'authenticated')
  ) then raise exception 'The Admin Panel PIN column is directly accessible.'; end if;
end;
$$;

select
  franchise.franchise_code,
  franchise.name,
  count(proposal.proposal_number) as proposals,
  count(proposal.designer_auth_user_id) as ownership_pinned,
  count(proposal.proposal_number) - count(proposal.designer_auth_user_id) as ownership_unresolved
from public.franchises franchise
left join public.franchise_proposals proposal on proposal.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '9724', '8669')
group by franchise.franchise_code, franchise.name
order by franchise.franchise_code;

select 'PRODUCTION SECURITY VERIFICATION PASSED' as result;
