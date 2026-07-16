-- READ-ONLY STAGING AUDIT. This identifies why the owner dashboard may show
-- fewer proposals than exist for the selected franchise. It changes nothing.

with master_profile as (
  select profile.name
  from auth.users auth_user
  join public.franchise_users profile on profile.auth_user_id = auth_user.id
  where lower(profile.role) = 'master' and coalesce(profile.is_active, true)
  limit 1
)
select
  franchise.franchise_code,
  franchise.name,
  master_profile.name as expected_designer_name,
  count(*) as database_proposals,
  count(*) filter (
    where lower(coalesce(proposal.designer_name, '')) = lower(master_profile.name)
  ) as matching_designer_column,
  count(*) filter (
    where lower(coalesce(proposal.proposal_json->>'designerName', '')) = lower(master_profile.name)
  ) as matching_proposal_json,
  count(*) filter (
    where nullif(proposal.proposal_json->>'pricingModelId', '') is not null
      and nullif(proposal.proposal_json->>'pricingModelRevisionId', '') is not null
  ) as pricing_revision_pinned
from public.franchise_proposals proposal
join public.franchises franchise on franchise.id = proposal.franchise_id
cross join master_profile
where franchise.franchise_code in ('5555', '9724')
group by franchise.franchise_code, franchise.name, master_profile.name
order by franchise.franchise_code;

select
  franchise.franchise_code,
  proposal.status,
  proposal.designer_name,
  proposal.proposal_json->>'designerName' as json_designer_name,
  count(*) as proposals
from public.franchise_proposals proposal
join public.franchises franchise on franchise.id = proposal.franchise_id
where franchise.franchise_code in ('5555', '9724')
group by franchise.franchise_code, proposal.status, proposal.designer_name,
  proposal.proposal_json->>'designerName'
order by franchise.franchise_code, proposal.status, proposal.designer_name;

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public' and tablename = 'franchise_proposals'
order by policyname;

select 'STAGING PROPOSAL VISIBILITY AUDIT PASSED - no data was changed' as result;
