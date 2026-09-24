-- Read-only preflight for a staging or production rollout. Run before and
-- after applying ONLY 20260923215634_shared_proposals_owner_review.sql.
-- Compare the pre/post proposal counts and JSON fingerprints outside this file.
begin transaction read only;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('franchise_proposals','franchise_test_proposals')
  and column_name in ('proposal_number','franchise_id','designer_auth_user_id',
    'owner_auth_user_id','content_revision','collaboration_enabled','proposal_json')
order by table_name,column_name;

select 'live' as mode,count(*) as proposal_count,
  md5(coalesce(string_agg(proposal_number || ':' || md5(proposal_json::text), '|' order by proposal_number),'')) as proposal_json_fingerprint,
  md5(coalesce(string_agg(proposal_number || ':' || md5(concat_ws('|',
    designer_auth_user_id::text,designer_name,designer_role,designer_code,
    pricing_model_id,pricing_model_name,status)), '|' order by proposal_number),''))
    as attribution_pricing_and_status_fingerprint,
  count(*) filter (where designer_auth_user_id is null) as legacy_unresolved_designer_ids
from public.franchise_proposals
union all
select 'test',count(*),
  md5(coalesce(string_agg(proposal_number || ':' || md5(proposal_json::text), '|' order by proposal_number),'')),
  md5(coalesce(string_agg(proposal_number || ':' || md5(concat_ws('|',
    designer_auth_user_id::text,designer_name,designer_role,designer_code,
    pricing_model_id,pricing_model_name,status)), '|' order by proposal_number),'')),
  count(*) filter (where designer_auth_user_id is null)
from public.franchise_test_proposals;

select proposal_number,franchise_id,designer_name,designer_auth_user_id
from public.franchise_proposals where designer_auth_user_id is null
order by franchise_id,proposal_number;

-- After the migration, inspect current-owner coverage and confirm rollout
-- remains disabled until an explicit staging/franchise activation.
-- select franchise_id,count(*) filter (where owner_auth_user_id is null) as unresolved,
--   count(*) filter (where collaboration_enabled) as ever_shared
-- from public.franchise_proposals group by franchise_id order by franchise_id;
-- select * from public.proposal_collaboration_rollout order by franchise_id;

rollback;
