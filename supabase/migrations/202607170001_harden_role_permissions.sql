-- Explicit role and ownership enforcement for franchise data.
-- Additive: no proposal, pricing, user, or franchise rows are deleted.

begin;

alter table public.franchise_proposals
  add column if not exists designer_auth_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchise_proposals_designer_auth_user_id_fkey'
      and conrelid = 'public.franchise_proposals'::regclass
  ) then
    alter table public.franchise_proposals
      add constraint franchise_proposals_designer_auth_user_id_fkey
      foreign key (designer_auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_franchise_proposals_designer_auth_user
  on public.franchise_proposals (franchise_id, designer_auth_user_id);

-- Backfill only unambiguous legacy designer-name/email matches. Rows that do
-- not match exactly remain null and continue through the compatibility check.
with ownership_matches as (
  select
    proposal.franchise_id,
    proposal.proposal_number,
    (array_agg(profile.auth_user_id order by profile.id))[1] as auth_user_id,
    count(*) as match_count
  from public.franchise_proposals proposal
  join public.franchise_users profile
    on profile.franchise_id = proposal.franchise_id
   and profile.auth_user_id is not null
   and coalesce(profile.is_active, true) = true
   and nullif(lower(trim(coalesce(
         nullif(proposal.designer_name, ''),
         proposal.proposal_json ->> 'designerName',
         ''
       ))), '') is not null
   and lower(trim(coalesce(
         nullif(proposal.designer_name, ''),
         proposal.proposal_json ->> 'designerName',
         ''
       ))) in (
         lower(trim(coalesce(profile.name, ''))),
         lower(trim(coalesce(profile.email, '')))
       )
  where proposal.designer_auth_user_id is null
  group by proposal.franchise_id, proposal.proposal_number
)
update public.franchise_proposals proposal
set designer_auth_user_id = ownership.auth_user_id
from ownership_matches ownership
where proposal.proposal_number = ownership.proposal_number
  and proposal.franchise_id = ownership.franchise_id
  and ownership.match_count = 1;

create or replace function public.current_user_is_bookkeeper_for_franchise(target_franchise_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.franchise_users profile
    where profile.auth_user_id = auth.uid()
      and profile.franchise_id = target_franchise_id
      and lower(profile.role) = 'bookkeeper'
      and coalesce(profile.is_active, true) = true
  );
$$;

create or replace function public.current_user_can_review_franchise(target_franchise_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_master() or exists (
    select 1
    from public.franchise_users profile
    where profile.auth_user_id = auth.uid()
      and profile.franchise_id = target_franchise_id
      and lower(profile.role) in ('owner', 'admin', 'bookkeeper')
      and coalesce(profile.is_active, true) = true
  );
$$;

create or replace function public.current_user_owns_proposal(
  target_franchise_id text,
  target_designer_auth_user_id uuid,
  target_designer_name text,
  target_proposal_json jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.franchise_users profile
    where profile.auth_user_id = auth.uid()
      and profile.franchise_id = target_franchise_id
      and coalesce(profile.is_active, true) = true
      and (
        target_designer_auth_user_id = auth.uid()
        or (
          target_designer_auth_user_id is null
          and nullif(lower(trim(coalesce(
                nullif(target_designer_name, ''),
                target_proposal_json ->> 'designerName',
                ''
              ))), '') is not null
          and lower(trim(coalesce(
                nullif(target_designer_name, ''),
                target_proposal_json ->> 'designerName',
                ''
              ))) in (
                lower(trim(coalesce(profile.name, ''))),
                lower(trim(coalesce(profile.email, '')))
              )
          and 1 = (
            select count(*)
            from public.franchise_users candidate
            where candidate.franchise_id = target_franchise_id
              and candidate.auth_user_id is not null
              and coalesce(candidate.is_active, true) = true
              and lower(trim(coalesce(
                    nullif(target_designer_name, ''),
                    target_proposal_json ->> 'designerName',
                    ''
                  ))) in (
                    lower(trim(coalesce(candidate.name, ''))),
                    lower(trim(coalesce(candidate.email, '')))
                  )
          )
        )
      )
  );
$$;

revoke all on function public.current_user_is_bookkeeper_for_franchise(text) from public, anon;
revoke all on function public.current_user_can_review_franchise(text) from public, anon;
revoke all on function public.current_user_owns_proposal(text, uuid, text, jsonb) from public, anon;
grant execute on function public.current_user_is_bookkeeper_for_franchise(text) to authenticated;
grant execute on function public.current_user_can_review_franchise(text) to authenticated;
grant execute on function public.current_user_owns_proposal(text, uuid, text, jsonb) to authenticated;

-- Keep direct profile-table UPDATE unavailable to app sessions. These narrowly
-- scoped functions preserve legitimate writes without exposing role, email,
-- active-state, password, or commission fields to self-service escalation.
create or replace function public.touch_current_user_last_login()
returns void
language sql
security definer
set search_path = public
as $$
  update public.franchise_users
  set last_login_at = now()
  where auth_user_id = auth.uid()
    and coalesce(is_active, true) = true;
$$;

create or replace function public.update_franchise_user_approval_settings(
  p_user_id text,
  p_approval_margin_threshold_percent numeric,
  p_discount_allowance_threshold_percent numeric,
  p_always_require_approval boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_franchise_id text;
begin
  select profile.franchise_id
  into v_franchise_id
  from public.franchise_users profile
  where profile.id::text = p_user_id
    and coalesce(profile.is_active, true) = true;

  if v_franchise_id is null then
    raise exception 'User profile not found.' using errcode = 'P0002';
  end if;

  if not public.current_user_can_manage_franchise(v_franchise_id) then
    raise exception 'Only a franchise owner, admin, or master can change approval settings.'
      using errcode = '42501';
  end if;

  update public.franchise_users
  set approval_margin_threshold_percent = p_approval_margin_threshold_percent,
      discount_allowance_threshold_percent = p_discount_allowance_threshold_percent,
      always_require_approval = p_always_require_approval,
      updated_at = now()
  where id::text = p_user_id;
end;
$$;

create or replace function public.update_franchise_user_commission_rates(
  p_user_id text,
  p_dig_commission_rate numeric,
  p_closeout_commission_rate numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_franchise_id text;
begin
  select profile.franchise_id
  into v_franchise_id
  from public.franchise_users profile
  where profile.id::text = p_user_id
    and coalesce(profile.is_active, true) = true;

  if v_franchise_id is null then
    raise exception 'User profile not found.' using errcode = 'P0002';
  end if;

  if not public.current_user_can_manage_franchise(v_franchise_id) then
    raise exception 'Only a franchise owner, admin, or master can change commission rates.'
      using errcode = '42501';
  end if;

  update public.franchise_users
  set dig_commission_rate = p_dig_commission_rate,
      closeout_commission_rate = p_closeout_commission_rate,
      updated_at = now()
  where id::text = p_user_id;
end;
$$;

revoke all on function public.touch_current_user_last_login() from public, anon;
revoke all on function public.update_franchise_user_approval_settings(text, numeric, numeric, boolean) from public, anon;
revoke all on function public.update_franchise_user_commission_rates(text, numeric, numeric) from public, anon;
grant execute on function public.touch_current_user_last_login() to authenticated;
grant execute on function public.update_franchise_user_approval_settings(text, numeric, numeric, boolean) to authenticated;
grant execute on function public.update_franchise_user_commission_rates(text, numeric, numeric) to authenticated;

-- Proposals: remove overlapping legacy policies and replace them with one
-- explicit matrix. Reviewers see submitted workflow rows; designers and
-- bookkeepers retain full access to proposals they created themselves.
alter table public.franchise_proposals enable row level security;

drop policy if exists "allow updates for franchise proposals" on public.franchise_proposals;
drop policy if exists "franchise_proposals_delete" on public.franchise_proposals;
drop policy if exists "franchise_proposals_insert" on public.franchise_proposals;
drop policy if exists "franchise_proposals_select" on public.franchise_proposals;
drop policy if exists "franchise_proposals_update" on public.franchise_proposals;
drop policy if exists "proposals_delete_admin_only" on public.franchise_proposals;
drop policy if exists "proposals_read_same_franchise" on public.franchise_proposals;
drop policy if exists "proposals_update_same_franchise" on public.franchise_proposals;
drop policy if exists "proposals_upsert_same_franchise" on public.franchise_proposals;

revoke select, insert, update, delete on public.franchise_proposals from public, anon;
grant select, insert, update, delete on public.franchise_proposals to authenticated;

create policy "proposal_role_select"
  on public.franchise_proposals for select to authenticated
  using (
    public.current_user_is_master()
    or public.current_user_can_manage_franchise(franchise_id)
    or public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      public.current_user_is_bookkeeper_for_franchise(franchise_id)
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  );

create policy "proposal_role_insert"
  on public.franchise_proposals for insert to authenticated
  with check (
    public.current_user_is_master()
    or public.current_user_can_manage_franchise(franchise_id)
    or public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
  );

create policy "proposal_role_update"
  on public.franchise_proposals for update to authenticated
  using (
    public.current_user_is_master()
    or public.current_user_can_manage_franchise(franchise_id)
    or public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      public.current_user_is_bookkeeper_for_franchise(franchise_id)
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  )
  with check (
    public.current_user_is_master()
    or public.current_user_can_manage_franchise(franchise_id)
    or public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      public.current_user_is_bookkeeper_for_franchise(franchise_id)
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  );

create policy "proposal_role_delete"
  on public.franchise_proposals for delete to authenticated
  using (
    public.current_user_is_master()
    or public.current_user_can_manage_franchise(franchise_id)
    or public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
  );

-- Pricing models: one franchise-scoped read policy and manager-only writes.
alter table public.franchise_pricing_models enable row level security;

drop policy if exists "pricing_models_admin_delete" on public.franchise_pricing_models;
drop policy if exists "pricing_models_admin_manage" on public.franchise_pricing_models;
drop policy if exists "pricing_models_admin_update" on public.franchise_pricing_models;
drop policy if exists "pricing_models_delete" on public.franchise_pricing_models;
drop policy if exists "pricing_models_insert" on public.franchise_pricing_models;
drop policy if exists "pricing_models_read_franchise" on public.franchise_pricing_models;
drop policy if exists "pricing_models_select" on public.franchise_pricing_models;
drop policy if exists "pricing_models_update" on public.franchise_pricing_models;

revoke select, insert, update, delete on public.franchise_pricing_models from public, anon;
grant select, insert, update, delete on public.franchise_pricing_models to authenticated;

create policy "pricing_model_role_select"
  on public.franchise_pricing_models for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

create policy "pricing_model_role_insert"
  on public.franchise_pricing_models for insert to authenticated
  with check (public.current_user_can_manage_franchise(franchise_id));

create policy "pricing_model_role_update"
  on public.franchise_pricing_models for update to authenticated
  using (public.current_user_can_manage_franchise(franchise_id))
  with check (public.current_user_can_manage_franchise(franchise_id));

create policy "pricing_model_role_delete"
  on public.franchise_pricing_models for delete to authenticated
  using (public.current_user_can_manage_franchise(franchise_id));

-- Users: reviewers can list their franchise, designers see only themselves.
-- Profile/role/password mutations continue through guarded Edge Functions.
alter table public.franchise_users enable row level security;

drop policy if exists "franchise_users_admin_update" on public.franchise_users;
drop policy if exists "franchise_users_select" on public.franchise_users;
drop policy if exists "franchise_users_self_update" on public.franchise_users;

revoke select, insert, update, delete on public.franchise_users from public, anon;
revoke insert, update, delete on public.franchise_users from authenticated;
grant select on public.franchise_users to authenticated;

create policy "franchise_user_role_select"
  on public.franchise_users for select to authenticated
  using (
    public.current_user_can_manage_franchise(franchise_id)
    or auth_user_id = auth.uid()
  );

commit;
