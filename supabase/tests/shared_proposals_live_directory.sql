-- Verify the normal franchise-user directory, whose email column is citext.
-- All temporary identities, profiles, proposal data and shares are rolled back.
begin;

do $$
declare v_franchise text; v_owner uuid := gen_random_uuid(); v_recipient uuid := gen_random_uuid();
  v_number text := 'PROP-COLLAB-DIRECTORY-' || gen_random_uuid();
begin
  select id into v_franchise from public.franchises
    where is_active and deleted_at is null order by id limit 1;
  if v_franchise is null then raise exception 'An active franchise is required'; end if;
  insert into public.proposal_collaboration_rollout(franchise_id,live_enabled)
    values(v_franchise,true)
    on conflict(franchise_id) do update set live_enabled=true;
  insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
    values
      (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'collab-owner-' || v_owner || '@example.invalid',now(),now()),
      (v_recipient,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'collab-recipient-' || v_recipient || '@example.invalid',now(),now());
  insert into public.franchise_users(franchise_id,auth_user_id,email,name,role,is_active)
    values
      (v_franchise,v_owner,'collab-owner-' || v_owner || '@example.invalid','Directory Owner','designer',true),
      (v_franchise,v_recipient,'collab-recipient-' || v_recipient || '@example.invalid','Directory Recipient','designer',true);
  perform set_config('app.collaboration_authorized','yes',true);
  insert into public.franchise_proposals
    (proposal_number,franchise_id,designer_auth_user_id,designer_name,status,owner_auth_user_id,proposal_json)
    values(v_number,v_franchise,v_owner,'Directory Owner','draft',v_owner,
      jsonb_build_object('proposalNumber',v_number,'franchiseId',v_franchise,
        'versionId','original','status','draft','versions','[]'::jsonb));
  perform set_config('app.collaboration_authorized','no',true);
  perform set_config('test.collab.directory.number',v_number,true);
  perform set_config('test.collab.directory.owner',v_owner::text,true);
  perform set_config('test.collab.directory.recipient',v_recipient::text,true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.collab.directory.owner'),true);
do $$
begin
  if not exists(select 1 from public.collab_recipient_directory(
    current_setting('test.collab.directory.number'),false)
    where user_id=current_setting('test.collab.directory.recipient')::uuid
      and display_name='Directory Recipient'
      and email like 'collab-recipient-%@example.invalid') then
    raise exception 'Same-franchise recipient was missing from directory'; end if;
  if not exists(select 1 from public.collab_people(
    current_setting('test.collab.directory.number'),false)
    where user_id=current_setting('test.collab.directory.owner')::uuid) then
    raise exception 'Proposal owner was missing from people directory'; end if;
end;
$$;

select public.collab_manage_share(current_setting('test.collab.directory.number'),false,
  current_setting('test.collab.directory.recipient')::uuid,'view',null);
do $$
begin
  if not exists(select 1 from public.collab_people(
    current_setting('test.collab.directory.number'),false)
    where user_id=current_setting('test.collab.directory.recipient')::uuid) then
    raise exception 'Shared recipient was missing from people directory'; end if;
end;
$$;

rollback;
