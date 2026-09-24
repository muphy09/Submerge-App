-- Run only on an isolated database with two active franchises and all four
-- designated test personas. The transaction rolls back every fixture and setting.
begin;

do $$
declare v_franchise text; v_other text; v_owner uuid; v_admin uuid;
  v_designer uuid; v_bookkeeper uuid; v_number text;
begin
  select id into v_franchise from public.franchises where is_active and deleted_at is null order by id limit 1;
  select id into v_other from public.franchises
    where is_active and deleted_at is null and id<>v_franchise order by id limit 1;
  select auth_user_id into v_owner from public.app_test_accounts where role='owner' and is_active;
  select auth_user_id into v_admin from public.app_test_accounts where role='admin' and is_active;
  select auth_user_id into v_designer from public.app_test_accounts where role='designer' and is_active;
  select auth_user_id into v_bookkeeper from public.app_test_accounts where role='bookkeeper' and is_active;
  if v_franchise is null or v_other is null or v_owner is null or v_admin is null
    or v_designer is null or v_bookkeeper is null then
    raise exception 'Two active franchises and four test personas are required';
  end if;
  v_number := 'TEST-COLLAB-' || gen_random_uuid()::text;
  perform set_config('test.collab.franchise',v_franchise,true);
  perform set_config('test.collab.owner',v_owner::text,true);
  perform set_config('test.collab.admin',v_admin::text,true);
  perform set_config('test.collab.designer',v_designer::text,true);
  perform set_config('test.collab.bookkeeper',v_bookkeeper::text,true);
  perform set_config('test.collab.number',v_number,true);
  insert into public.proposal_collaboration_test_scope(auth_user_id,franchise_id)
    values (v_owner,v_franchise),(v_admin,v_franchise),(v_designer,v_franchise),
      (v_bookkeeper,v_other)
    on conflict (auth_user_id) do update set franchise_id=excluded.franchise_id;
  insert into public.proposal_collaboration_rollout(franchise_id,test_enabled)
    values (v_franchise,true) on conflict (franchise_id) do update set test_enabled=true;
  perform set_config('app.collaboration_authorized','yes',true);
  insert into public.franchise_test_proposals
    (proposal_number,franchise_id,designer_auth_user_id,designer_name,status,
     owner_auth_user_id,proposal_json)
    values (v_number,v_franchise,v_owner,'Isolated Test Owner','draft',v_owner,
      jsonb_build_object('proposalNumber',v_number,'franchiseId',v_franchise,
        'designerAuthUserId',v_owner,'designerName','Isolated Test Owner',
        'versionId','original','status','draft','poolSpecs',jsonb_build_object('poolLength',28),
        'createdDate','2026-09-23T00:00:00Z','versions','[]'::jsonb));
  perform set_config('app.collaboration_authorized','no',true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.collab.owner'),true);
do $$
declare v_denied boolean := false;
begin
  begin
    perform public.collab_manage_share(current_setting('test.collab.number'),true,
      current_setting('test.collab.bookkeeper')::uuid,'view',null);
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Cross-franchise test recipient was shared'; end if;
end;
$$;
select public.collab_manage_share(current_setting('test.collab.number'),true,
  current_setting('test.collab.designer')::uuid,'view','Review only');
select set_config('app.collaboration_authorized','no',true);

select set_config('request.jwt.claim.sub',current_setting('test.collab.designer'),true);
do $$
declare v_work jsonb; v_denied boolean := false;
begin
  if not exists (select 1 from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number')) then
    raise exception 'Named viewer could not read shared proposal'; end if;
  select proposal_json into v_work from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number');
  begin
    perform public.collab_save_work(current_setting('test.collab.number'),true,'original',v_work,true);
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Viewer could submit a working copy'; end if;
end;
$$;

select set_config('request.jwt.claim.sub',current_setting('test.collab.owner'),true);
select public.collab_manage_share(current_setting('test.collab.number'),true,
  current_setting('test.collab.designer')::uuid,'contribute',null);
select public.collab_manage_share(current_setting('test.collab.number'),true,
  current_setting('test.collab.admin')::uuid,'contribute',null);
select set_config('app.collaboration_authorized','no',true);
do $$
declare v_denied boolean := false;
begin
  begin
    update public.franchise_test_proposals set last_modified=now()
      where proposal_number=current_setting('test.collab.number');
  exception when others then
    v_denied := position('UPGRADE_REQUIRED' in SQLERRM)>0;
  end;
  if not v_denied then raise exception 'Legacy direct write was not rejected'; end if;
end;
$$;

select set_config('request.jwt.claim.sub',current_setting('test.collab.designer'),true);
do $$
declare v_work jsonb; v_request uuid;
begin
  select proposal_json into v_work from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number');
  v_work := jsonb_set(v_work,'{poolSpecs,poolLength}','32'::jsonb);
  v_request := public.collab_save_work(current_setting('test.collab.number'),true,'original',v_work,true);
  perform set_config('test.collab.designer_request',v_request::text,true);
  begin
    perform public.collab_save_work(current_setting('test.collab.number'),true,'second-version',v_work,false);
    raise exception 'A contributor saved another working copy while changes were submitted';
  exception when others then
    if position('Submitted changes are pending review' in SQLERRM)=0 then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub',current_setting('test.collab.admin'),true);
do $$
declare v_work jsonb; v_request uuid;
begin
  select proposal_json into v_work from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number');
  v_work := jsonb_set(v_work,'{poolSpecs,poolLength}','34'::jsonb);
  v_request := public.collab_save_work(current_setting('test.collab.number'),true,'original',v_work,true);
  perform set_config('test.collab.admin_request',v_request::text,true);
end;
$$;

select set_config('request.jwt.claim.sub',current_setting('test.collab.owner'),true);
select public.collab_decide_request(current_setting('test.collab.designer_request')::uuid,true,'apply',null);
do $$
begin
  if not exists (select 1 from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number') and content_revision=1
      and proposal_json->'poolSpecs'->>'poolLength'='32') then
    raise exception 'Applied request did not atomically update the owner draft'; end if;
  if not exists (select 1 from public.proposal_collaboration_requests
    where id=current_setting('test.collab.admin_request')::uuid and status='stale') then
    raise exception 'Other contributor request did not become stale'; end if;
end;
$$;
select public.collab_restore(current_setting('test.collab.designer_request')::uuid,true);
do $$
begin
  if not exists (select 1 from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number') and content_revision=2
      and proposal_json->'poolSpecs'->>'poolLength'='28') then
    raise exception 'Safe restoration did not recover the pre-application draft'; end if;
end;
$$;
select set_config('request.jwt.claim.sub',current_setting('test.collab.designer'),true);
do $$
declare v_work jsonb; v_request uuid;
begin
  select proposal_json into v_work from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number');
  v_work := jsonb_set(v_work,'{poolSpecs,poolLength}','36'::jsonb);
  v_request := public.collab_save_work(current_setting('test.collab.number'),true,'original',v_work,true);
  perform set_config('test.collab.pending_after_transfer',v_request::text,true);
end;
$$;

reset role;
update public.app_test_accounts set is_active=false
  where auth_user_id=current_setting('test.collab.owner')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.collab.admin'),true);
select public.collab_transfer_departed_owner(current_setting('test.collab.number'),true,
  current_setting('test.collab.admin')::uuid);
do $$
begin
  if not exists (select 1 from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number')
      and owner_auth_user_id=current_setting('test.collab.admin')::uuid
      and proposal_json->>'designerName'='Isolated Test Owner')
    or not exists (select 1 from public.proposal_collaboration_requests
      where id=current_setting('test.collab.pending_after_transfer')::uuid
        and status='submitted' and base_revision=2) then
    raise exception 'Explicit transfer changed historical attribution or current ownership incorrectly'; end if;
end;
$$;
select public.collab_end_share(current_setting('test.collab.number'),true,
  current_setting('test.collab.designer')::uuid);
select set_config('request.jwt.claim.sub',current_setting('test.collab.designer'),true);
do $$
begin
  if exists (select 1 from public.franchise_test_proposals
    where proposal_number=current_setting('test.collab.number'))
    or exists (select 1 from public.proposal_collaboration_requests
      where proposal_number=current_setting('test.collab.number')) then
    raise exception 'Revoked recipient retained proposal or working-copy read access'; end if;
end;
$$;

rollback;
