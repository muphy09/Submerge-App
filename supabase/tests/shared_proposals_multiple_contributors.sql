-- STAGING/ISOLATED DATABASE ONLY. Supply the same test.integrity settings as the
-- pricing-integrity suite. No login credentials are created; all fixtures roll back.
begin;
do $$
declare u uuid:=gen_random_uuid(); n text:='PROP-MULTI-INTEGRITY-'||gen_random_uuid(); p jsonb;
  o uuid:=current_setting('test.integrity.owner')::uuid; f text:=current_setting('test.integrity.franchise');
begin
  insert into auth.users(id,email,role,aud,created_at,updated_at)
    values(u,'collaboration-'||u||'@playwright.invalid','authenticated','authenticated',now(),now());
  insert into public.franchise_users(franchise_id,auth_user_id,email,name,role,is_active)
    values(f,u,'collaboration-'||u||'@playwright.invalid','Disposable contributor','designer',true);
  select proposal_json into strict p from public.franchise_proposals where proposal_number=current_setting('test.integrity.baseline');
  p:=(p-'versions')||jsonb_build_object('proposalNumber',n,'versions','[]'::jsonb,'status','draft',
    'versionId','original','activeVersionId','original','designerAuthUserId',o,'franchiseId',f,'workflow',jsonb_build_object('status','draft'));
  perform set_config('app.collaboration_authorized','yes',true);
  insert into public.franchise_proposals(proposal_number,franchise_id,designer_auth_user_id,designer_name,owner_auth_user_id,status,proposal_json,collaboration_enabled)
    values(n,f,o,p->>'designerName',o,'draft',p,true);
  perform set_config('app.collaboration_authorized','no',true);
  perform set_config('test.multi.user',u::text,true); perform set_config('test.multi.number',n,true);
end $$;
set local role authenticated;
do $$
declare o uuid:=current_setting('test.integrity.owner')::uuid; a uuid:=current_setting('test.integrity.contributor')::uuid;
  b uuid:=current_setting('test.multi.user')::uuid; n text:=current_setting('test.multi.number');
  qa jsonb; qb jsonb; p jsonb; wa jsonb; wb jsonb; result jsonb; inputs jsonb; rev bigint;
begin
  perform set_config('request.jwt.claim.sub',o::text,true);
  perform public.collab_manage_share(n,false,a,'contribute',null);
  perform public.collab_manage_share(n,false,b,'contribute',null);
  perform set_config('app.collaboration_authorized','no',true);
  select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
  perform set_config('request.jwt.claim.sub',a::text,true);
  qa:=public.collab_begin_work(n,false,'original',rev);
  wa:=jsonb_set(qa->'working_version_json','{customerInfo,city}','"Contributor A city"');
  qa:=public.collab_save_work_v2((qa->>'id')::uuid,false,wa,(qa->>'updated_at')::timestamptz,false);
  perform set_config('request.jwt.claim.sub',o::text,true);
  if exists(select 1 from public.proposal_collaboration_requests where id=(qa->>'id')::uuid) then
    raise exception 'Owner can read an unsent private working copy'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from public.proposal_collaboration_requests where id=(qa->>'id')::uuid) then
    raise exception 'Another contributor can read a private working copy'; end if;
  qb:=public.collab_begin_work(n,false,'original',rev);
  wb:=jsonb_set(qb->'working_version_json','{poolSpecs,maxWidth}','25');
  qb:=public.collab_save_work_v2((qb->>'id')::uuid,false,wb,(qb->>'updated_at')::timestamptz,true,'B width');
  perform set_config('request.jwt.claim.sub',a::text,true);
  qa:=public.collab_save_work_v2((qa->>'id')::uuid,false,wa,(qa->>'updated_at')::timestamptz,true,'A city');
  perform set_config('request.jwt.claim.sub',o::text,true);
  result:=p||public.collab_input_fields(wa);
  perform public.collab_apply_review((qa->>'id')::uuid,false,rev,(qa->>'updated_at')::timestamptz,result,'{}');
  perform set_config('app.collaboration_authorized','no',true);
  select proposal_json,content_revision into strict p,rev from public.franchise_proposals where proposal_number=n;
  if (select status from public.proposal_collaboration_requests where id=(qb->>'id')::uuid)<>'submitted' then
    raise exception 'Applying A discarded B pending changes'; end if;
  inputs:=public.collab_merge_input(public.collab_input_fields(qb->'base_version_json'),public.collab_input_fields(wb),public.collab_input_fields(p),'{}');
  result:=p||inputs;
  perform public.collab_apply_review((qb->>'id')::uuid,false,rev,(qb->>'updated_at')::timestamptz,result,'{}');
  perform set_config('app.collaboration_authorized','no',true);
  select proposal_json into strict p from public.franchise_proposals where proposal_number=n;
  if p->'customerInfo'->>'city'<>'Contributor A city' or p->'poolSpecs'->>'maxWidth'<>'25' then
    raise exception 'Multiple contributor edits did not survive independent approvals'; end if;
  perform set_config('test.multi.result','two independent contributors preserved; private drafts isolated',true);
end $$;
select current_setting('test.multi.result') as result;
rollback;
