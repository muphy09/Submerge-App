-- Collaboration is dormant until a franchise is explicitly enabled. No proposal
-- JSON, signed version, or historical designer attribution is rewritten here.
begin;

alter table public.franchise_proposals
  add column if not exists owner_auth_user_id uuid references auth.users(id),
  add column if not exists content_revision bigint not null default 0,
  add column if not exists collaboration_enabled boolean not null default false;
alter table public.franchise_test_proposals
  add column if not exists owner_auth_user_id uuid references auth.users(id),
  add column if not exists content_revision bigint not null default 0,
  add column if not exists collaboration_enabled boolean not null default false;

-- The existing authenticated designer ID is verified ownership. Ambiguous
-- legacy rows remain unresolved and cannot enter collaboration.
update public.franchise_proposals set owner_auth_user_id = designer_auth_user_id
where owner_auth_user_id is null and designer_auth_user_id is not null;
update public.franchise_test_proposals set owner_auth_user_id = designer_auth_user_id
where owner_auth_user_id is null and designer_auth_user_id is not null;

create index if not exists franchise_proposals_current_owner_idx
  on public.franchise_proposals(franchise_id, owner_auth_user_id);
create index if not exists franchise_test_proposals_current_owner_idx
  on public.franchise_test_proposals(franchise_id, owner_auth_user_id);

create table public.proposal_collaboration_rollout (
  franchise_id text primary key references public.franchises(id) on delete cascade,
  live_enabled boolean not null default false,
  test_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.proposal_collaboration_rollout enable row level security;
revoke all on public.proposal_collaboration_rollout from public, anon, authenticated;
grant select on public.proposal_collaboration_rollout to authenticated;
create policy "read collaboration rollout for own franchise"
  on public.proposal_collaboration_rollout for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

-- Designated test personas are otherwise able to borrow configuration from
-- many franchises. Collaboration gives them one explicit test scope so a
-- named test share cannot cross franchise boundaries.
create table public.proposal_collaboration_test_scope (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  franchise_id text not null references public.franchises(id) on delete cascade
);
alter table public.proposal_collaboration_test_scope enable row level security;
revoke all on public.proposal_collaboration_test_scope from public,anon,authenticated;

create table public.proposal_collaboration_shares (
  id uuid primary key default gen_random_uuid(),
  proposal_number text not null,
  franchise_id text not null references public.franchises(id) on delete cascade,
  is_test boolean not null,
  recipient_id uuid not null references auth.users(id),
  permission text not null check (permission in ('view', 'contribute')),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users(id),
  check (is_test = (left(proposal_number, 5) = 'TEST-'))
);
create unique index proposal_collaboration_one_active_share
  on public.proposal_collaboration_shares(is_test, proposal_number, recipient_id)
  where ended_at is null;
create index proposal_collaboration_recipient_idx
  on public.proposal_collaboration_shares(recipient_id, is_test, ended_at);

create table public.proposal_collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  proposal_number text not null,
  franchise_id text not null references public.franchises(id) on delete cascade,
  is_test boolean not null,
  contributor_id uuid not null references auth.users(id),
  target_version_id text not null,
  base_revision bigint not null,
  base_version_json jsonb not null,
  working_version_json jsonb not null,
  status text not null default 'working' check (status in
    ('working', 'submitted', 'revision_requested', 'applied', 'declined', 'withdrawn', 'stale', 'superseded', 'access_ended')),
  contributor_note text,
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  pre_apply_proposal_json jsonb,
  post_apply_proposal_json jsonb,
  applied_revision bigint,
  restored_at timestamptz,
  restored_by uuid references auth.users(id),
  check (is_test = (left(proposal_number, 5) = 'TEST-'))
);
create unique index proposal_collaboration_one_open_request
  on public.proposal_collaboration_requests(is_test, proposal_number, contributor_id, target_version_id)
  where status in ('working', 'submitted', 'revision_requested');
create index proposal_collaboration_request_owner_idx
  on public.proposal_collaboration_requests(is_test, proposal_number, status, updated_at desc);

create table public.proposal_collaboration_events (
  id uuid primary key default gen_random_uuid(),
  proposal_number text not null,
  franchise_id text not null references public.franchises(id) on delete cascade,
  is_test boolean not null,
  actor_id uuid references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  event_type text not null,
  request_id uuid references public.proposal_collaboration_requests(id),
  note text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (is_test = (left(proposal_number, 5) = 'TEST-'))
);
create index proposal_collaboration_events_inbox_idx
  on public.proposal_collaboration_events(recipient_id, is_test, read_at, created_at desc);

alter table public.proposal_collaboration_shares enable row level security;
alter table public.proposal_collaboration_requests enable row level security;
alter table public.proposal_collaboration_events enable row level security;
revoke all on public.proposal_collaboration_shares,
  public.proposal_collaboration_requests,
  public.proposal_collaboration_events from public, anon, authenticated;
grant select on public.proposal_collaboration_shares,
  public.proposal_collaboration_requests,
  public.proposal_collaboration_events to authenticated;

create function public.collab_user_active(p_franchise text, p_test boolean, p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_test then exists (
    select 1 from public.app_test_accounts a where a.auth_user_id = p_actor and a.is_active
  ) and exists (
    select 1 from public.proposal_collaboration_test_scope scope
    where scope.auth_user_id=p_actor and scope.franchise_id=p_franchise
  ) and exists (
    select 1 from public.franchises f where f.id = p_franchise
      and coalesce(f.is_active,true) and f.deleted_at is null
  ) else exists (
    select 1 from public.franchise_users u
    where u.auth_user_id = p_actor and u.franchise_id = p_franchise and coalesce(u.is_active, true)
  ) and exists (
    select 1 from public.franchises f where f.id=p_franchise
      and coalesce(f.is_active,true) and f.deleted_at is null
  ) and not exists(select 1 from public.app_test_accounts a where a.auth_user_id=p_actor) end;
$$;

create function public.collab_actor_active(p_franchise text, p_test boolean, p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor=auth.uid() and public.collab_user_active(p_franchise,p_test,p_actor);
$$;

create function public.collab_current_owner(p_number text, p_test boolean)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid; v_franchise text;
begin
  if p_test then
    select owner_auth_user_id,franchise_id into v_owner,v_franchise
      from public.franchise_test_proposals where proposal_number = p_number;
  else
    select owner_auth_user_id,franchise_id into v_owner,v_franchise
      from public.franchise_proposals where proposal_number = p_number;
  end if;
  return case when v_owner=auth.uid()
    and public.collab_actor_active(v_franchise,p_test,auth.uid()) then v_owner else null end;
end;
$$;

create function public.collab_enabled(p_franchise text, p_test boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case when p_test then test_enabled else live_enabled end
    from public.proposal_collaboration_rollout where franchise_id = p_franchise), false);
$$;

create policy "shares visible to participants" on public.proposal_collaboration_shares
  for select to authenticated using (
    public.collab_actor_active(franchise_id, is_test, auth.uid())
    and (recipient_id = auth.uid() or public.collab_current_owner(proposal_number, is_test) = auth.uid())
  );
create policy "requests visible to participants" on public.proposal_collaboration_requests
  for select to authenticated using (
    public.collab_actor_active(franchise_id, is_test, auth.uid())
    and (public.collab_current_owner(proposal_number, is_test) = auth.uid()
      or (contributor_id = auth.uid() and exists (
        select 1 from public.proposal_collaboration_shares s
        where s.proposal_number=proposal_collaboration_requests.proposal_number
          and s.is_test=proposal_collaboration_requests.is_test
          and s.recipient_id=auth.uid() and s.ended_at is null)))
  );
create policy "events visible to recipient" on public.proposal_collaboration_events
  for select to authenticated using (
    recipient_id = auth.uid() and public.collab_actor_active(franchise_id, is_test, auth.uid())
  );

-- Existing proposal RLS still controls owners and reviewers. This additive
-- policy gives a named, active recipient read access only.
create policy "named collaboration recipient read" on public.franchise_proposals
  for select to authenticated using (
    exists (select 1 from public.proposal_collaboration_shares s
      where s.proposal_number = franchise_proposals.proposal_number
        and not s.is_test and s.ended_at is null and s.recipient_id = auth.uid()
        and s.franchise_id = franchise_proposals.franchise_id
        and public.collab_actor_active(s.franchise_id, false, auth.uid()))
  );
create policy "named test collaboration recipient read" on public.franchise_test_proposals
  for select to authenticated using (
    exists (select 1 from public.proposal_collaboration_shares s
      where s.proposal_number = franchise_test_proposals.proposal_number
        and s.is_test and s.ended_at is null and s.recipient_id = auth.uid()
        and s.franchise_id = franchise_test_proposals.franchise_id
        and public.collab_actor_active(s.franchise_id, true, auth.uid()))
  );

-- Ownership after an authorized transfer is determined by the new account ID.
-- Historical designer names/IDs remain attribution and cannot grant draft
-- access or write permission to the departed owner.
drop policy if exists "proposal_role_select" on public.franchise_proposals;
create policy "proposal_role_select" on public.franchise_proposals for select to authenticated using (
  (owner_auth_user_id=auth.uid() and public.collab_actor_active(franchise_id,false,auth.uid()))
  or ((owner_auth_user_id is null or (not collaboration_enabled
      and owner_auth_user_id=designer_auth_user_id)) and public.current_user_owns_proposal(
    franchise_id,designer_auth_user_id,designer_name,proposal_json))
  or (public.current_user_can_review_franchise(franchise_id)
    and lower(coalesce(status,proposal_json->>'status','draft'))<>'draft')
);
drop policy if exists "proposal_role_update" on public.franchise_proposals;
create policy "proposal_role_update" on public.franchise_proposals for update to authenticated using (
  (owner_auth_user_id=auth.uid() and public.collab_actor_active(franchise_id,false,auth.uid()))
  or ((owner_auth_user_id is null or (not collaboration_enabled
      and owner_auth_user_id=designer_auth_user_id)) and public.current_user_owns_proposal(
    franchise_id,designer_auth_user_id,designer_name,proposal_json))
  or (not public.current_user_is_master() and public.current_user_can_review_franchise(franchise_id)
    and lower(coalesce(status,proposal_json->>'status','draft'))<>'draft')
) with check (
  (owner_auth_user_id=auth.uid() and public.collab_actor_active(franchise_id,false,auth.uid()))
  or ((owner_auth_user_id is null or (not collaboration_enabled
      and owner_auth_user_id=designer_auth_user_id)) and public.current_user_owns_proposal(
    franchise_id,designer_auth_user_id,designer_name,proposal_json))
  or (not public.current_user_is_master() and public.current_user_can_review_franchise(franchise_id)
    and lower(coalesce(status,proposal_json->>'status','draft'))<>'draft')
);
drop policy if exists "proposal_role_delete" on public.franchise_proposals;
create policy "proposal_role_delete" on public.franchise_proposals for delete to authenticated using (
  (owner_auth_user_id=auth.uid() and public.collab_actor_active(franchise_id,false,auth.uid()))
  or ((owner_auth_user_id is null or (not collaboration_enabled
      and owner_auth_user_id=designer_auth_user_id)) and public.current_user_owns_proposal(
    franchise_id,designer_auth_user_id,designer_name,proposal_json))
  or (not public.current_user_is_master() and public.current_user_can_manage_franchise(franchise_id)
    and lower(coalesce(status,proposal_json->>'status','draft'))<>'draft')
);
drop policy if exists "test proposal role select" on public.franchise_test_proposals;
create policy "test proposal role select" on public.franchise_test_proposals for select to authenticated using (
  public.current_user_is_master()
  or (not collaboration_enabled and public.current_user_belongs_to_franchise(franchise_id) and (
    designer_auth_user_id=auth.uid()
    or public.current_test_account_role() in ('owner','admin')
    or (public.current_test_account_role()='bookkeeper' and lower(coalesce(status,proposal_json->>'status','draft'))<>'draft')
  ))
  or (collaboration_enabled and public.collab_actor_active(franchise_id,true,auth.uid()) and (
    owner_auth_user_id=auth.uid()
    or (owner_auth_user_id is null and designer_auth_user_id=auth.uid())
    or public.current_test_account_role() in ('owner','admin')
    or (public.current_test_account_role()='bookkeeper' and lower(coalesce(status,'draft'))<>'draft')
  ))
);
drop policy if exists "test proposal role update" on public.franchise_test_proposals;
create policy "test proposal role update" on public.franchise_test_proposals for update to authenticated using (
  (not collaboration_enabled and public.current_user_belongs_to_franchise(franchise_id)
    or collaboration_enabled and public.collab_actor_active(franchise_id,true,auth.uid())) and (
    owner_auth_user_id=auth.uid()
    or (owner_auth_user_id is null and designer_auth_user_id=auth.uid())
    or public.current_test_account_role() in ('owner','admin')
    or (public.current_test_account_role()='bookkeeper' and lower(coalesce(status,'draft'))<>'draft')
  )
 ) with check (
   (not collaboration_enabled and public.current_user_is_test_account()
     and public.current_user_belongs_to_franchise(franchise_id))
   or (collaboration_enabled and public.collab_actor_active(franchise_id,true,auth.uid()))
 );
drop policy if exists "test proposal role delete" on public.franchise_test_proposals;
create policy "test proposal role delete" on public.franchise_test_proposals for delete to authenticated using (
  (not collaboration_enabled and public.current_user_belongs_to_franchise(franchise_id)
    or collaboration_enabled and public.collab_actor_active(franchise_id,true,auth.uid())) and (
    owner_auth_user_id=auth.uid()
    or (owner_auth_user_id is null and designer_auth_user_id=auth.uid())
    or public.current_test_account_role() in ('owner','admin')
  )
);

-- Old clients may still issue direct upserts. Once collaboration has ever
-- started, only the checked RPC path can write that row, even after unsharing.
create function public.guard_collaborative_proposal_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_auth_user_id is null then new.owner_auth_user_id := auth.uid(); end if;
    if new.owner_auth_user_id is distinct from auth.uid()
      and current_setting('app.collaboration_authorized', true) is distinct from 'yes' then
      raise exception 'Proposal owner must be the authenticated creator';
    end if;
    return new;
  end if;
  if old.collaboration_enabled and current_setting('app.collaboration_authorized', true) is distinct from 'yes' then
    raise exception 'UPGRADE_REQUIRED: collaborative proposal writes require a current client';
  end if;
  if current_setting('app.collaboration_authorized', true) is distinct from 'yes' then
    if new.owner_auth_user_id is distinct from old.owner_auth_user_id then
      raise exception 'Owner changes require authorized transfer';
    end if;
    if new.collaboration_enabled is distinct from old.collaboration_enabled
      or new.content_revision is distinct from old.content_revision then
      raise exception 'Collaboration metadata cannot be changed directly';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_live_collaborative_write before insert or update
  on public.franchise_proposals for each row execute function public.guard_collaborative_proposal_write();
create trigger guard_test_collaborative_write before insert or update
  on public.franchise_test_proposals for each row execute function public.guard_collaborative_proposal_write();
create function public.guard_collaborative_proposal_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.collaboration_enabled and current_setting('app.collaboration_authorized',true) is distinct from 'yes' then
    raise exception 'UPGRADE_REQUIRED: collaborative proposal deletion requires a current client';
  end if;
  return old;
end;
$$;
create trigger guard_live_collaborative_delete before delete on public.franchise_proposals
  for each row execute function public.guard_collaborative_proposal_delete();
create trigger guard_test_collaborative_delete before delete on public.franchise_test_proposals
  for each row execute function public.guard_collaborative_proposal_delete();

create function public.collab_emit(p_number text, p_franchise text, p_test boolean,
  p_actor uuid, p_recipient uuid, p_type text, p_request uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.proposal_collaboration_events
    (proposal_number, franchise_id, is_test, actor_id, recipient_id, event_type, request_id, note)
  values (p_number, p_franchise, p_test, p_actor, p_recipient, p_type, p_request, p_note);
end;
$$;

create function public.collab_manage_share(p_number text, p_test boolean,
  p_recipient uuid, p_permission text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row record; v_table text; v_recipient_active boolean;
begin
  if auth.uid() is null or p_permission not in ('view','contribute') or p_recipient = auth.uid() then
    raise exception 'Invalid share request'; end if;
  v_table := case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select proposal_number, franchise_id, owner_auth_user_id from public.%I where proposal_number=$1 for update', v_table)
    into v_row using p_number;
  if v_row is null or v_row.owner_auth_user_id is distinct from auth.uid()
    or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid())
    or not public.collab_enabled(v_row.franchise_id,p_test) then
    raise exception 'Sharing is unavailable or access denied'; end if;
  if p_test then
    select public.collab_user_active(v_row.franchise_id,true,p_recipient)
      into v_recipient_active;
  else
    select public.collab_user_active(v_row.franchise_id,false,p_recipient)
      into v_recipient_active;
  end if;
  if not v_recipient_active then raise exception 'Recipient is not an active user in this franchise'; end if;
  insert into public.proposal_collaboration_shares
    (proposal_number,franchise_id,is_test,recipient_id,permission,note,created_by)
  values (p_number,v_row.franchise_id,p_test,p_recipient,p_permission,nullif(trim(p_note),''),auth.uid())
  on conflict (is_test,proposal_number,recipient_id) where ended_at is null
    do update set permission=excluded.permission,note=excluded.note;
  perform set_config('app.collaboration_authorized','yes',true);
  execute format('update public.%I set collaboration_enabled=true where proposal_number=$1',v_table) using p_number;
  update public.proposal_collaboration_requests set status='access_ended',updated_at=now(),decided_at=now(),decided_by=auth.uid()
    where is_test=p_test and proposal_number=p_number and contributor_id=p_recipient
      and status in ('working','submitted','revision_requested') and p_permission='view';
  perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),p_recipient,'shared',null,p_note);
end;
$$;

create function public.collab_end_share(p_number text,p_test boolean,p_recipient uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row record; v_table text;
begin
  v_table := case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select franchise_id,owner_auth_user_id from public.%I where proposal_number=$1 for update',v_table)
    into v_row using p_number;
  if v_row is null or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid())
    or (auth.uid() is distinct from p_recipient
      and auth.uid() is distinct from v_row.owner_auth_user_id) then
    raise exception 'Access denied'; end if;
  update public.proposal_collaboration_shares set ended_at=now(),ended_by=auth.uid()
    where proposal_number=p_number and is_test=p_test and recipient_id=p_recipient and ended_at is null;
  if not found then raise exception 'Active share not found'; end if;
  update public.proposal_collaboration_requests set status='access_ended',updated_at=now(),decided_at=now(),decided_by=auth.uid()
    where proposal_number=p_number and is_test=p_test and contributor_id=p_recipient
      and status in ('working','submitted','revision_requested');
  perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),p_recipient,'access_ended');
  if v_row.owner_auth_user_id is not null and auth.uid() is distinct from v_row.owner_auth_user_id then
    perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),v_row.owner_auth_user_id,'collaborator_left');
  end if;
end;
$$;

-- The directory is returned only to a verified proposal owner. Sharing a test
-- proposal can only enumerate designated test personas.
create function public.collab_recipient_directory(p_number text,p_test boolean)
returns table(user_id uuid,display_name text,email text)
language plpgsql security definer set search_path = '' as $$
declare v_row record;
begin
  if p_test then
    select p.franchise_id,p.owner_auth_user_id into v_row from public.franchise_test_proposals p where p.proposal_number=p_number;
  else
    select p.franchise_id,p.owner_auth_user_id into v_row from public.franchise_proposals p where p.proposal_number=p_number;
  end if;
  if v_row is null or v_row.owner_auth_user_id is distinct from auth.uid()
    or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid()) then
    raise exception 'Access denied'; end if;
  if p_test then
    return query select a.auth_user_id,a.name,a.email from public.app_test_accounts a
      where a.is_active and a.auth_user_id <> auth.uid()
        and exists(select 1 from public.proposal_collaboration_test_scope scope
          where scope.auth_user_id=a.auth_user_id and scope.franchise_id=v_row.franchise_id)
      order by a.name;
  else
    return query select u.auth_user_id,u.name,u.email::text from public.franchise_users u
      where u.franchise_id=v_row.franchise_id and coalesce(u.is_active,true)
        and u.auth_user_id is not null and u.auth_user_id <> auth.uid()
        and not exists(select 1 from public.app_test_accounts a where a.auth_user_id=u.auth_user_id)
      order by u.name;
  end if;
end;
$$;

create function public.collab_people(p_number text,p_test boolean)
returns table(user_id uuid,display_name text,email text)
language plpgsql security definer set search_path = '' as $$
declare v_row record;
begin
  if p_test then
    select p.franchise_id,p.owner_auth_user_id into v_row from public.franchise_test_proposals p where p.proposal_number=p_number;
  else
    select p.franchise_id,p.owner_auth_user_id into v_row from public.franchise_proposals p where p.proposal_number=p_number;
  end if;
  if v_row is null or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid())
    or (v_row.owner_auth_user_id is distinct from auth.uid() and not exists(
      select 1 from public.proposal_collaboration_shares s where s.proposal_number=p_number
        and s.is_test=p_test and s.recipient_id=auth.uid() and s.ended_at is null)) then
    raise exception 'Access denied'; end if;
  if p_test then
    return query select a.auth_user_id,a.name,a.email from public.app_test_accounts a
      where (a.auth_user_id=v_row.owner_auth_user_id or a.auth_user_id in (
        select s.recipient_id from public.proposal_collaboration_shares s
        where s.proposal_number=p_number and s.is_test and s.ended_at is null))
        and exists(select 1 from public.proposal_collaboration_test_scope scope
          where scope.auth_user_id=a.auth_user_id and scope.franchise_id=v_row.franchise_id);
  else
    return query select u.auth_user_id,u.name,u.email::text from public.franchise_users u
      where u.franchise_id=v_row.franchise_id and (u.auth_user_id=v_row.owner_auth_user_id
        or u.auth_user_id in (select s.recipient_id from public.proposal_collaboration_shares s
          where s.proposal_number=p_number and not s.is_test and s.ended_at is null));
  end if;
end;
$$;

-- Version snapshots are stored separately. A contributor can change only the
-- editable version's body and calculated values; identity, workflow, signed
-- records and pricing pins are never sourced from a working copy on apply.
create function public.collab_editable_version(p_json jsonb,p_version text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_version jsonb;
begin
  if coalesce(p_json->>'versionId','original')=p_version then
    v_version:=p_json;
  else
    select value into v_version from jsonb_array_elements(coalesce(p_json->'versions','[]'::jsonb))
      where coalesce(value->>'versionId','original')=p_version limit 1;
  end if;
  if v_version is null or lower(coalesce(v_version->>'versionStatus',v_version->>'status','draft')) <> 'draft'
    or coalesce(v_version->>'signedAt','') <> ''
    or coalesce((v_version->>'versionLocked')::boolean,false) then
    raise exception 'Target version is not an editable draft';
  end if;
  return v_version;
end;
$$;

create function public.collab_mutable_version_fields(p_version jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_version)
  where key = any(array[
    'customerInfo','poolSpecs','excavation','plumbing','electrical','tileCopingDecking',
    'drainage','equipment','waterFeatures','customFeatures','masonry','interiorFinish',
    'costBreakdown','papDiscounts','manualAdjustments','retailAdjustments','pricing',
    'subtotal','taxRate','taxAmount','totalCost','notes','contractOverrides','warrantySections'
  ]);
$$;

create function public.collab_content_signature(p_proposal jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId',coalesce(v.value->>'versionId','original'),
    'versionName',v.value->>'versionName',
    'body',public.collab_mutable_version_fields(v.value),
    'pricingModelId',v.value->>'pricingModelId',
    'pricingModelRevisionId',v.value->>'pricingModelRevisionId',
    'contractTemplateRevisionId',v.value->>'contractTemplateRevisionId'
  ) order by coalesce(v.value->>'versionId','original')),'[]'::jsonb)
  from jsonb_array_elements(jsonb_build_array(p_proposal - 'versions')
    || coalesce(p_proposal->'versions','[]'::jsonb)) as v(value);
$$;

create function public.collab_replace_version(p_json jsonb,p_version text,p_work jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_fields jsonb; v_versions jsonb; v_index integer;
begin
  v_fields:=public.collab_mutable_version_fields(p_work);
  if coalesce(p_json->>'versionId','original')=p_version then
    return p_json || v_fields;
  end if;
  v_versions:=coalesce(p_json->'versions','[]'::jsonb);
  select ordinality::integer-1 into v_index
    from jsonb_array_elements(v_versions) with ordinality
    where coalesce(value->>'versionId','original')=p_version limit 1;
  if v_index is null then raise exception 'Target version no longer exists'; end if;
  return jsonb_set(p_json,array['versions',v_index::text],(v_versions->v_index)||v_fields);
end;
$$;

create function public.collab_save_work(p_number text,p_test boolean,p_version text,
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

create function public.collab_decide_request(p_request uuid,p_test boolean,p_action text,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req record; v_row record; v_table text; v_new jsonb; v_current jsonb; v_share record;
begin
  select * into v_req from public.proposal_collaboration_requests where id=p_request and is_test=p_test for update;
  if v_req is null then raise exception 'Request not found'; end if;
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select proposal_json,content_revision,franchise_id,owner_auth_user_id,status from public.%I where proposal_number=$1 for update',v_table)
    into v_row using v_req.proposal_number;
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
  if p_action='apply' then
    if lower(coalesce(v_row.status,'draft'))='completed' then raise exception 'Completed proposal cannot accept changes'; end if;
    select * into v_share from public.proposal_collaboration_shares
      where proposal_number=v_req.proposal_number and is_test=p_test
        and recipient_id=v_req.contributor_id and permission='contribute' and ended_at is null;
    if v_share is null or not public.collab_user_active(v_row.franchise_id,p_test,v_req.contributor_id)
      or v_req.base_revision<>v_row.content_revision then
      raise exception 'STALE_REQUEST: refresh the draft before applying changes'; end if;
    v_current:=public.collab_editable_version(v_row.proposal_json,v_req.target_version_id);
    v_new:=public.collab_replace_version(v_row.proposal_json,v_req.target_version_id,v_req.working_version_json);
    v_new:=jsonb_set(v_new,'{lastModified}',to_jsonb(now()::text),true);
    if v_new->>'proposalNumber' is distinct from v_row.proposal_json->>'proposalNumber'
      or v_new->'versions' is distinct from v_row.proposal_json->'versions'
         and coalesce(v_row.proposal_json->>'versionId','original')=v_req.target_version_id then
      raise exception 'Protected proposal structure changed'; end if;
    perform set_config('app.collaboration_authorized','yes',true);
    execute format('update public.%I set proposal_json=$2,content_revision=content_revision+1,updated_at=now(),last_modified=now() where proposal_number=$1',v_table)
      using v_req.proposal_number,v_new;
    update public.proposal_collaboration_requests set status='applied',updated_at=now(),decided_at=now(),decided_by=auth.uid(),
      pre_apply_proposal_json=v_row.proposal_json,post_apply_proposal_json=v_new,
      applied_revision=v_row.content_revision+1 where id=p_request;
    for v_share in select id,contributor_id from public.proposal_collaboration_requests
      where proposal_number=v_req.proposal_number and is_test=p_test and id<>p_request
        and status in ('working','submitted','revision_requested') loop
      perform public.collab_emit(v_req.proposal_number,v_row.franchise_id,p_test,auth.uid(),
        v_share.contributor_id,'changes_outdated',v_share.id);
    end loop;
    update public.proposal_collaboration_requests set status='stale',updated_at=now(),decided_at=now(),decided_by=auth.uid()
      where proposal_number=v_req.proposal_number and is_test=p_test and id<>p_request
        and status in ('working','submitted','revision_requested');
    perform public.collab_emit(v_req.proposal_number,v_row.franchise_id,p_test,auth.uid(),v_req.contributor_id,'changes_applied',p_request);
  else
    update public.proposal_collaboration_requests set status=case when p_action='decline' then 'declined' else 'revision_requested' end,
      owner_note=nullif(trim(p_note),''),updated_at=now(),decided_at=now(),decided_by=auth.uid()
      where id=p_request;
    perform public.collab_emit(v_req.proposal_number,v_row.franchise_id,p_test,auth.uid(),v_req.contributor_id,
      case when p_action='decline' then 'changes_declined' else 'revisions_requested' end,p_request,p_note);
  end if;
end;
$$;

-- A full canonical save is checked against the latest revision. Existing
-- proposal safety triggers (including protected signed baselines) still run.
create function public.collab_immutable_version_content(p_version jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select p_version - array['versions','activeVersionId','workflow','syncStatus','syncMessage','lastModified',
    'ownerAuthUserId','contentRevision','collaborationEnabled','sharedPermission',
    'status','versionLocked','versionLockedAt','versionSubmittedAt','versionSubmittedBy'];
$$;

create function public.collab_history_preserved(p_old jsonb,p_new jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from jsonb_array_elements(case
      when jsonb_typeof(p_old->'workflow'->'history')='array' then p_old->'workflow'->'history'
      else '[]'::jsonb end)
      with ordinality as event(value,position)
    where event.value - 'readByUserIds' is distinct from
      (p_new->'workflow'->'history'->(event.position::integer-1)) - 'readByUserIds'
  );
$$;

create function public.collab_owner_save(p_number text,p_test boolean,p_expected bigint,
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
  if v_content_changed or v_is_submission then
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

create function public.collab_restore(p_request uuid,p_test boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req record; v_row record; v_table text;
begin
  select * into v_req from public.proposal_collaboration_requests where id=p_request and is_test=p_test for update;
  if v_req is null or v_req.status<>'applied' or v_req.restored_at is not null then
    raise exception 'Applied change is unavailable'; end if;
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select * from public.%I where proposal_number=$1 for update',v_table) into v_row using v_req.proposal_number;
  if v_row is null or v_row.owner_auth_user_id is distinct from auth.uid()
    or not public.collab_actor_active(v_row.franchise_id,p_test,auth.uid())
    or v_row.content_revision is distinct from v_req.applied_revision
    or (v_row.proposal_json - array['lastModified','syncStatus','syncMessage'])
      is distinct from (v_req.post_apply_proposal_json - array['lastModified','syncStatus','syncMessage'])
    or lower(coalesce(v_row.status,'draft'))='completed' then
    raise exception 'Restore is no longer safe because the draft changed'; end if;
  perform public.collab_editable_version(v_row.proposal_json,v_req.target_version_id);
  perform set_config('app.collaboration_authorized','yes',true);
  execute format('update public.%I set proposal_json=$2,content_revision=content_revision+1,updated_at=now(),last_modified=now() where proposal_number=$1',v_table)
    using v_req.proposal_number,jsonb_set(v_req.pre_apply_proposal_json,'{lastModified}',to_jsonb(now()::text),true);
  update public.proposal_collaboration_requests set restored_at=now(),restored_by=auth.uid(),updated_at=now() where id=p_request;
  perform public.collab_emit(v_req.proposal_number,v_row.franchise_id,p_test,auth.uid(),v_req.contributor_id,'changes_restored',p_request);
end;
$$;

create function public.collab_transfer_departed_owner(p_number text,p_test boolean,p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row record; v_table text; v_old_active boolean;
begin
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  execute format('select franchise_id,owner_auth_user_id from public.%I where proposal_number=$1 for update',v_table)
    into v_row using p_number;
  if v_row is null or p_new_owner=v_row.owner_auth_user_id
    or not public.collab_user_active(v_row.franchise_id,p_test,p_new_owner) then
    raise exception 'Invalid owner transfer'; end if;
  if p_test then
    if public.current_test_account_role() not in ('owner','admin') then raise exception 'Administrator required'; end if;
    select exists(select 1 from public.app_test_accounts a where a.auth_user_id=v_row.owner_auth_user_id and a.is_active)
      into v_old_active;
  else
    if public.current_user_is_test_account() or not exists(select 1 from public.franchise_users u
      where u.auth_user_id=auth.uid() and u.franchise_id=v_row.franchise_id and coalesce(u.is_active,true)
        and lower(u.role) in ('owner','admin')) then raise exception 'Administrator required'; end if;
    select exists(select 1 from public.franchise_users u where u.auth_user_id=v_row.owner_auth_user_id
      and u.franchise_id=v_row.franchise_id and coalesce(u.is_active,true)) into v_old_active;
  end if;
  if coalesce(v_old_active,false) then raise exception 'Current owner is still active'; end if;
  perform set_config('app.collaboration_authorized','yes',true);
  execute format('update public.%I set owner_auth_user_id=$2,updated_at=now() where proposal_number=$1',v_table)
    using p_number,p_new_owner;
  perform public.collab_emit(p_number,v_row.franchise_id,p_test,auth.uid(),p_new_owner,
    case when v_row.owner_auth_user_id is null then 'ownership_resolved' else 'ownership_transferred' end);
end;
$$;

create function public.collab_recovery_directory(p_franchise text,p_test boolean)
returns table(user_id uuid,display_name text,email text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_test then
    if public.current_test_account_role() not in ('owner','admin')
      or not public.collab_actor_active(p_franchise,true,auth.uid()) then raise exception 'Administrator required'; end if;
    return query select a.auth_user_id,a.name,a.email from public.app_test_accounts a
      where a.is_active and exists(select 1 from public.proposal_collaboration_test_scope scope
        where scope.auth_user_id=a.auth_user_id and scope.franchise_id=p_franchise)
      order by a.name;
  else
    if public.current_user_is_test_account() or not exists(select 1 from public.franchise_users u
      where u.auth_user_id=auth.uid() and u.franchise_id=p_franchise and coalesce(u.is_active,true)
        and lower(u.role) in ('owner','admin')) then raise exception 'Administrator required'; end if;
    return query select u.auth_user_id,u.name,u.email from public.franchise_users u
      where u.franchise_id=p_franchise and u.auth_user_id is not null and coalesce(u.is_active,true)
      order by u.name;
  end if;
end;
$$;

create function public.collab_recovery_candidates(p_franchise text,p_test boolean)
returns table(proposal_number text,customer_name text,designer_name text,owner_id uuid,reason text)
language plpgsql security definer set search_path = '' as $$
declare v_table text;
begin
  perform public.collab_recovery_directory(p_franchise,p_test);
  v_table:=case when p_test then 'franchise_test_proposals' else 'franchise_proposals' end;
  if p_test then
    return query execute format('select p.proposal_number,p.proposal_json->''customerInfo''->>''customerName'',
      p.designer_name,p.owner_auth_user_id,case when p.owner_auth_user_id is null then ''Unresolved owner''
      else ''Owner inactive or departed'' end from public.%I p where p.franchise_id=$1 and
      (p.owner_auth_user_id is null or not exists(select 1 from public.app_test_accounts a
        where a.auth_user_id=p.owner_auth_user_id and a.is_active)) order by p.updated_at desc',v_table)
      using p_franchise;
  else
    return query execute format('select p.proposal_number,p.proposal_json->''customerInfo''->>''customerName'',
      p.designer_name,p.owner_auth_user_id,case when p.owner_auth_user_id is null then ''Unresolved owner''
      else ''Owner inactive or departed'' end from public.%I p where p.franchise_id=$1 and
      (p.owner_auth_user_id is null or not exists(select 1 from public.franchise_users u
        where u.auth_user_id=p.owner_auth_user_id and u.franchise_id=p.franchise_id
          and coalesce(u.is_active,true))) order by p.updated_at desc',v_table)
      using p_franchise;
  end if;
end;
$$;

create function public.collab_mark_event_read(p_event uuid,p_test boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.proposal_collaboration_events set read_at=coalesce(read_at,now())
    where id=p_event and is_test=p_test and recipient_id=auth.uid();
end;
$$;

create function public.collab_attention_count(p_test boolean)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.proposal_collaboration_requests r
  where r.is_test=p_test and public.collab_actor_active(r.franchise_id,p_test,auth.uid())
    and ((r.status='submitted' and public.collab_current_owner(r.proposal_number,p_test)=auth.uid())
      or (r.status='revision_requested' and r.contributor_id=auth.uid()));
$$;

revoke all on function public.collab_user_active(text,boolean,uuid),
  public.collab_actor_active(text,boolean,uuid),
  public.collab_current_owner(text,boolean),public.collab_enabled(text,boolean),
  public.collab_emit(text,text,boolean,uuid,uuid,text,uuid,text),
  public.collab_editable_version(jsonb,text),public.collab_mutable_version_fields(jsonb),
  public.collab_replace_version(jsonb,text,jsonb),public.collab_immutable_version_content(jsonb),
  public.collab_content_signature(jsonb),public.collab_history_preserved(jsonb,jsonb),
  public.guard_collaborative_proposal_write(),public.guard_collaborative_proposal_delete()
  from public,anon,authenticated;
grant execute on function public.collab_actor_active(text,boolean,uuid),
  public.collab_current_owner(text,boolean) to authenticated;
revoke all on function public.collab_manage_share(text,boolean,uuid,text,text),
  public.collab_end_share(text,boolean,uuid),public.collab_recipient_directory(text,boolean),
  public.collab_people(text,boolean),
  public.collab_save_work(text,boolean,text,jsonb,boolean,text),
  public.collab_decide_request(uuid,boolean,text,text),
  public.collab_owner_save(text,boolean,bigint,jsonb,text,boolean),
  public.collab_restore(uuid,boolean),public.collab_transfer_departed_owner(text,boolean,uuid),
  public.collab_mark_event_read(uuid,boolean),public.collab_recovery_directory(text,boolean),
  public.collab_recovery_candidates(text,boolean) from public,anon;
revoke all on function public.collab_attention_count(boolean) from public,anon;
grant execute on function public.collab_manage_share(text,boolean,uuid,text,text),
  public.collab_end_share(text,boolean,uuid),public.collab_recipient_directory(text,boolean),
  public.collab_people(text,boolean),
  public.collab_save_work(text,boolean,text,jsonb,boolean,text),
  public.collab_decide_request(uuid,boolean,text,text),
  public.collab_owner_save(text,boolean,bigint,jsonb,text,boolean),
  public.collab_restore(uuid,boolean),public.collab_transfer_departed_owner(text,boolean,uuid),
  public.collab_mark_event_read(uuid,boolean),public.collab_recovery_directory(text,boolean),
  public.collab_recovery_candidates(text,boolean) to authenticated;
grant execute on function public.collab_attention_count(boolean) to authenticated;

commit;
