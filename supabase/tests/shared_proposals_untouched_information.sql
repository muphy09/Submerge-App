-- Staging/isolated database only. Supply test.preservation.request (an existing
-- disposable QA request) and test.preservation.prepared (browser engine output)
-- in this SAME transaction. Everything, including the clone, rolls back.
begin;
do $$
declare q public.proposal_collaboration_requests; r public.franchise_proposals;
  n text:='PROP-PRESERVATION-'||gen_random_uuid(); p jsonb;
begin
  select * into strict q from public.proposal_collaboration_requests
    where id=current_setting('test.preservation.request')::uuid;
  select * into strict r from public.franchise_proposals where proposal_number=q.proposal_number;
  if q.is_test or q.target_version_id<>'original' then raise exception 'Use an original-version staging QA request'; end if;
  p:=r.proposal_json||jsonb_build_object('proposalNumber',n);
  -- Include a sibling to verify that version-scoped approval cannot rewrite it.
  p:=jsonb_set(p,'{versions}',jsonb_build_array(p||'{"versionId":"preservation-sibling","versions":[]}'::jsonb));
  perform set_config('app.collaboration_authorized','yes',true);
  insert into public.franchise_proposals(proposal_number,franchise_id,designer_auth_user_id,designer_name,
    owner_auth_user_id,status,proposal_json,collaboration_enabled)
    values(n,r.franchise_id,r.designer_auth_user_id,r.designer_name,r.owner_auth_user_id,r.status,p,true);
  perform set_config('app.collaboration_authorized','no',true);
  perform set_config('test.preservation.number',n,true);
  perform set_config('test.preservation.owner',r.owner_auth_user_id::text,true);
  perform set_config('test.preservation.contributor',q.contributor_id::text,true);
  perform set_config('test.preservation.work',(q.working_version_json||jsonb_build_object('proposalNumber',n))::text,true);
end $$;
set local role authenticated;
do $$
declare n text:=current_setting('test.preservation.number'); p jsonb; q jsonb; approved jsonb; expected jsonb;
  rev bigint; k text; result jsonb:=current_setting('test.preservation.prepared')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('test.preservation.owner'),true);
  perform public.collab_manage_share(n,false,current_setting('test.preservation.contributor')::uuid,'contribute',null);
  perform set_config('app.collaboration_authorized','no',true);
  select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
  perform set_config('request.jwt.claim.sub',current_setting('test.preservation.contributor'),true);
  q:=public.collab_begin_work(n,false,'original',rev);
  q:=public.collab_save_work_v2((q->>'id')::uuid,false,current_setting('test.preservation.work')::jsonb,
    (q->>'updated_at')::timestamptz,true,'Perimeter only');
  if (select proposal_json from public.franchise_proposals where proposal_number=n) is distinct from p then
    raise exception 'Contributor save changed the owner'; end if;
  result:=jsonb_set(result,'{after,proposalNumber}',to_jsonb(n));
  perform set_config('request.jwt.claim.sub',current_setting('test.preservation.owner'),true);
  perform public.collab_apply_review((q->>'id')::uuid,false,rev,(q->>'updated_at')::timestamptz,
    result->'after',result->'resolutions');
  select proposal_json into strict approved from public.franchise_proposals where proposal_number=n;
  expected:=jsonb_set(p,'{poolSpecs,perimeter}','25');
  foreach k in array array['customerInfo','poolSpecs','excavation','plumbing','electrical','tileCopingDecking',
    'drainage','equipment','waterFeatures','customFeatures','masonry','interiorFinish','manualAdjustments',
    'retailAdjustments','notes','contractOverrides','warrantySections','versions','pricingModelId',
    'pricingModelRevisionId','pricingModelFranchiseId','pricingTierId'] loop
    if approved->k is distinct from expected->k then raise exception 'Unintended persisted change: %',k; end if;
  end loop;
  if approved->'totalCost'<>'64660'::jsonb then raise exception 'Unexpected approved total'; end if;
  if (select content_revision from public.franchise_proposals where proposal_number=n)<>rev+1 then
    raise exception 'Approval must commit exactly one revision'; end if;
  perform set_config('test.preservation.result','Authenticated save/apply/reopen preserved all untouched information and sibling; total 64660',true);
end $$;
reset role;
select current_setting('test.preservation.result') as result;
rollback;
