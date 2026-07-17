-- READ ONLY. Run after 202607170005_backfill_all_legacy_proposal_owners.sql.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'franchise_proposals'
      and column_name = 'designer_auth_user_id'
      and data_type = 'uuid'
  ) then raise exception 'designer_auth_user_id UUID column is missing.'; end if;

  if exists (
    select 1
    from public.franchise_proposals proposal
    where proposal.designer_auth_user_id is not null
      and not exists (
        select 1 from auth.users auth_user
        where auth_user.id = proposal.designer_auth_user_id
      )
  ) then raise exception 'One or more pinned ownership IDs do not exist in Auth.'; end if;
end;
$$;

select
  franchise.franchise_code,
  lower(coalesce(proposal.status, proposal.proposal_json ->> 'status', 'draft')) as proposal_status,
  count(*) as proposals,
  count(proposal.designer_auth_user_id) as ownership_pinned,
  count(*) - count(proposal.designer_auth_user_id) as ownership_unresolved
from public.franchise_proposals proposal
left join public.franchises franchise on franchise.id = proposal.franchise_id
group by franchise.franchise_code,
  lower(coalesce(proposal.status, proposal.proposal_json ->> 'status', 'draft'))
order by franchise.franchise_code, proposal_status;

select
  case
    when exists (
      select 1 from public.franchise_proposals
      where designer_auth_user_id is null
    ) then 'OWNERSHIP BACKFILL REQUIRES MANUAL MAPPING'
    else 'LEGACY PROPOSAL OWNERSHIP BACKFILL PASSED'
  end as result;
