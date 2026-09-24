begin;

create or replace function public.collab_save_work(p_number text,p_test boolean,p_version text,
  p_work jsonb,p_submit boolean default false,p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_row record; v_share record; v_request record; v_table text; v_base jsonb; v_id uuid;
begin
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select franchise_id,owner_auth_user_id,content_revision,proposal_json,status from public.%I where proposal_number=$1 for update',v_table)
    into v_row using p_number;
  if v_row is null or not public.collab_enabled(v_row.franchise_id,p_test)
    or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid())
    or lower(coalesce(v_row.status,'draft'))='completed' then raise exception 'Access denied or proposal completed'; end if;
  select * into v_share from public.proposal_collaboration_shares
    where proposal_number=p_number and is_test=p_test and recipient_id=auth.uid()
      and ended_at is null and permission='contribute';
  if v_share is null then raise exception 'Contributor access required'; end if;
  -- Locking the proposal row above serializes submissions across versions.
  if exists (select 1 from public.proposal_collaboration_requests
      where proposal_number=p_number and is_test=p_test and contributor_id=auth.uid()
        and status='submitted') then
    raise exception 'Submitted changes are pending review. Withdraw them before proposing more changes';
  end if;
  v_base:=public.collab_editable_version(v_row.proposal_json,p_version);
  if p_work is null or jsonb_typeof(p_work)<>'object' or p_work->>'proposalNumber' is distinct from p_number
    or coalesce(p_work->>'versionId','original') is distinct from p_version
    or p_work->>'pricingModelRevisionId' is distinct from v_base->>'pricingModelRevisionId'
    or p_work->>'pricingModelId' is distinct from v_base->>'pricingModelId'
    or p_work->>'designerAuthUserId' is distinct from v_base->>'designerAuthUserId' then
    raise exception 'Working copy changed protected proposal identity or pricing'; end if;
  if p_submit and public.collab_mutable_version_fields(p_work)=public.collab_mutable_version_fields(v_base) then
    raise exception 'Make at least one change before sending to the owner'; end if;
  select * into v_request from public.proposal_collaboration_requests
    where proposal_number=p_number and is_test=p_test and contributor_id=auth.uid()
      and target_version_id=p_version and status in ('working','submitted','revision_requested') for update;
  if v_request is not null and v_request.base_revision<>v_row.content_revision then
    raise exception 'STALE_REQUEST: refresh the latest draft before sending changes'; end if;
  if v_request is not null and v_request.status='submitted' then
    raise exception 'Submitted changes are frozen until withdrawn or reviewed'; end if;
  if v_request is null then
    insert into public.proposal_collaboration_requests
      (proposal_number,franchise_id,is_test,contributor_id,target_version_id,base_revision,
       base_version_json,working_version_json,status,contributor_note,submitted_at)
    values (p_number,v_row.franchise_id,p_test,auth.uid(),p_version,v_row.content_revision,
      v_base,p_work,case when p_submit then 'submitted' else 'working' end,
      nullif(trim(p_note),''),case when p_submit then now() else null end)
    returning id into v_id;
  else
    update public.proposal_collaboration_requests set working_version_json=p_work,
      status=case when p_submit then 'submitted' else 'working' end,
      contributor_note=nullif(trim(p_note),''),submitted_at=case when p_submit then now() else null end,
      updated_at=now() where id=v_request.id returning id into v_id;
  end if;
  if p_submit then
    perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),v_row.owner_auth_user_id,
      'changes_submitted',v_id,p_note);
  end if;
  return v_id;
end;
$$;

commit;
