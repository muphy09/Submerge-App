-- READ ONLY. Safe to run in PRODUCTION before the ownership migrations.
-- It does not require designer_auth_user_id and changes nothing.

with proposal_identity as (
  select
    proposal.franchise_id,
    proposal.proposal_number,
    lower(coalesce(proposal.status, proposal.proposal_json ->> 'status', 'draft')) as proposal_status,
    lower(trim(coalesce(
      nullif(proposal.designer_name, ''),
      proposal.proposal_json ->> 'designerName',
      ''
    ))) as designer_identity,
    lower(trim(coalesce(
      nullif(proposal.designer_role, ''),
      proposal.proposal_json ->> 'designerRole',
      ''
    ))) as designer_role
  from public.franchise_proposals proposal
), classified as (
  select
    identity.*,
    franchise.franchise_code,
    franchise.name as franchise_name,
    (
      select count(distinct profile.auth_user_id)
      from public.franchise_users profile
      where profile.franchise_id = identity.franchise_id
        and profile.auth_user_id is not null
        and identity.designer_identity <> ''
        and identity.designer_identity in (
          lower(trim(coalesce(profile.name, ''))),
          lower(trim(coalesce(profile.email, '')))
        )
    ) as franchise_identity_matches,
    (
      select count(distinct profile.auth_user_id)
      from public.franchise_users profile
      where lower(profile.role) = 'master'
        and profile.auth_user_id is not null
        and identity.designer_role = 'master'
        and identity.designer_identity <> ''
        and identity.designer_identity in (
          lower(trim(coalesce(profile.name, ''))),
          lower(trim(coalesce(profile.email, '')))
        )
    ) as master_identity_matches
  from proposal_identity identity
  left join public.franchises franchise on franchise.id = identity.franchise_id
), results as (
  select
    classified.*,
    case
      when designer_identity = '' then 'UNRESOLVED_MISSING_IDENTITY'
      when designer_role = 'master' and master_identity_matches = 1 then 'SAFE_MASTER_MATCH'
      when designer_role = 'master' and master_identity_matches > 1 then 'UNRESOLVED_AMBIGUOUS_MASTER'
      when designer_role = 'master' then 'UNRESOLVED_MASTER_NOT_FOUND'
      when franchise_identity_matches = 1 then 'SAFE_FRANCHISE_USER_MATCH'
      when franchise_identity_matches > 1 then 'UNRESOLVED_AMBIGUOUS_USER'
      else 'UNRESOLVED_USER_NOT_FOUND'
    end as ownership_classification
  from classified
)
select
  'SUMMARY'::text as result_type,
  coalesce(franchise_code, '(missing franchise)') as franchise_code,
  coalesce(franchise_name, '(missing franchise)') as franchise_name,
  proposal_status,
  ownership_classification,
  count(*)::text as detail
from results
group by franchise_code, franchise_name, proposal_status, ownership_classification

union all

select
  'UNRESOLVED PROPOSAL',
  coalesce(franchise_code, '(missing franchise)'),
  coalesce(franchise_name, '(missing franchise)'),
  proposal_status,
  ownership_classification,
  proposal_number || ' | designer=' || coalesce(nullif(designer_identity, ''), '(blank)')
from results
where ownership_classification like 'UNRESOLVED%'

union all

select
  'RESULT',
  '',
  '',
  '',
  case
    when exists (select 1 from results where ownership_classification like 'UNRESOLVED%')
      then 'OWNERSHIP PREFLIGHT REQUIRES MANUAL MAPPING'
    else 'OWNERSHIP PREFLIGHT PASSED'
  end,
  case
    when exists (select 1 from results where ownership_classification like 'UNRESOLVED%')
      then 'Do not apply production ownership policies yet.'
    else 'Every legacy proposal has one deterministic owner match.'
  end
order by result_type, franchise_code, proposal_status, ownership_classification, detail;
