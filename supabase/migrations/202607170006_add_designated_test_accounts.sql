-- Designated cross-franchise test personas and isolated proposal workflow.
-- Test identities may read an active franchise's configuration, but can never
-- write production proposals or manage production franchise settings.

begin;

create table if not exists public.app_test_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null unique check (role in ('owner', 'admin', 'bookkeeper', 'designer')),
  is_active boolean not null default true,
  password_reset_required boolean not null default true,
  password_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_test_accounts_email_lower_key
  on public.app_test_accounts (lower(email));

create or replace function public.current_test_account_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select account.role
  from public.app_test_accounts account
  where account.auth_user_id = auth.uid()
    and account.is_active = true
  limit 1;
$$;

create or replace function public.current_user_is_test_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_test_account_role() is not null;
$$;

-- A test persona may borrow read-only configuration from any active franchise.
-- Management helpers intentionally remain unchanged, so test owner/admin roles
-- never acquire production mutation privileges.
create or replace function public.current_user_belongs_to_franchise(target_franchise_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_master()
    or exists (
      select 1
      from public.franchise_users user_profile
      where user_profile.auth_user_id = auth.uid()
        and user_profile.franchise_id = target_franchise_id
        and coalesce(user_profile.is_active, true) = true
    )
    or (
      public.current_user_is_test_account()
      and exists (
        select 1
        from public.franchises franchise
        where franchise.id = target_franchise_id
          and coalesce(franchise.is_active, true) = true
          and franchise.deleted_at is null
      )
    );
$$;

create table if not exists public.franchise_test_proposals (
  proposal_number text primary key,
  franchise_id text not null references public.franchises(id) on delete cascade,
  designer_auth_user_id uuid not null references auth.users(id) on delete cascade,
  designer_name text,
  designer_role text,
  designer_code text,
  status text,
  pricing_model_id text,
  pricing_model_name text,
  last_modified timestamptz,
  created_date timestamptz,
  updated_at timestamptz not null default now(),
  proposal_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_franchise_test_proposals_franchise_updated
  on public.franchise_test_proposals (franchise_id, updated_at desc);

create index if not exists idx_franchise_test_proposals_owner
  on public.franchise_test_proposals (franchise_id, designer_auth_user_id);

alter table public.app_test_accounts enable row level security;
alter table public.franchise_test_proposals enable row level security;

-- Defense in depth: even if a future production proposal policy becomes more
-- permissive, a test identity cannot read or mutate the live proposal table.
drop policy if exists "test accounts cannot access live proposals" on public.franchise_proposals;
create policy "test accounts cannot access live proposals"
  on public.franchise_proposals as restrictive for all to authenticated
  using (not public.current_user_is_test_account())
  with check (not public.current_user_is_test_account());

revoke all privileges on public.app_test_accounts from public, anon, authenticated;
grant select on public.app_test_accounts to authenticated;

drop policy if exists "test accounts read self or master" on public.app_test_accounts;
create policy "test accounts read self or master"
  on public.app_test_accounts for select to authenticated
  using (auth_user_id = auth.uid() or public.current_user_is_master());

revoke all privileges on public.franchise_test_proposals from public, anon;
revoke insert, update, delete on public.franchise_test_proposals from authenticated;
grant select, insert, update, delete on public.franchise_test_proposals to authenticated;

drop policy if exists "test proposal role select" on public.franchise_test_proposals;
create policy "test proposal role select"
  on public.franchise_test_proposals for select to authenticated
  using (
    public.current_user_is_master()
    or (
      public.current_user_belongs_to_franchise(franchise_id)
      and (
        designer_auth_user_id = auth.uid()
        or public.current_test_account_role() in ('owner', 'admin')
        or (
          public.current_test_account_role() = 'bookkeeper'
          and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
        )
      )
    )
  );

drop policy if exists "test proposal role insert" on public.franchise_test_proposals;
create policy "test proposal role insert"
  on public.franchise_test_proposals for insert to authenticated
  with check (
    public.current_user_is_test_account()
    and public.current_user_belongs_to_franchise(franchise_id)
    and designer_auth_user_id = auth.uid()
  );

drop policy if exists "test proposal role update" on public.franchise_test_proposals;
create policy "test proposal role update"
  on public.franchise_test_proposals for update to authenticated
  using (
    public.current_user_belongs_to_franchise(franchise_id)
    and (
      designer_auth_user_id = auth.uid()
      or public.current_test_account_role() in ('owner', 'admin')
      or (
        public.current_test_account_role() = 'bookkeeper'
        and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
      )
    )
  )
  with check (
    public.current_user_is_test_account()
    and public.current_user_belongs_to_franchise(franchise_id)
  );

drop policy if exists "test proposal role delete" on public.franchise_test_proposals;
create policy "test proposal role delete"
  on public.franchise_test_proposals for delete to authenticated
  using (
    public.current_user_belongs_to_franchise(franchise_id)
    and (
      designer_auth_user_id = auth.uid()
      or public.current_test_account_role() in ('owner', 'admin')
    )
  );

-- Proposal note overrides are production franchise configuration. Explicitly
-- protect them so a test admin can inspect but cannot change the live record.
alter table public.franchise_proposal_notes enable row level security;
revoke all privileges on public.franchise_proposal_notes from public, anon, authenticated;
grant select, insert, update, delete on public.franchise_proposal_notes to authenticated;

drop policy if exists "franchise proposal notes read" on public.franchise_proposal_notes;
drop policy if exists "franchise proposal notes manage" on public.franchise_proposal_notes;
create policy "franchise proposal notes read"
  on public.franchise_proposal_notes for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));
create policy "franchise proposal notes manage"
  on public.franchise_proposal_notes for all to authenticated
  using (public.current_user_can_manage_franchise(franchise_id))
  with check (public.current_user_can_manage_franchise(franchise_id));

revoke all on function public.current_test_account_role() from public, anon;
revoke all on function public.current_user_is_test_account() from public, anon;
grant execute on function public.current_test_account_role() to authenticated;
grant execute on function public.current_user_is_test_account() to authenticated;

commit;

