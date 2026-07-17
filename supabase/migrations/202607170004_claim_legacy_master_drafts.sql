-- Allow a master to reclaim only legacy drafts that were explicitly stamped
-- as master-created before designer_auth_user_id existed. The next successful
-- write pins the immutable Auth user ID. No proposal rows are changed here.

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
  ) or (
    target_designer_auth_user_id is null
    and lower(trim(coalesce(target_proposal_json ->> 'designerRole', ''))) = 'master'
    and nullif(lower(trim(coalesce(
          nullif(target_designer_name, ''),
          target_proposal_json ->> 'designerName',
          ''
        ))), '') is not null
    and exists (
      select 1
      from public.franchise_users profile
      where profile.auth_user_id = auth.uid()
        and lower(profile.role) = 'master'
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
      where candidate.auth_user_id is not null
        and lower(candidate.role) = 'master'
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

commit;
