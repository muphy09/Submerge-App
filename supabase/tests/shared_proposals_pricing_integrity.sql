-- Configure test.integrity.owner, contributor, franchise, baseline inside the same
-- transaction before this script. Use staging or an isolated local database only.
begin;
do $$
declare baseline jsonb; p jsonb; v jsonb; n text; scenario text; cases jsonb:='[]';
  o uuid:=current_setting('test.integrity.owner')::uuid;
  f text:=current_setting('test.integrity.franchise');
begin
  select proposal_json into strict baseline from public.franchise_proposals
    where proposal_number=current_setting('test.integrity.baseline');
  if (baseline->>'totalCost')::numeric<=0 then raise exception 'A priced isolated baseline is required'; end if;
  foreach scenario in array array['accept','decline','repeat_revision','owner_unrelated','same_field',
    'nested','revoke','downgrade','lock','delete','old_client','stale_window','review_race',
    'duplicate_apply','restore_after_revision','submitted_lock','contributor_cannot_apply','pin_tamper',
    'accept_after_submit','decline_after_submit','revisions_after_accept','withdraw_after_revision',
    'reviewer_decline','reviewer_tier','reviewer_model','signed_baseline','restore_keeps_revision','new_version'] loop
    n:='PROP-INTEGRITY-'||gen_random_uuid();
    p:=(baseline-'versions')||jsonb_build_object('proposalNumber',n,'status','draft','versionLocked',false,
      'versionId','original','activeVersionId','original','versions','[]'::jsonb,'designerAuthUserId',o,
      'franchiseId',f,'workflow',jsonb_build_object('status','draft'));
    if scenario in ('nested','delete','signed_baseline') then
      v:=p||jsonb_build_object('versionId','alternate','versionName','Alternate','versions','[]'::jsonb);
      p:=jsonb_set(p,'{versions}',jsonb_build_array(v));
      if scenario='signed_baseline' then
        p:=p||'{"status":"signed","versionLocked":true,"workflow":{"status":"signed","signedVersionId":"original","signedAt":"2026-10-27T12:00:00Z"}}'::jsonb;
      end if;
    end if;
    perform set_config('app.collaboration_authorized','yes',true);
    insert into public.franchise_proposals(proposal_number,franchise_id,designer_auth_user_id,designer_name,
      owner_auth_user_id,status,proposal_json,collaboration_enabled)
      values(n,f,o,p->>'designerName',o,p->>'status',p,true);
    cases:=cases||jsonb_build_array(jsonb_build_object('scenario',scenario,'number',n));
  end loop;
  perform set_config('app.collaboration_authorized','no',true);
  perform set_config('test.integrity.cases',cases::text,true);
end $$;
set local role authenticated;
do $$
declare item jsonb; scenario text; n text; p jsonb; original jsonb; work jsonb; q jsonb; result jsonb;
  expected jsonb; resolutions jsonb; target text; rev bigint; failed boolean; status_now text; passed integer:=0;
  o uuid:=current_setting('test.integrity.owner')::uuid;
  u uuid:=current_setting('test.integrity.contributor')::uuid;
begin
  for item in select value from jsonb_array_elements(current_setting('test.integrity.cases')::jsonb) loop
    n:=item->>'number'; scenario:=item->>'scenario'; target:=case when scenario in ('nested','delete','signed_baseline') then 'alternate' else 'original' end;
    perform set_config('request.jwt.claim.sub',o::text,true);
    perform public.collab_manage_share(n,false,u,'contribute',null);
    perform set_config('app.collaboration_authorized','no',true);
    select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
    original:=p;
    perform set_config('request.jwt.claim.sub',u::text,true);
    q:=public.collab_begin_work(n,false,target,rev);
    work:=jsonb_set(q->'working_version_json','{customerInfo,city}','"Contributor city"');
    if scenario='old_client' then
      failed:=false;
      begin perform public.collab_save_work(n,false,target,work,true); exception when others then failed:=position('UPGRADE_REQUIRED' in SQLERRM)>0; end;
      if not failed then raise exception 'Old client bypassed the new protocol'; end if;
      passed:=passed+1; continue;
    elsif scenario='pin_tamper' then
      failed:=false;
      begin perform public.collab_save_work_v2((q->>'id')::uuid,false,
        work||'{"pricingModelRevisionId":"wrong-pin"}',(q->>'updated_at')::timestamptz,true);
        exception when others then failed:=position('protected pricing identity' in SQLERRM)>0; end;
      if not failed then raise exception 'Contributor changed the pricing pin'; end if;
      passed:=passed+1; continue;
    elsif scenario='stale_window' then
      perform public.collab_save_work_v2((q->>'id')::uuid,false,work,(q->>'updated_at')::timestamptz,false);
      failed:=false;
      begin perform public.collab_save_work_v2((q->>'id')::uuid,false,work,(q->>'updated_at')::timestamptz,true);
        exception when others then failed:=position('COLLAB_CONFLICT' in SQLERRM)>0; end;
      if not failed then raise exception 'Old tab overwrote a newer working copy'; end if;
      passed:=passed+1; continue;
    end if;
    -- Owner changes before the contributor's FIRST save are safe because the
    -- server captured this request's real base when editing began.
    if scenario in ('accept','decline','repeat_revision','owner_unrelated','same_field','restore_keeps_revision','new_version') then
      perform set_config('request.jwt.claim.sub',o::text,true);
      if scenario in ('accept','repeat_revision','restore_keeps_revision') then p:=p||'{"pricingModelRevisionId":"integrity-r2"}'::jsonb;
      elsif scenario='decline' then p:=p||'{"pricingRevisionReview":{"decision":"declined","latestRevisionId":"integrity-r2"}}'::jsonb;
      elsif scenario='owner_unrelated' then p:=jsonb_set(p,'{poolSpecs,maxWidth}','25');
      elsif scenario='new_version' then p:=jsonb_set(p,'{versions}',jsonb_build_array(p||'{"versionId":"new-version","versions":[]}'::jsonb));
      else p:=jsonb_set(p,'{customerInfo,city}','"Owner city"'); end if;
      rev:=public.collab_owner_save(n,false,rev,p,'draft',false);
      perform set_config('app.collaboration_authorized','no',true);
      if scenario='repeat_revision' then
        p:=p||'{"pricingModelRevisionId":"integrity-r3"}'::jsonb;
        rev:=public.collab_owner_save(n,false,rev,p,'draft',false);
        perform set_config('app.collaboration_authorized','no',true);
      end if;
      perform set_config('request.jwt.claim.sub',u::text,true);
    end if;
    -- Deliberately inconsistent contributor outputs must have no authority.
    work:=work||jsonb_build_object('totalCost',1,'pricing',jsonb_build_object('digCommissionRate',0.9));
    q:=public.collab_save_work_v2((q->>'id')::uuid,false,work,(q->>'updated_at')::timestamptz,true,'Preserve this note');
    if q->>'status'<>'submitted' then raise exception 'Contribution was lost during owner revision'; end if;
    if q->'base_version_json'->>'pricingModelRevisionId' is distinct from original->>'pricingModelRevisionId' then
      raise exception 'The original contributor baseline changed'; end if;
    perform set_config('request.jwt.claim.sub',o::text,true);
    if scenario='revoke' then perform public.collab_end_share(n,false,u);
    elsif scenario='downgrade' then perform public.collab_manage_share(n,false,u,'view',null);
    elsif scenario='lock' then
      p:=p||'{"versionLocked":true}'::jsonb; rev:=public.collab_owner_save(n,false,rev,p,'draft',false);
    elsif scenario='delete' then
      p:=jsonb_set(p,'{versions}','[]');
      rev:=public.collab_owner_save(n,false,rev,p,'draft',false);
    elsif scenario='submitted_lock' then
      p:=p||'{"status":"submitted","workflow":{"status":"submitted","submittedAt":"2026-10-27T22:00:00Z"}}'::jsonb;
      rev:=public.collab_owner_save(n,false,rev,p,'submitted',true);
    end if;
    if scenario in ('accept_after_submit','decline_after_submit','revisions_after_accept','withdraw_after_revision') then
      if scenario='withdraw_after_revision' then
        perform set_config('request.jwt.claim.sub',u::text,true);
        perform public.collab_decide_request((q->>'id')::uuid,false,'withdraw',null);
      end if;
      perform set_config('request.jwt.claim.sub',o::text,true);
      if scenario='revisions_after_accept' then
        perform public.collab_decide_request((q->>'id')::uuid,false,'revisions','Retain these edits after pricing review');
      end if;
      if scenario='decline_after_submit' then p:=p||'{"pricingRevisionReview":{"decision":"declined","latestRevisionId":"integrity-r2"}}'::jsonb;
      else p:=p||'{"pricingModelRevisionId":"integrity-r2"}'::jsonb; end if;
      rev:=public.collab_owner_save(n,false,rev,p,'draft',false);
      perform set_config('app.collaboration_authorized','no',true);
      if scenario in ('revisions_after_accept','withdraw_after_revision') then
        perform set_config('request.jwt.claim.sub',u::text,true);
        q:=public.collab_begin_work(n,false,target,rev);
        if q->>'contributor_note'<>'Preserve this note' then raise exception 'Contributor note lost'; end if;
        if scenario='revisions_after_accept' and q->>'owner_note'<>'Retain these edits after pricing review' then raise exception 'Owner revision note lost'; end if;
        q:=public.collab_save_work_v2((q->>'id')::uuid,false,work,(q->>'updated_at')::timestamptz,true,null);
      else
        select status into status_now from public.proposal_collaboration_requests where id=(q->>'id')::uuid;
        if status_now<>'submitted' then raise exception 'Pricing decision removed a submitted request'; end if;
      end if;
    elsif scenario in ('reviewer_decline','reviewer_tier','reviewer_model') then
      perform set_config('request.jwt.claim.sub',o::text,true);
      p:=p||'{"status":"needs_approval"}'::jsonb;
      rev:=public.collab_owner_save(n,false,rev,p,'needs_approval',true);
      perform set_config('app.collaboration_authorized','no',true);
      if scenario='reviewer_decline' then p:=p||'{"pricingRevisionReview":{"decision":"declined","latestRevisionId":"integrity-r2"}}'::jsonb;
      elsif scenario='reviewer_tier' then p:=p||'{"pricingTierId":"bronze"}'::jsonb;
      else p:=p||'{"pricingModelId":"unapproved-model"}'::jsonb; end if;
      perform set_config('request.jwt.claim.sub',u::text,true);
      failed:=false;
      begin perform public.collab_owner_save(n,false,rev,p,'needs_approval',false);
        exception when others then failed:=position('Reviewer may only change workflow state' in SQLERRM)>0; end;
      if not failed then raise exception 'Reviewer changed owner pricing metadata: %',scenario; end if;
      passed:=passed+1; continue;
    end if;
    perform set_config('request.jwt.claim.sub',o::text,true);
    perform set_config('app.collaboration_authorized','no',true);
    select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
    result:=case when scenario in ('lock','submitted_lock','delete') then original else p end;
    result:=case when target='original' then result else result->'versions'->0 end;
    resolutions:=case when scenario='same_field' then '{"customerInfo.city":"contributor"}'::jsonb else '{}'::jsonb end;
    expected:=public.collab_merge_input(public.collab_input_fields(q->'base_version_json'),public.collab_input_fields(work),
      public.collab_input_fields(result),resolutions);
    result:=result||expected;
    -- These SQL scenarios validate protocol/authorization/merging, not arithmetic.
    -- Financial outputs are provided by the OWNER here; app tests verify the engine.
    result:=result||jsonb_build_object('pricing',original->'pricing','totalCost',original->'totalCost');
    if scenario='contributor_cannot_apply' then perform set_config('request.jwt.claim.sub',u::text,true); end if;
    if scenario='review_race' then
      p:=jsonb_set(p,'{customerInfo,state}','"SC"');
      perform public.collab_owner_save(n,false,rev,p,'draft',false);
      perform set_config('app.collaboration_authorized','no',true);
    end if;
    failed:=false;
    begin perform public.collab_apply_review((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,result,resolutions);
      exception when others then
        if scenario in ('revoke','downgrade','lock','submitted_lock','contributor_cannot_apply','review_race','delete') then failed:=true;
        else raise; end if;
    end;
    if scenario in ('revoke','downgrade','lock','submitted_lock','contributor_cannot_apply','review_race','delete') then
      if not failed then raise exception 'Unsafe apply succeeded: %',scenario; end if;
      passed:=passed+1; continue;
    end if;
    select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
    result:=case when target='original' then p else p->'versions'->0 end;
    if result->'customerInfo'->>'city'<>'Contributor city' or result->>'totalCost'='1'
      or result->'pricing'->'digCommissionRate' is distinct from original->'pricing'->'digCommissionRate' then
      raise exception 'Contributor intent lost or financial outputs imported: %',scenario; end if;
    if scenario='owner_unrelated' and result->'poolSpecs'->>'maxWidth'<>'25' then raise exception 'Owner width overwritten'; end if;
    if scenario in ('accept','repeat_revision') and result->>'pricingModelRevisionId'<>(case when scenario='accept' then 'integrity-r2' else 'integrity-r3' end) then
      raise exception 'Owner revision overwritten'; end if;
    if scenario in ('nested','signed_baseline') and p-'versions'-'lastModified' is distinct from original-'versions'-'lastModified' then
      raise exception 'Sibling original changed'; end if;
    if scenario='duplicate_apply' then
      failed:=false;
      begin perform public.collab_apply_review((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,result,resolutions);
        exception when others then failed:=true; end;
      if not failed then raise exception 'Duplicate application succeeded'; end if;
    elsif scenario='restore_after_revision' then
      p:=p||'{"pricingRevisionReview":{"decision":"declined","latestRevisionId":"integrity-new"}}'::jsonb;
      perform public.collab_owner_save(n,false,rev,p,'draft',false);
      perform set_config('app.collaboration_authorized','no',true);
      failed:=false;
      begin perform public.collab_restore((q->>'id')::uuid,false); exception when others then failed:=true; end;
      if not failed then raise exception 'Restore overwrote a later pricing decision'; end if;
    end if;
    if scenario='new_version' and p->'versions'->0->>'versionId'<>'new-version' then raise exception 'New owner version was lost'; end if;
    if scenario='restore_keeps_revision' then
      perform public.collab_restore((q->>'id')::uuid,false);
      select proposal_json into strict p from public.franchise_proposals where proposal_number=n;
      if p->>'pricingModelRevisionId'<>'integrity-r2' or p->'customerInfo'->>'city'='Contributor city' then
        raise exception 'Restore changed the owner-selected revision or failed to restore inputs'; end if;
    end if;
    select status into status_now from public.proposal_collaboration_requests where id=(q->>'id')::uuid;
    if status_now<>'applied' then raise exception 'Expected applied request'; end if;
    passed:=passed+1;
  end loop;
  perform set_config('test.integrity.passed',passed::text,true);
end $$;
select current_setting('test.integrity.passed')::integer as passed_protocol_scenarios;
rollback;
