-- STAGING ONLY. Maps sanitized proposal copies to the sole staging master after
-- the sanitizer intentionally removed all other Auth users. Never run this in
-- production. Proposal content, prices, statuses, JSON, and timestamps remain unchanged.

begin;

do $$
begin
  if (
    select count(*)
    from auth.users auth_user
    join public.franchise_users profile on profile.auth_user_id = auth_user.id
    where lower(profile.role) = 'master'
      and coalesce(profile.is_active, true) = true
  ) <> 1 then
    raise exception 'SAFETY STOP: staging must contain exactly one active master.';
  end if;

  if exists (
    select 1
    from auth.users auth_user
    left join public.franchise_users profile on profile.auth_user_id = auth_user.id
    where coalesce(lower(profile.role), '') <> 'master'
      and lower(coalesce(auth_user.email, '')) not like '%@example.invalid'
      and not (
        lower(coalesce(auth_user.email, '')) = 'stagingroletest@test.com'
        and lower(coalesce(profile.name, '')) = 'staging role test'
        and profile.franchise_id = 'b4c27ce1-1485-4211-8336-3e2d2ef18a14'
        and lower(coalesce(profile.role, '')) in ('designer', 'bookkeeper', 'admin', 'owner')
        and coalesce(profile.is_active, true) = true
      )
  ) then
    raise exception 'SAFETY STOP: staging contains an unexpected non-master Auth user.';
  end if;

  if not exists (
    select 1
    from public.franchise_proposals proposal
    where proposal.proposal_json #>> '{customerInfo,email}' like 'staging-customer-%@example.invalid'
  ) then
    raise exception 'SAFETY STOP: sanitized staging proposal markers were not found.';
  end if;
end;
$$;

with sole_master as (
  select auth_user.id as auth_user_id,
    lower(trim(coalesce(nullif(profile.name, ''), auth_user.email, ''))) as master_identity
  from auth.users auth_user
  join public.franchise_users profile on profile.auth_user_id = auth_user.id
  where lower(profile.role) = 'master'
    and coalesce(profile.is_active, true) = true
)
update public.franchise_proposals proposal
set designer_auth_user_id = sole_master.auth_user_id
from sole_master
where proposal.designer_auth_user_id is null
  and (
    proposal.proposal_json #>> '{customerInfo,email}' like 'staging-customer-%@example.invalid'
    or (
      lower(coalesce(proposal.designer_role, proposal.proposal_json ->> 'designerRole', '')) = 'master'
      and lower(trim(coalesce(
        nullif(proposal.designer_name, ''),
        proposal.proposal_json ->> 'designerName',
        ''
      ))) = sole_master.master_identity
    )
  );

do $$
begin
  if exists (
    select 1
    from public.franchise_proposals
    where designer_auth_user_id is null
  ) then
    raise exception 'Some staging proposals remain unresolved. Transaction rolled back; inspect them before mapping.';
  end if;
end;
$$;

commit;

select 'STAGING SANITIZED PROPOSAL OWNERSHIP MAPPING PASSED' as result;
