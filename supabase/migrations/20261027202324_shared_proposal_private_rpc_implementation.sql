begin;
create schema if not exists collaboration_private;
revoke all on schema collaboration_private from public,anon;
grant usage on schema collaboration_private to authenticated;
create or replace function collaboration_private.collab_begin_work(p_number text,p_test boolean,p_version text,p_expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; q public.proposal_collaboration_requests; t text; b jsonb;
begin
  t:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select * from public.%I where proposal_number=$1 for update',t) into r using p_number;
  if r is null or not r.collaboration_enabled or not public.collab_enabled(r.franchise_id,p_test)
    or not public.collab_actor_active(r.franchise_id,p_test,auth.uid())
    or not exists(select 1 from public.proposal_collaboration_shares where proposal_number=p_number
      and is_test=p_test and recipient_id=auth.uid() and permission='contribute' and ended_at is null)
    then raise exception 'Contributor access required'; end if;
  if lower(r.status)='completed' then raise exception 'Completed proposal is locked'; end if;
  b:=public.collab_editable_version(r.proposal_json,p_version);
  if exists(select 1 from public.proposal_collaboration_requests where proposal_number=p_number
    and is_test=p_test and contributor_id=auth.uid() and status='submitted') then
    raise exception 'Submitted changes are pending review. Withdraw them before proposing more changes'; end if;
  select * into q from public.proposal_collaboration_requests where proposal_number=p_number and is_test=p_test
    and contributor_id=auth.uid() and target_version_id=p_version and status in ('working','revision_requested','stale','withdrawn')
    order by updated_at desc limit 1 for update;
  if q.id is null then
    if r.content_revision is distinct from p_expected then raise exception 'COLLAB_CONFLICT: Reopen the latest proposal before starting edits'; end if;
    insert into public.proposal_collaboration_requests(proposal_number,franchise_id,is_test,contributor_id,target_version_id,
      base_revision,base_version_json,working_version_json,status,protocol_version)
      values(p_number,r.franchise_id,p_test,auth.uid(),p_version,r.content_revision,b,b,'working',2) returning * into q;
  else
    update public.proposal_collaboration_requests set protocol_version=2,
      status=case when status in ('stale','withdrawn') then 'working' else status end,updated_at=clock_timestamp()
      where id=q.id returning * into q;
  end if;
  return to_jsonb(q);
end $$;
create or replace function collaboration_private.collab_save_work_v2(p_request uuid,p_test boolean,p_work jsonb,
  p_updated timestamptz,p_submit boolean default false,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.proposal_collaboration_requests; r record; t text; b jsonb;
begin
  -- Read identity first, then lock proposal before request to match all write paths.
  select * into q from public.proposal_collaboration_requests where id=p_request and is_test=p_test;
  if q.id is null then raise exception 'Working copy not found'; end if;
  t:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select * from public.%I where proposal_number=$1 for update',t) into r using q.proposal_number;
  select * into q from public.proposal_collaboration_requests where id=p_request and is_test=p_test for update;
  if r is null or q.contributor_id is distinct from auth.uid() or q.protocol_version<>2
    or not public.collab_actor_active(r.franchise_id,p_test,auth.uid())
    or not exists(select 1 from public.proposal_collaboration_shares where proposal_number=q.proposal_number
      and is_test=p_test and recipient_id=auth.uid() and permission='contribute' and ended_at is null)
    then raise exception 'Contributor access required'; end if;
  if q.updated_at is distinct from p_updated then raise exception 'COLLAB_CONFLICT: This working copy changed in another window. Your edits have not been saved'; end if;
  if lower(r.status)='completed' then raise exception 'Completed proposal is locked'; end if;
  perform public.collab_editable_version(r.proposal_json,q.target_version_id);
  if q.status not in ('working','revision_requested','stale','withdrawn') or exists(select 1 from public.proposal_collaboration_requests
    where proposal_number=q.proposal_number and is_test=p_test and contributor_id=auth.uid() and status='submitted') then
    raise exception 'Submitted changes are frozen until withdrawn or reviewed'; end if;
  b:=q.base_version_json;
  if p_work is null or jsonb_typeof(p_work)<>'object' or p_work->>'proposalNumber' is distinct from q.proposal_number
    or coalesce(p_work->>'versionId','original') is distinct from q.target_version_id
    or p_work->>'pricingModelId' is distinct from b->>'pricingModelId'
    or p_work->>'pricingModelRevisionId' is distinct from b->>'pricingModelRevisionId'
    or p_work->>'pricingModelFranchiseId' is distinct from b->>'pricingModelFranchiseId'
    or coalesce(p_work->>'pricingTierId','normal') is distinct from coalesce(b->>'pricingTierId','normal')
    then raise exception 'Working copy changed protected pricing identity'; end if;
  if p_submit and public.collab_input_fields(p_work)=public.collab_input_fields(b) then
    raise exception 'Make at least one input change before sending to the owner'; end if;
  update public.proposal_collaboration_requests set working_version_json=p_work,
    status=case when p_submit then 'submitted' else 'working' end,
    contributor_note=coalesce(nullif(trim(p_note),''),contributor_note),
    submitted_at=case when p_submit then clock_timestamp() else submitted_at end,updated_at=clock_timestamp()
    where id=q.id returning * into q;
  if p_submit then perform public.collab_emit(q.proposal_number,r.franchise_id,p_test,auth.uid(),r.owner_auth_user_id,
    'changes_submitted',q.id,p_note); end if;
  return to_jsonb(q);
end $$;
create or replace function collaboration_private.collab_apply_review(p_request uuid,p_test boolean,p_expected bigint,
  p_updated timestamptz,p_result jsonb,p_resolutions jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare q public.proposal_collaboration_requests; r record; t text; c jsonb; merged jsonb; result jsonb;
  expected_inputs jsonb; k text; item jsonb;
begin
  select * into q from public.proposal_collaboration_requests where id=p_request and is_test=p_test;
  if q.id is null then raise exception 'Request not found'; end if;
  t:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select * from public.%I where proposal_number=$1 for update',t) into r using q.proposal_number;
  select * into q from public.proposal_collaboration_requests where id=p_request and is_test=p_test for update;
  if r is null or r.owner_auth_user_id is distinct from auth.uid()
    or not public.collab_actor_active(r.franchise_id,p_test,auth.uid()) then raise exception 'Owner review required'; end if;
  if q.status<>'submitted' or r.content_revision is distinct from p_expected or q.updated_at is distinct from p_updated then
    raise exception 'COLLAB_CONFLICT: Refresh the comparison before applying changes'; end if;
  if lower(r.status)='completed' or not public.collab_user_active(r.franchise_id,p_test,q.contributor_id)
    or not exists(select 1 from public.proposal_collaboration_shares where proposal_number=q.proposal_number
      and is_test=p_test and recipient_id=q.contributor_id and permission='contribute' and ended_at is null) then
    raise exception 'Contributor access ended or proposal locked'; end if;
  c:=public.collab_editable_version(r.proposal_json,q.target_version_id);
  if p_result is null or p_result->>'proposalNumber' is distinct from q.proposal_number
    or coalesce(p_result->>'versionId','original') is distinct from q.target_version_id
    or p_result->>'pricingModelId' is distinct from c->>'pricingModelId'
    or p_result->>'pricingModelRevisionId' is distinct from c->>'pricingModelRevisionId'
    or p_result->>'pricingModelFranchiseId' is distinct from c->>'pricingModelFranchiseId'
    or coalesce(p_result->>'pricingTierId','normal') is distinct from coalesce(c->>'pricingTierId','normal')
    then raise exception 'The reviewed pricing identity changed'; end if;
  merged:=public.collab_merge_input(public.collab_input_fields(q.base_version_json),
    public.collab_input_fields(q.working_version_json),public.collab_input_fields(c),coalesce(p_resolutions,'{}'));
  for k,item in select key,value from jsonb_each(coalesce(p_resolutions,'{}')) loop
    if (k like 'pricing:%' or k like 'catalog:%') and item='"owner"' then
      if public.collab_input_fields(c) ? substr(k,9) then
        merged:=jsonb_set(merged,array[substr(k,9)],public.collab_input_fields(c)->substr(k,9),true);
      else merged:=merged-substr(k,9); end if;
    end if;
  end loop;
  expected_inputs:=public.collab_input_fields(p_result);
  -- Normalization may alter dependent selections only when explicitly reviewed.
  if merged is distinct from expected_inputs and coalesce(p_resolutions->>'catalog','') not in ('owner','contributor')
    and coalesce(p_resolutions->>'baseline-pricing','')<>'owner' then
    raise exception 'Selection normalization requires explicit owner resolution'; end if;
  if coalesce(p_resolutions->>'catalog','')='owner' or coalesce(p_resolutions->>'baseline-pricing','')='owner' then
    if expected_inputs is distinct from public.collab_input_fields(c) then raise exception 'Owner selection resolution changed'; end if;
  end if;
  -- Preserve all protected metadata and approved commission/discount settings.
  if p_result->'pricing'->'digCommissionRate' is distinct from coalesce(c->'pricing'->'digCommissionRate','0.0275'::jsonb)
    or p_result->'pricing'->'closeoutCommissionRate' is distinct from coalesce(c->'pricing'->'closeoutCommissionRate','0.0275'::jsonb) then
    raise exception 'Contribution cannot change owner commission rates'; end if;
  result:=public.collab_replace_version(r.proposal_json,q.target_version_id,p_result);
  result:=jsonb_set(result,'{lastModified}',to_jsonb(clock_timestamp()::text),true);
  perform set_config('app.collaboration_authorized','yes',true);
  execute format('update public.%I set proposal_json=$2,content_revision=content_revision+1,updated_at=now(),last_modified=now() where proposal_number=$1',t)
    using q.proposal_number,result;
  update public.proposal_collaboration_requests set status='applied',updated_at=clock_timestamp(),decided_at=now(),decided_by=auth.uid(),
    pre_apply_proposal_json=r.proposal_json,post_apply_proposal_json=result,applied_revision=r.content_revision+1 where id=q.id;
  perform public.collab_emit(q.proposal_number,r.franchise_id,p_test,auth.uid(),q.contributor_id,'changes_applied',q.id);
end $$;

create or replace function public.collab_begin_work(p_number text,p_test boolean,p_version text,p_expected bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select collaboration_private.collab_begin_work(p_number,p_test,p_version,p_expected);
$$;
create or replace function public.collab_save_work_v2(p_request uuid,p_test boolean,p_work jsonb,
 p_updated timestamptz,p_submit boolean default false,p_note text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select collaboration_private.collab_save_work_v2(p_request,p_test,p_work,p_updated,p_submit,p_note);
$$;
create or replace function public.collab_apply_review(p_request uuid,p_test boolean,p_expected bigint,
 p_updated timestamptz,p_result jsonb,p_resolutions jsonb)
returns void language sql security invoker set search_path='' as $$
 select collaboration_private.collab_apply_review(p_request,p_test,p_expected,p_updated,p_result,p_resolutions);
$$;
revoke all on function collaboration_private.collab_begin_work(text,boolean,text,bigint),
 collaboration_private.collab_save_work_v2(uuid,boolean,jsonb,timestamptz,boolean,text),
 collaboration_private.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function collaboration_private.collab_begin_work(text,boolean,text,bigint),
 collaboration_private.collab_save_work_v2(uuid,boolean,jsonb,timestamptz,boolean,text),
 collaboration_private.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb) to authenticated;
revoke all on function public.collab_begin_work(text,boolean,text,bigint),
 public.collab_save_work_v2(uuid,boolean,jsonb,timestamptz,boolean,text),
 public.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.collab_begin_work(text,boolean,text,bigint),
 public.collab_save_work_v2(uuid,boolean,jsonb,timestamptz,boolean,text),
 public.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
