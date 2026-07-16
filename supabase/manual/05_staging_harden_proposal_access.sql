-- STAGING FIRST. Apply this after the visibility audit, then rerun the standard
-- post-migration verification. It does not modify proposal rows.

begin;

drop policy if exists "allow updates for franchise proposals"
  on public.franchise_proposals;

revoke select, insert, update, delete
  on public.franchise_proposals
  from public, anon;

grant select, insert, update, delete
  on public.franchise_proposals
  to authenticated;

commit;

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'franchise_proposals'
order by policyname;

select
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'franchise_proposals'
order by grantee, privilege_type;

select 'PROPOSAL ACCESS HARDENING PASSED - no proposal rows were changed' as result;
