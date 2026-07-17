-- READ ONLY. Run in STAGING after 202607170002_keep_drafts_creator_private.sql.

do $$
declare
  v_select_qual text;
  v_update_qual text;
  v_update_check text;
begin
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

  if v_select_qual is null or v_select_qual not ilike '%current_user_owns_proposal%'
     or v_select_qual not ilike '%current_user_can_review_franchise%'
     or v_select_qual not ilike '%draft%' then
    raise exception 'Proposal SELECT policy does not contain creator ownership plus reviewer draft exclusion.';
  end if;

  if v_update_qual is null or v_update_check is null
     or v_update_qual not ilike '%current_user_owns_proposal%'
     or v_update_qual not ilike '%draft%'
     or v_update_check not ilike '%current_user_owns_proposal%'
     or v_update_check not ilike '%draft%' then
    raise exception 'Proposal UPDATE policy does not protect drafts on both sides of the update.';
  end if;

  if not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'current_user_owns_proposal'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ) then raise exception 'authenticated cannot execute the proposal ownership helper.'; end if;
end;
$$;

select
  franchise.franchise_code,
  lower(coalesce(proposal.status, proposal.proposal_json ->> 'status', 'draft')) as proposal_status,
  count(*) as proposal_count,
  count(proposal.designer_auth_user_id) as ownership_id_pinned
from public.franchise_proposals proposal
join public.franchises franchise on franchise.id = proposal.franchise_id
where franchise.franchise_code in ('5555', '9724', '8669')
group by franchise.franchise_code,
  lower(coalesce(proposal.status, proposal.proposal_json ->> 'status', 'draft'))
order by franchise.franchise_code, proposal_status;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'franchise_proposals'
order by policyname;

select 'STAGING DRAFT PRIVACY VERIFICATION PASSED' as result;
