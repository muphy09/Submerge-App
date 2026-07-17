-- READ ONLY. Run in STAGING after 202607170004_claim_legacy_master_drafts.sql.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.current_user_owns_proposal(text,uuid,text,jsonb)'::regprocedure
  ) into v_definition;

  if v_definition not ilike '%designerRole%master%'
     or v_definition not ilike '%target_designer_auth_user_id is null%'
     or v_definition not ilike '%lower(candidate.role) = ''master''%'
     or v_definition not ilike '%count(*)%' then
    raise exception 'Legacy master-draft compatibility guard is incomplete.';
  end if;
end;
$$;

select
  franchise.franchise_code,
  count(*) as unpinned_master_drafts
from public.franchise_proposals proposal
left join public.franchises franchise on franchise.id = proposal.franchise_id
where proposal.designer_auth_user_id is null
  and lower(coalesce(proposal.status, proposal.proposal_json ->> 'status', 'draft')) = 'draft'
  and lower(coalesce(proposal.proposal_json ->> 'designerRole', '')) = 'master'
group by franchise.franchise_code
order by franchise.franchise_code;

select 'LEGACY MASTER DRAFT CLAIM VERIFICATION PASSED' as result;
