-- The live franchise user email column is citext. A PL/pgSQL RETURN QUERY
-- must cast it to the text declared by these directory functions.
begin;

create or replace function public.collab_recipient_directory(p_number text,p_test boolean)
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

create or replace function public.collab_people(p_number text,p_test boolean)
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

commit;
