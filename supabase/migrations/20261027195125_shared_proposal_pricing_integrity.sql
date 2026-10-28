begin;

alter table public.proposal_collaboration_requests add column if not exists protocol_version integer not null default 1;

-- Financial outputs and catalog costs are never contributor intent. Custom options
-- and explicit designer adjustments remain editable inputs.
create or replace function public.collab_input_value(v jsonb, explicit boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; k text; item jsonb;
begin
  if jsonb_typeof(v)='array' then
    select coalesce(jsonb_agg(public.collab_input_value(value,explicit)),'[]') into result from jsonb_array_elements(v);
    return result;
  elsif jsonb_typeof(v)='object' then
    result:='{}';
    for k,item in select key,value from jsonb_each(v) loop
      if k in ('__proto__','constructor','prototype') then continue; end if;
      if jsonb_typeof(v->'features')='array' and k='totalCost' then continue; end if;
      if v->>'source'='grouped' and k=any(array['laborCost','materialCost','totalCost',
        'groupedPricePerSqft','groupedAddonUnitPrice','groupedPricingMode']) then continue; end if;
      if not explicit and k=any(array['price','basePrice','addCost1','addCost2','addCost3','unitPrice','cost',
        'totalCost','total','subtotal','taxAmount','taxRate','percentIncrease','overheadMultiplier',
        'fiberglassModelPrice','spaFiberglassModelPrice','fiberglassCraneCost','raisedSpaFacingCost',
        'totalRBBSqft','totalRaisedBondBeamSqft','hasBeenEdited']) then continue; end if;
      result:=result||jsonb_build_object(k,public.collab_input_value(item,explicit or k=any(array[
        'customOptions','customFeatures','manualAdjustments','retailAdjustments','contractOverrides'])));
    end loop;
    return result;
  end if;
  return v;
end $$;

create or replace function public.collab_input_fields(v jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,public.collab_input_value(value,key=any(array[
    'customFeatures','manualAdjustments','retailAdjustments','contractOverrides']))),'{}')
  from jsonb_each(v) where key=any(array['customerInfo','poolSpecs','excavation','plumbing','electrical',
    'tileCopingDecking','drainage','equipment','waterFeatures','customFeatures','masonry','interiorFinish',
    'manualAdjustments','retailAdjustments','notes','contractOverrides','warrantySections']);
$$;

-- Match mergeContribution: recurse into objects, treat arrays atomically, retain
-- current values for unchanged fields and unresolved concurrent edits.
create or replace function public.collab_merge_input(b jsonb,w jsonb,c jsonb,resolutions jsonb,path text default '')
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; k text; val jsonb;
begin
  if b is not distinct from w then return c; end if;
  if jsonb_typeof(b)='object' and jsonb_typeof(w)='object' and jsonb_typeof(c)='object' then
    result:=c;
    for k in select key from jsonb_object_keys(b||w) as x(key) loop
      if k in ('__proto__','constructor','prototype') then continue; end if;
      val:=public.collab_merge_input(b->k,w->k,c->k,resolutions,case when path='' then k else path||'.'||k end);
      if val is null then result:=result-k; else result:=result||jsonb_build_object(k,val); end if;
    end loop;
    return result;
  end if;
  if c is distinct from b and c is distinct from w and coalesce(resolutions->>path,'owner')<>'contributor' then return c; end if;
  return w;
end $$;

create or replace function public.collab_begin_work(p_number text,p_test boolean,p_version text,p_expected bigint)
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

create or replace function public.collab_save_work_v2(p_request uuid,p_test boolean,p_work jsonb,
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

-- Old clients cannot bypass a captured baseline or import stored derived totals.
create or replace function public.collab_save_work(p_number text,p_test boolean,p_version text,
  p_work jsonb,p_submit boolean default false,p_note text default null)
returns uuid language plpgsql set search_path='' as $$
begin raise exception 'UPGRADE_REQUIRED: Reopen this proposal in the updated sharing client'; end $$;

-- Approval accepts an OWNER-calculated result bound to a fresh current snapshot.
-- Contributor outputs are never used here. The SQL merge validates the input
-- changes independently; financial calculation lives in the owner's canonical engine.
create or replace function public.collab_apply_review(p_request uuid,p_test boolean,p_expected bigint,
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

revoke all on function public.collab_begin_work(text,boolean,text,bigint),
  public.collab_save_work_v2(uuid,boolean,jsonb,timestamptz,boolean,text),
  public.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.collab_begin_work(text,boolean,text,bigint),
  public.collab_save_work_v2(uuid,boolean,jsonb,timestamptz,boolean,text),
  public.collab_apply_review(uuid,boolean,bigint,timestamptz,jsonb,jsonb) to authenticated;
revoke all on function public.collab_input_value(jsonb,boolean),public.collab_input_fields(jsonb),
  public.collab_merge_input(jsonb,jsonb,jsonb,jsonb,text) from public,anon;
grant execute on function public.collab_input_value(jsonb,boolean),public.collab_input_fields(jsonb),
  public.collab_merge_input(jsonb,jsonb,jsonb,jsonb,text) to authenticated;

-- Owner-save and decision compatibility definitions follow below.


create or replace function public.collab_content_signature(p_proposal jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('versionId',coalesce(v.value->>'versionId','original'),
   'versionName',v.value->>'versionName','body',public.collab_mutable_version_fields(v.value),
   'pricingModelId',v.value->'pricingModelId','pricingModelRevisionId',v.value->'pricingModelRevisionId',
   'pricingModelFranchiseId',v.value->'pricingModelFranchiseId','pricingTierId',v.value->'pricingTierId',
   'pricingRevisionReview',v.value->'pricingRevisionReview','contractRevisionReview',v.value->'contractRevisionReview',
   'historicalPricingAdjustment',v.value->'historicalPricingAdjustment','pricingEngineVersion',v.value->'pricingEngineVersion',
   'contractTemplateRevisionId',v.value->'contractTemplateRevisionId') order by coalesce(v.value->>'versionId','original')),'[]')
 from jsonb_array_elements(jsonb_build_array(p_proposal-'versions')||coalesce(p_proposal->'versions','[]')) v(value);
$$;

create or replace function public.collab_owner_save(p_number text,p_test boolean,p_expected bigint,
  p_proposal jsonb,p_status text,p_submit_confirmed boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_row record; v_table text; v_pending integer; v_rec record;
  v_old_version jsonb; v_new_version jsonb; v_is_submission boolean;
  v_is_owner boolean; v_is_reviewer boolean; v_content_changed boolean;
begin
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select * from public.%I where proposal_number=$1 for update',v_table) into v_row using p_number;
  if v_row is null or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid())
    or v_row.content_revision is distinct from p_expected or not v_row.collaboration_enabled then
    raise exception 'COLLAB_CONFLICT: reopen the latest proposal before saving'; end if;
  v_is_owner:=coalesce(v_row.owner_auth_user_id=auth.uid(),false);
  v_is_reviewer:=not v_is_owner and lower(coalesce(v_row.status,'draft'))<>'draft'
    and case when p_test then public.current_test_account_role() in ('owner','admin','bookkeeper')
      else not public.current_user_is_master() and public.current_user_can_review_franchise(v_row.franchise_id) end;
  if not v_is_owner and not v_is_reviewer then raise exception 'Owner or authorized reviewer required'; end if;
  if p_proposal is null or jsonb_typeof(p_proposal)<>'object'
    or p_proposal->>'proposalNumber' is distinct from p_number
    or p_status is null or p_status not in
      ('draft','submitted','approved','signed','needs_approval','changes_requested','completed')
    or p_proposal->>'status' is distinct from p_status
    or p_proposal->>'franchiseId' is distinct from v_row.franchise_id
    or p_proposal->>'designerAuthUserId' is distinct from v_row.proposal_json->>'designerAuthUserId'
    or p_proposal->>'designerName' is distinct from v_row.proposal_json->>'designerName'
    or p_proposal->>'designerRole' is distinct from v_row.proposal_json->>'designerRole'
    or p_proposal->>'designerCode' is distinct from v_row.proposal_json->>'designerCode'
    or p_proposal->>'versionId' is distinct from v_row.proposal_json->>'versionId'
    or p_proposal->>'createdDate' is distinct from v_row.proposal_json->>'createdDate' then
    raise exception 'Protected proposal identity changed'; end if;
  if not public.collab_history_preserved(v_row.proposal_json,p_proposal) then
    raise exception 'Historical workflow attribution cannot change'; end if;
  -- Saved immutable versions must survive bit for bit. A new addendum draft
  -- may be appended, but existing signed/completed versions cannot be edited.
  for v_old_version in select value from jsonb_array_elements(
    jsonb_build_array(v_row.proposal_json - 'versions') || coalesce(v_row.proposal_json->'versions','[]'::jsonb)) loop
    select value into v_new_version from jsonb_array_elements(
      jsonb_build_array(p_proposal - 'versions') || coalesce(p_proposal->'versions','[]'::jsonb))
      where coalesce(value->>'versionId','original')=coalesce(v_old_version->>'versionId','original') limit 1;
    if v_new_version is null then
      if v_is_reviewer or lower(coalesce(v_old_version->>'status','draft')) in ('signed','completed')
        or coalesce((v_old_version->>'versionLocked')::boolean,false) then
        raise exception 'Protected version cannot be removed'; end if;
      continue;
    end if;
    if v_new_version->>'proposalNumber' is distinct from v_old_version->>'proposalNumber'
      or v_new_version->>'createdDate' is distinct from v_old_version->>'createdDate'
      or v_new_version->>'designerAuthUserId' is distinct from v_old_version->>'designerAuthUserId'
      or v_new_version->>'designerName' is distinct from v_old_version->>'designerName'
      or v_new_version->>'designerRole' is distinct from v_old_version->>'designerRole'
      or v_new_version->>'designerCode' is distinct from v_old_version->>'designerCode'
      or not public.collab_history_preserved(v_old_version,v_new_version) then
      raise exception 'Historical version attribution cannot change'; end if;
    if v_is_reviewer then
      if v_new_version is null or public.collab_mutable_version_fields(v_old_version)
        is distinct from public.collab_mutable_version_fields(v_new_version)
        or v_new_version->>'pricingModelRevisionId' is distinct from v_old_version->>'pricingModelRevisionId'
        or v_new_version->>'pricingModelId' is distinct from v_old_version->>'pricingModelId'
        or v_new_version->>'pricingModelFranchiseId' is distinct from v_old_version->>'pricingModelFranchiseId'
        or v_new_version->>'pricingTierId' is distinct from v_old_version->>'pricingTierId'
        or v_new_version->'pricingRevisionReview' is distinct from v_old_version->'pricingRevisionReview'
        or v_new_version->'contractRevisionReview' is distinct from v_old_version->'contractRevisionReview'
        or v_new_version->>'contractTemplateId' is distinct from v_old_version->>'contractTemplateId'
        or v_new_version->>'pricingEngineVersion' is distinct from v_old_version->>'pricingEngineVersion'
        or v_new_version->'historicalPricingAdjustment' is distinct from v_old_version->'historicalPricingAdjustment'
        or v_new_version->>'contractTemplateRevisionId' is distinct from v_old_version->>'contractTemplateRevisionId' then
        raise exception 'Reviewer may only change workflow state'; end if;
    end if;
    if lower(coalesce(v_old_version->>'status','draft')) in ('signed','completed')
      or coalesce((v_old_version->>'versionLocked')::boolean,false) then
      if v_new_version is null or public.collab_immutable_version_content(v_old_version)
        is distinct from public.collab_immutable_version_content(v_new_version)
        or (lower(coalesce(v_old_version->>'status','draft'))='completed'
          and lower(coalesce(v_new_version->>'status','draft'))<>'completed')
        or (lower(coalesce(v_old_version->>'status','draft'))='signed'
          and lower(coalesce(v_new_version->>'status','draft')) not in ('signed','completed'))
        or not coalesce((v_new_version->>'versionLocked')::boolean,false)
        or (v_old_version->>'versionSubmittedAt' is not null
          and v_new_version->>'versionSubmittedAt' is distinct from v_old_version->>'versionSubmittedAt')
        or (v_old_version->'versionSubmittedBy' is not null
          and v_new_version->'versionSubmittedBy' is distinct from v_old_version->'versionSubmittedBy')
        or (coalesce(v_old_version->>'versionId','original')
              is distinct from coalesce(v_row.proposal_json->>'versionId','original')
          and ((v_old_version->'workflow'->'signedBy' is not null
              and v_new_version->'workflow'->'signedBy' is distinct from v_old_version->'workflow'->'signedBy')
            or (v_old_version->'workflow'->'completedBy' is not null
              and v_new_version->'workflow'->'completedBy' is distinct from v_old_version->'workflow'->'completedBy'))) then
        raise exception 'Signed or completed version cannot change'; end if;
    end if;
  end loop;
  if v_is_reviewer and jsonb_array_length(coalesce(p_proposal->'versions','[]'::jsonb))
    <> jsonb_array_length(coalesce(v_row.proposal_json->'versions','[]'::jsonb)) then
    raise exception 'Reviewer may not add or remove versions'; end if;
  select count(*) into v_pending from public.proposal_collaboration_requests
    where proposal_number=p_number and is_test=p_test and status='submitted';
  v_is_submission := (lower(coalesce(v_row.status,'draft'))='draft' and lower(coalesce(p_status,''))<>'draft')
    or (p_proposal->'workflow'->>'submittedAt' is distinct from v_row.proposal_json->'workflow'->>'submittedAt'
      and nullif(p_proposal->'workflow'->>'submittedAt','') is not null);
  if v_is_submission and v_pending>0 and not p_submit_confirmed then
    raise exception 'PENDING_CHANGES: confirm submission will supersede contributor requests'; end if;
  v_content_changed:=public.collab_content_signature(p_proposal)
    is distinct from public.collab_content_signature(v_row.proposal_json);
  perform set_config('app.collaboration_authorized','yes',true);
  execute format('update public.%I set proposal_json=$2,status=$3,content_revision=content_revision+$6,updated_at=now(),last_modified=now(),pricing_model_id=$4,pricing_model_name=$5 where proposal_number=$1',v_table)
    using p_number,p_proposal,p_status,p_proposal->>'pricingModelId',p_proposal->>'pricingModelName',
      case when v_content_changed then 1 else 0 end;
  if v_is_submission and v_pending>0 then
    for v_rec in select id,contributor_id from public.proposal_collaboration_requests
      where proposal_number=p_number and is_test=p_test and status='submitted' loop
      perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),v_rec.contributor_id,'changes_superseded',v_rec.id);
    end loop;
    update public.proposal_collaboration_requests set status='superseded',updated_at=now(),decided_at=now(),decided_by=auth.uid()
      where proposal_number=p_number and is_test=p_test and status='submitted';
  end if;
  if v_is_submission then
    for v_rec in select id,contributor_id from public.proposal_collaboration_requests
      where proposal_number=p_number and is_test=p_test
        and status in ('working','submitted','revision_requested') loop
      perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),v_rec.contributor_id,
        case when v_is_submission then 'changes_superseded' else 'changes_outdated' end,v_rec.id);
    end loop;
    update public.proposal_collaboration_requests set
      status=case when v_is_submission then 'superseded' else 'stale' end,
      updated_at=now(),decided_at=now(),decided_by=auth.uid()
      where proposal_number=p_number and is_test=p_test
        and status in ('working','submitted','revision_requested');
  end if;
  return v_row.content_revision+case when v_content_changed then 1 else 0 end;
end;
$$;
create or replace function public.collab_decide_request(p_request uuid,p_test boolean,p_action text,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req record; v_row record; v_table text; v_new jsonb; v_current jsonb; v_share record;
begin
  select * into v_req from public.proposal_collaboration_requests where id=p_request and is_test=p_test;
  if v_req is null then raise exception 'Request not found'; end if;
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select proposal_json,content_revision,franchise_id,owner_auth_user_id,status from public.%I where proposal_number=$1 for update',v_table)
    into v_row using v_req.proposal_number;
  select * into v_req from public.proposal_collaboration_requests where id=p_request and is_test=p_test for update;
  if v_row is null or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid()) then
    raise exception 'Access denied'; end if;
  if p_action='withdraw' then
    if auth.uid()<>v_req.contributor_id or v_req.status<>'submitted' then raise exception 'Cannot withdraw request'; end if;
    update public.proposal_collaboration_requests set status='withdrawn',updated_at=now(),decided_at=now(),decided_by=auth.uid()
      where id=p_request;
    perform public.collab_emit(v_req.proposal_number,v_row.franchise_id,p_test,auth.uid(),v_row.owner_auth_user_id,'changes_withdrawn',p_request);
    return;
  end if;
  if auth.uid() is distinct from v_row.owner_auth_user_id or v_req.status<>'submitted'
    or p_action is null or p_action not in ('apply','decline','revisions') then
    raise exception 'Owner review required'; end if;
  if p_action='revisions' and nullif(trim(p_note),'') is null then
    raise exception 'A revision note is required'; end if;
  if p_action='apply' then raise exception 'UPGRADE_REQUIRED: Open the current pricing comparison before applying changes'; end if;

    update public.proposal_collaboration_requests set status=case when p_action='decline' then 'declined' else 'revision_requested' end,
      owner_note=nullif(trim(p_note),''),updated_at=now(),decided_at=now(),decided_by=auth.uid()
      where id=p_request;
    perform public.collab_emit(v_req.proposal_number,v_row.franchise_id,p_test,auth.uid(),v_req.contributor_id,
      case when p_action='decline' then 'changes_declined' else 'revisions_requested' end,p_request,p_note);
end;
$$;
commit;
notify pgrst, 'reload schema';
