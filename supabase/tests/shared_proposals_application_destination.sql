-- STAGING ONLY. Supply test.destination.request (QA donor request UUID) and
-- test.destination.prepared (credential-free browser review JSON) in this same
-- transaction. Disposable clones exercise both destinations; all data rolls back.
begin;
do $$
declare donor public.proposal_collaboration_requests; baseline jsonb; donor_owner uuid;
  p jsonb; alt jsonb; cases jsonb:='[]'; n text; target text; destination text;
begin
  select * into strict donor from public.proposal_collaboration_requests
    where id=current_setting('test.destination.request')::uuid;
  select owner_auth_user_id into strict donor_owner from public.franchise_proposals where proposal_number=donor.proposal_number;
  baseline:=current_setting('test.destination.prepared')::jsonb->'before';
  foreach target in array array['original','alternate','signed-addendum'] loop
    foreach destination in array array['new-draft','overwrite'] loop
      n:='PROP-DESTINATION-'||gen_random_uuid();
      p:=(baseline-'versions')||jsonb_build_object('proposalNumber',n,'versionId','original',
        'activeVersionId','original','versionLocked',false,'status','draft','workflow',jsonb_build_object('status','draft'));
      alt:=p||jsonb_build_object('versionId','alternate','versionName','Alternate','versions','[]'::jsonb);
      p:=jsonb_set(p,'{versions}',jsonb_build_array(alt));
      if target='signed-addendum' then
        p:=p||'{"versionLocked":true,"status":"signed","workflow":{"status":"signed","signedVersionId":"original","signedAt":"2026-10-27T12:00:00Z"}}'::jsonb;
      end if;
      perform set_config('app.collaboration_authorized','yes',true);
      insert into public.franchise_proposals(proposal_number,franchise_id,designer_auth_user_id,designer_name,
        owner_auth_user_id,status,proposal_json,collaboration_enabled)
        values(n,donor.franchise_id,(baseline->>'designerAuthUserId')::uuid,baseline->>'designerName',
          donor_owner,p->>'status',p,true);
      cases:=cases||jsonb_build_array(jsonb_build_object('number',n,'target',case when target='original' then 'original' else 'alternate' end,
        'destination',destination,'owner',donor_owner,'contributor',donor.contributor_id));
    end loop;
  end loop;
  perform set_config('app.collaboration_authorized','no',true);
  perform set_config('test.destination.cases',cases::text,true);
end $$;
set local role authenticated;
do $$
declare item jsonb; n text; target text; destination text; p jsonb; work jsonb; q jsonb; rev bigint;
  prepared jsonb:=current_setting('test.destination.prepared')::jsonb;
  response jsonb; after_json jsonb; result_version jsonb; source jsonb; stored record; failed boolean;
  result_id text; k text; passed integer:=0;
begin
  for item in select value from jsonb_array_elements(current_setting('test.destination.cases')::jsonb) loop
    n:=item->>'number'; target:=item->>'target'; destination:=item->>'destination';
    perform set_config('request.jwt.claim.sub',item->>'owner',true);
    perform public.collab_manage_share(n,false,(item->>'contributor')::uuid,'contribute',null);
    perform set_config('app.collaboration_authorized','no',true);
    select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
    if target='original' then source:=p;
    else select value into strict source from jsonb_array_elements(p->'versions') where value->>'versionId'=target; end if;
    work:=prepared->'after'||jsonb_build_object('proposalNumber',n,'versionId',target);
    perform set_config('request.jwt.claim.sub',item->>'contributor',true);
    q:=public.collab_begin_work(n,false,target,rev);
    q:=public.collab_save_work_v2((q->>'id')::uuid,false,work,(q->>'updated_at')::timestamptz,true,'Review destinations');
    failed:=false;
    begin
      perform public.collab_apply_review_v3((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,work,prepared->'resolutions',destination);
    exception when others then failed:=true; end;
    if not failed then raise exception 'Contributor could approve'; end if;
    perform set_config('request.jwt.claim.sub',item->>'owner',true);
    failed:=false;
    begin
      perform public.collab_apply_review_v3((q->>'id')::uuid,false,rev+1,(q->>'updated_at')::timestamptz,work,prepared->'resolutions',destination);
    exception when others then failed:=true; end;
    if not failed then raise exception 'Stale review applied'; end if;
    failed:=false;
    begin
      perform public.collab_apply_review_v3((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,work,prepared->'resolutions','invalid');
    exception when others then failed:=true; end;
    if not failed then raise exception 'Invalid destination applied'; end if;
    response:=public.collab_apply_review_v3((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,work,prepared->'resolutions',destination);
    result_id:=response->>'versionId';
    select proposal_json into strict after_json from public.franchise_proposals where proposal_number=n;
    if destination='new-draft' then
      if result_id=target or jsonb_array_length(after_json->'versions')<>jsonb_array_length(p->'versions')+1 then
        raise exception 'New draft missing'; end if;
      if (after_json-array['versions','activeVersionId','lastModified']) is distinct from (p-array['versions','activeVersionId','lastModified'])
        or (after_json->'versions'->0) is distinct from (p->'versions'->0) then raise exception 'Source or sibling changed'; end if;
      select value into strict result_version from jsonb_array_elements(after_json->'versions') where value->>'versionId'=result_id;
      if result_version->>'status'<>'draft' or result_version->>'versionSourceId'<>target
        or (result_version->>'versionLocked')::boolean or result_version->'workflow'<>'{"status":"draft"}'::jsonb
        or result_version->>'createdDate'=source->>'createdDate' then raise exception 'Invalid new draft lifecycle'; end if;
    else
      if result_id<>target or jsonb_array_length(after_json->'versions')<>jsonb_array_length(p->'versions') then raise exception 'Overwrite created a version'; end if;
      if target='original' then result_version:=after_json;
      else select value into strict result_version from jsonb_array_elements(after_json->'versions') where value->>'versionId'=target; end if;
      if target='alternate' and (after_json-array['versions','lastModified']) is distinct from (p-array['versions','lastModified']) then
        raise exception 'Alternate overwrite changed original'; end if;
      if target='original' and after_json->'versions' is distinct from p->'versions' then raise exception 'Overwrite changed sibling'; end if;
    end if;
    if public.collab_input_fields(result_version) is distinct from public.collab_input_fields(work)
      or result_version->'pricingModelRevisionId' is distinct from source->'pricingModelRevisionId' then raise exception 'Reviewed inputs/pricing changed'; end if;
    foreach k in array array['costBreakdown','pricing','papDiscounts','totalCost','subtotal','taxRate','taxAmount'] loop
      if result_version->k is distinct from work->k then raise exception 'Reviewed financial output changed: %',k; end if;
    end loop;
    select * into strict stored from public.proposal_collaboration_requests where id=(q->>'id')::uuid;
    if stored.status<>'applied' or stored.application_mode<>destination or stored.applied_version_id<>result_id
      or stored.pre_apply_proposal_json is distinct from p or stored.post_apply_proposal_json is distinct from after_json then
      raise exception 'Approval history inconsistent'; end if;
    failed:=false;
    begin
      perform public.collab_apply_review_v3((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,work,prepared->'resolutions',destination);
    exception when others then failed:=true; end;
    if not failed then raise exception 'Duplicate approval applied'; end if;
    perform public.collab_restore((q->>'id')::uuid,false);
    if (select proposal_json-array['lastModified'] from public.franchise_proposals where proposal_number=n)
      is distinct from (p-array['lastModified']) then raise exception 'Restore did not restore source/versions'; end if;
    passed:=passed+1;
  end loop;
  perform set_config('test.destination.result',passed||' destination scenarios passed with authorization/stale/duplicate/history/restore checks',true);
end $$;
reset role;
select current_setting('test.destination.result') as result;
rollback;
