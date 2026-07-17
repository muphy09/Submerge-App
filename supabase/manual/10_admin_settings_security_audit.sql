-- READ ONLY. Audits server-side protection for Owner-only Admin Settings.
-- This never returns the stored PIN or any branding values.

with audit_rows as (
  select
    1 as sort_order,
    'RLS'::text as category,
    table_definition.relname::text as object_name,
    format(
      'enabled=%s, forced=%s',
      table_definition.relrowsecurity,
      table_definition.relforcerowsecurity
    ) as detail
  from pg_class table_definition
  join pg_namespace namespace on namespace.oid = table_definition.relnamespace
  where namespace.nspname = 'public'
    and table_definition.relname in ('franchise_branding', 'franchises')

  union all

  select
    2,
    'POLICY',
    tablename || '.' || policyname,
    format(
      'roles=%s; command=%s; using=%s; check=%s',
      roles,
      cmd,
      coalesce(qual, 'NULL'),
      coalesce(with_check, 'NULL')
    )
  from pg_policies
  where schemaname = 'public'
    and tablename in ('franchise_branding', 'franchises')

  union all

  select
    3,
    'TABLE GRANTS',
    table_name || '.' || grantee,
    string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in ('franchise_branding', 'franchises')
    and lower(grantee) in ('public', 'anon', 'authenticated')
  group by table_name, grantee

  union all

  select
    4,
    'PIN COLUMN GRANTS',
    table_name || '.' || column_name || '.' || grantee,
    string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'franchise_branding'
    and column_name = 'admin_panel_pin'
    and lower(grantee) in ('public', 'anon', 'authenticated')
  group by table_name, column_name, grantee
)
select category, object_name, detail
from audit_rows
union all
select 'RESULT', 'read-only audit', 'ADMIN SETTINGS SECURITY AUDIT COMPLETE - no data was changed'
order by category, object_name;
