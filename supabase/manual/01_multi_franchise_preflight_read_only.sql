-- READ-ONLY PREFLIGHT. Safe to run in the Supabase SQL Editor.
-- It raises an error instead of changing anything when the production schema
-- does not match the assumptions required by the additive migration.

do $$
declare
  v_type text;
  v_count integer;
  v_column text;
begin
  if to_regclass('public.franchises') is null then raise exception 'Missing public.franchises'; end if;
  if to_regclass('public.franchise_users') is null then raise exception 'Missing public.franchise_users'; end if;
  if to_regclass('public.franchise_proposals') is null then raise exception 'Missing public.franchise_proposals'; end if;
  if to_regclass('public.franchise_pricing_models') is null then raise exception 'Missing public.franchise_pricing_models'; end if;

  select data_type into v_type from information_schema.columns
  where table_schema = 'public' and table_name = 'franchises' and column_name = 'id';
  if v_type not in ('text', 'character varying') then
    raise exception 'franchises.id must be text-compatible; found %', coalesce(v_type, 'missing');
  end if;

  select data_type into v_type from information_schema.columns
  where table_schema = 'public' and table_name = 'franchise_pricing_models' and column_name = 'id';
  if v_type not in ('text', 'character varying') then
    raise exception 'franchise_pricing_models.id must be text-compatible; found %', coalesce(v_type, 'missing');
  end if;

  select udt_name into v_type from information_schema.columns
  where table_schema = 'public' and table_name = 'franchise_pricing_models' and column_name = 'pricing_json';
  if v_type <> 'jsonb' then
    raise exception 'franchise_pricing_models.pricing_json must be jsonb; found %', coalesce(v_type, 'missing');
  end if;

  select udt_name into v_type from information_schema.columns
  where table_schema = 'public' and table_name = 'franchise_proposals' and column_name = 'proposal_json';
  if v_type <> 'jsonb' then
    raise exception 'franchise_proposals.proposal_json must be jsonb; found %', coalesce(v_type, 'missing');
  end if;

  foreach v_column in array array['proposal_number', 'franchise_id', 'proposal_json'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'franchise_proposals'
        and column_name = v_column
    ) then raise exception 'franchise_proposals is missing required column %', v_column; end if;
  end loop;

  foreach v_column in array array[
    'franchise_id', 'name', 'version', 'pricing_json', 'is_default',
    'is_hidden_from_view', 'created_at', 'updated_at', 'updated_by'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'franchise_pricing_models'
        and column_name = v_column
    ) then raise exception 'franchise_pricing_models is missing required column %', v_column; end if;
  end loop;

  foreach v_column in array array['auth_user_id', 'franchise_id', 'role', 'is_active'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'franchise_users'
        and column_name = v_column
    ) then raise exception 'franchise_users is missing required column %', v_column; end if;
  end loop;

  select count(*) into v_count from public.franchises where franchise_code = '5555';
  if v_count <> 1 then raise exception 'Expected exactly one PPAS West franchise code 5555; found %', v_count; end if;
  select count(*) into v_count from public.franchises where franchise_code = '6666';
  if v_count <> 1 then raise exception 'Expected exactly one PPAS East franchise code 6666; found %', v_count; end if;

  select count(*) into v_count
  from public.franchise_pricing_models model
  left join public.franchises franchise on franchise.id = model.franchise_id
  where franchise.id is null;
  if v_count > 0 then raise exception 'Found % pricing models with a missing franchise', v_count; end if;

  select count(*) into v_count
  from public.franchise_pricing_models
  where pricing_json is null;
  if v_count > 0 then raise exception 'Found % pricing models with null pricing_json', v_count; end if;

  select count(*) into v_count
  from public.franchise_users app_user
  left join public.franchises franchise on franchise.id = app_user.franchise_id
  where lower(coalesce(app_user.role, '')) <> 'master'
    and franchise.id is null;
  if v_count > 0 then raise exception 'Found % non-master users with a missing franchise', v_count; end if;
end;
$$;

select
  franchise.franchise_code,
  franchise.name,
  franchise.id as franchise_id,
  count(distinct app_user.id) as users,
  count(distinct proposal.proposal_number) as proposals,
  count(distinct model.id) as pricing_models
from public.franchises franchise
left join public.franchise_users app_user on app_user.franchise_id = franchise.id
left join public.franchise_proposals proposal on proposal.franchise_id = franchise.id
left join public.franchise_pricing_models model on model.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '6666')
group by franchise.franchise_code, franchise.name, franchise.id
order by franchise.franchise_code;

select 'PREFLIGHT PASSED - no data was changed' as result;
