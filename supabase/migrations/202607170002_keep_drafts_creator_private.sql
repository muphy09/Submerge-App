-- Draft proposals remain private to their creator for every role. Reviewers
-- gain franchise-wide access only after a proposal leaves draft status.
-- Additive policy correction: no proposal rows or proposal JSON are changed.

begin;

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
  select (
    target_designer_auth_user_id = auth.uid()
    and exists (
      select 1
      from public.franchise_users profile
      where profile.auth_user_id = auth.uid()
        and coalesce(profile.is_active, true) = true
        and (
          lower(profile.role) = 'master'
          or profile.franchise_id = target_franchise_id
        )
    )
  ) or (
    target_designer_auth_user_id is null
    and nullif(lower(trim(coalesce(
          nullif(target_designer_name, ''),
          target_proposal_json ->> 'designerName',
          ''
        ))), '') is not null
    and exists (
      select 1
      from public.franchise_users profile
      where profile.auth_user_id = auth.uid()
        and profile.franchise_id = target_franchise_id
        and coalesce(profile.is_active, true) = true
        and lower(trim(coalesce(
              nullif(target_designer_name, ''),
              target_proposal_json ->> 'designerName',
              ''
            ))) in (
              lower(trim(coalesce(profile.name, ''))),
              lower(trim(coalesce(profile.email, '')))
            )
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
  );
$$;

revoke all on function public.current_user_owns_proposal(text, uuid, text, jsonb) from public, anon;
grant execute on function public.current_user_owns_proposal(text, uuid, text, jsonb) to authenticated;

drop policy if exists "proposal_role_select" on public.franchise_proposals;
drop policy if exists "proposal_role_insert" on public.franchise_proposals;
drop policy if exists "proposal_role_update" on public.franchise_proposals;
drop policy if exists "proposal_role_delete" on public.franchise_proposals;

create policy "proposal_role_select"
  on public.franchise_proposals for select to authenticated
  using (
    public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      public.current_user_can_review_franchise(franchise_id)
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  );

create policy "proposal_role_insert"
  on public.franchise_proposals for insert to authenticated
  with check (
    public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
  );

create policy "proposal_role_update"
  on public.franchise_proposals for update to authenticated
  using (
    public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      public.current_user_can_review_franchise(franchise_id)
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  )
  with check (
    public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      public.current_user_can_review_franchise(franchise_id)
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  );

create policy "proposal_role_delete"
  on public.franchise_proposals for delete to authenticated
  using (
    public.current_user_owns_proposal(
      franchise_id,
      designer_auth_user_id,
      designer_name,
      proposal_json
    )
    or (
      (
        public.current_user_is_master()
        or public.current_user_can_manage_franchise(franchise_id)
      )
      and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
    )
  );

commit;
