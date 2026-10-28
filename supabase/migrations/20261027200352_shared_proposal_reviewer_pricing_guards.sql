begin;
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
commit;
notify pgrst, 'reload schema';
