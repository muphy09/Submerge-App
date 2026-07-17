-- READ ONLY. Run this in the STAGING Supabase SQL editor immediately before
-- 202607170001_harden_role_permissions.sql. No data or schema is changed.

do $$
begin
  if to_regclass('public.franchise_proposals') is null then
    raise exception 'Missing public.franchise_proposals.';
  end if;
  if to_regclass('public.franchise_pricing_models') is null then
    raise exception 'Missing public.franchise_pricing_models.';
  end if;
  if to_regclass('public.franchise_users') is null then
    raise exception 'Missing public.franchise_users.';
  end if;

  if to_regprocedure('public.current_user_is_master()') is null then
    raise exception 'Missing current_user_is_master(). Run the foundation migration first.';
  end if;
  if to_regprocedure('public.current_user_can_manage_franchise(text)') is null then
    raise exception 'Missing current_user_can_manage_franchise(text). Run the foundation migration first.';
  end if;
  if to_regprocedure('public.current_user_belongs_to_franchise(text)') is null then
    raise exception 'Missing current_user_belongs_to_franchise(text). Run the foundation migration first.';
  end if;

  -- Staging-only safety gate. The sanitizer rewrites customer emails to this
  -- reserved domain; production should never pass this check.
  if not exists (
    select 1
    from public.franchise_proposals proposal
    where proposal.proposal_json #>> '{customerInfo,email}' like 'staging-customer-%@example.invalid'
  ) then
    raise exception 'SAFETY STOP: sanitized staging proposals were not found. Do not run the role migration until the selected project is confirmed as staging.';
  end if;

  if (select count(*) from auth.users) <> 1 then
    raise exception 'SAFETY STOP: staging should currently contain exactly one Auth user.';
  end if;

  if not exists (
    select 1
    from auth.users auth_user
    join public.franchise_users profile on profile.auth_user_id = auth_user.id
    where lower(profile.role) = 'master'
      and coalesce(profile.is_active, true) = true
  ) then
    raise exception 'SAFETY STOP: the sole staging Auth user is not an active master.';
  end if;
end;
$$;

select
  franchise.franchise_code,
  franchise.name,
  count(proposal.proposal_number) as staging_proposals
from public.franchises franchise
left join public.franchise_proposals proposal on proposal.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '9724', '8669')
group by franchise.franchise_code, franchise.name
order by franchise.franchise_code;

select 'STAGING ROLE HARDENING PREFLIGHT PASSED - no data was changed' as result;
