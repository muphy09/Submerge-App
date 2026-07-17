-- Deterministically pins historical proposal ownership. Master-stamped rows
-- are matched only to a unique master identity; all other rows are matched to
-- a unique profile within their franchise. Ambiguous rows remain unchanged.
-- Proposal pricing, status, customer data, JSON, and timestamps are untouched.

begin;

-- Master-created proposals may belong to any franchise (or the legacy default)
-- because the master profile itself is intentionally not franchise-bound.
with master_matches as (
  select
    proposal.franchise_id,
    proposal.proposal_number,
    (array_agg(distinct profile.auth_user_id))[1] as auth_user_id,
    count(distinct profile.auth_user_id) as match_count
  from public.franchise_proposals proposal
  join public.franchise_users profile
    on lower(profile.role) = 'master'
   and profile.auth_user_id is not null
   and lower(trim(coalesce(
         nullif(proposal.designer_role, ''),
         proposal.proposal_json ->> 'designerRole',
         ''
       ))) = 'master'
   and nullif(lower(trim(coalesce(
         nullif(proposal.designer_name, ''),
         proposal.proposal_json ->> 'designerName',
         ''
       ))), '') is not null
   and lower(trim(coalesce(
         nullif(proposal.designer_name, ''),
         proposal.proposal_json ->> 'designerName',
         ''
       ))) in (
         lower(trim(coalesce(profile.name, ''))),
         lower(trim(coalesce(profile.email, '')))
       )
  where proposal.designer_auth_user_id is null
  group by proposal.franchise_id, proposal.proposal_number
)
update public.franchise_proposals proposal
set designer_auth_user_id = ownership.auth_user_id
from master_matches ownership
where proposal.franchise_id = ownership.franchise_id
  and proposal.proposal_number = ownership.proposal_number
  and ownership.match_count = 1
  and proposal.designer_auth_user_id is null;

-- Non-master proposals are pinned only when exactly one historical profile in
-- the same franchise matches the stored designer name or email.
with franchise_matches as (
  select
    proposal.franchise_id,
    proposal.proposal_number,
    (array_agg(distinct profile.auth_user_id))[1] as auth_user_id,
    count(distinct profile.auth_user_id) as match_count
  from public.franchise_proposals proposal
  join public.franchise_users profile
    on profile.franchise_id = proposal.franchise_id
   and profile.auth_user_id is not null
   and lower(trim(coalesce(
         nullif(proposal.designer_role, ''),
         proposal.proposal_json ->> 'designerRole',
         ''
       ))) <> 'master'
   and nullif(lower(trim(coalesce(
         nullif(proposal.designer_name, ''),
         proposal.proposal_json ->> 'designerName',
         ''
       ))), '') is not null
   and lower(trim(coalesce(
         nullif(proposal.designer_name, ''),
         proposal.proposal_json ->> 'designerName',
         ''
       ))) in (
         lower(trim(coalesce(profile.name, ''))),
         lower(trim(coalesce(profile.email, '')))
       )
  where proposal.designer_auth_user_id is null
  group by proposal.franchise_id, proposal.proposal_number
)
update public.franchise_proposals proposal
set designer_auth_user_id = ownership.auth_user_id
from franchise_matches ownership
where proposal.franchise_id = ownership.franchise_id
  and proposal.proposal_number = ownership.proposal_number
  and ownership.match_count = 1
  and proposal.designer_auth_user_id is null;

commit;
