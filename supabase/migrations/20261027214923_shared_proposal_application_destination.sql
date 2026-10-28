begin;
alter table public.proposal_collaboration_requests
  add column application_mode text check(application_mode in ('new-draft','overwrite')),
  add column applied_version_id text;

create or replace function collaboration_private.collab_apply_review(p_request uuid,p_test boolean,p_expected bigint,
  p_updated timestamptz,p_result jsonb,p_resolutions jsonb,p_destination text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.proposal_collaboration_requests; r record; t text; c jsonb; merged jsonb; result jsonb;
  expected_inputs jsonb; k text; item jsonb; new_version jsonb; applied_id text; version_name text; suffix integer; applied_at text:=clock_timestamp()::text;
begin
  if p_destination is null or p_destination not in ('new-draft','overwrite') then raise exception 'Choose a valid application destination'; end if;
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
  if p_destination='overwrite' then
    applied_id:=q.target_version_id;
    result:=public.collab_replace_version(r.proposal_json,q.target_version_id,p_result);
  else
    applied_id:='version-'||gen_random_uuid()::text;
    -- Copy only owner metadata; exclude workflow history, signed records and locks.
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into new_version
      from jsonb_each(c) where key=any(array['proposalNumber','franchiseId','designerAuthUserId','designerName','designerRole','designerCode','ownerAuthUserId','currentOwnerName','westConstructionTimingVersion','pricingModelId','pricingModelName','pricingModelFranchiseId','pricingModelIsDefault','pricingModelRevisionId','pricingModelRevisionNumber','pricingRevisionReview','pricingTierId','pricingTierName','calculationProfile','compatibilityRevision','pricingEngineVersion','historicalPricingAdjustment','contractTemplateId','contractTemplateRevisionId','contractTemplateRevisionNumber','contractRevisionReview','contractTemplateRevision']);
    new_version:=new_version||public.collab_mutable_version_fields(p_result);
    suffix:=jsonb_array_length(coalesce(r.proposal_json->'versions','[]'::jsonb))+1;
    loop
      version_name:='Version '||suffix;
      exit when coalesce(r.proposal_json->>'versionName','')<>version_name
        and not exists(select 1 from jsonb_array_elements(coalesce(r.proposal_json->'versions','[]'::jsonb)) v where v->>'versionName'=version_name);
      suffix:=suffix+1;
    end loop;
    new_version:=new_version||jsonb_build_object('versionId',applied_id,'versionName',version_name,
      'versionSourceId',q.target_version_id,'versionCreationMode','copy','isOriginalVersion',false,
      'activeVersionId',applied_id,'versions','[]'::jsonb,'status','draft','versionStatus','draft',
      'versionLocked',false,'versionLockedAt',null,'versionSubmittedAt',null,'versionSubmittedBy',null,
      'workflow',jsonb_build_object('status','draft'),'createdDate',applied_at,'lastModified',applied_at);
    result:=jsonb_set(r.proposal_json,'{versions}',coalesce(r.proposal_json->'versions','[]'::jsonb)||jsonb_build_array(new_version),true);
    result:=jsonb_set(result,'{activeVersionId}',to_jsonb(applied_id),true);
  end if;
  result:=jsonb_set(result,'{lastModified}',to_jsonb(clock_timestamp()::text),true);
  perform set_config('app.collaboration_authorized','yes',true);
  execute format('update public.%I set proposal_json=$2,content_revision=content_revision+1,updated_at=now(),last_modified=now() where proposal_number=$1',t)
    using q.proposal_number,result;
  update public.proposal_collaboration_requests set status='applied',updated_at=clock_timestamp(),decided_at=now(),decided_by=auth.uid(),
    pre_apply_proposal_json=r.proposal_json,post_apply_proposal_json=result,applied_revision=r.content_revision+1,application_mode=p_destination,applied_version_id=applied_id where id=q.id;
  perform public.collab_emit(q.proposal_number,r.franchise_id,p_test,auth.uid(),q.contributor_id,'changes_applied',q.id);
  return jsonb_build_object('versionId',applied_id,'destination',p_destination);
end $$;


-- Old overwrite clients use the same validated transaction path.
create or replace function collaboration_private.collab_apply_review(p_request uuid,p_test boolean,p_expected bigint,
 p_updated timestamptz,p_result jsonb,p_resolutions jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform collaboration_private.collab_apply_review(p_request,p_test,p_expected,p_updated,p_result,p_resolutions,'overwrite');
end $$;
create or replace function public.collab_apply_review_v3(p_request uuid,p_test boolean,p_expected bigint,
 p_updated timestamptz,p_result jsonb,p_resolutions jsonb,p_destination text)
returns jsonb language sql security invoker set search_path='' as $$
  select collaboration_private.collab_apply_review(p_request,p_test,p_expected,p_updated,p_result,p_resolutions,p_destination);
$$;
revoke all on function collaboration_private.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb,text),
 public.collab_apply_review_v3(uuid,boolean,bigint,timestamptz,jsonb,jsonb,text) from public,anon;
grant execute on function collaboration_private.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb,text),
 public.collab_apply_review_v3(uuid,boolean,bigint,timestamptz,jsonb,jsonb,text) to authenticated;
commit;
notify pgrst, 'reload schema';

