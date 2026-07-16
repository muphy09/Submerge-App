-- STAGING ONLY. DESTRUCTIVE TO THE CURRENT PROJECT.
-- Never run this against production. Replace the email first. The script refuses
-- to run unless you replace an explicit confirmation token and that email belongs
-- to the sole master tester.

begin;

do $$
declare
  keep_email text := 'brian@bkummer.com';
  staging_confirmation text := 'I_AM_ON_STAGING';
  keep_user_id uuid;
begin
  if keep_email = 'REPLACE_WITH_YOUR_MASTER_EMAIL' then
    raise exception 'Replace keep_email before running this staging sanitizer.';
  end if;
  if staging_confirmation <> 'I_AM_ON_STAGING' then
    raise exception 'Safety stop: replace staging_confirmation only after confirming the staging project is selected.';
  end if;
  select id into keep_user_id from auth.users where lower(email) = lower(keep_email);
  if keep_user_id is null then raise exception 'Master email was not found in auth.users.'; end if;
  if not exists (
    select 1 from public.franchise_users
    where auth_user_id = keep_user_id and lower(role) = 'master' and coalesce(is_active, true)
  ) then raise exception 'The preserved user is not an active master user.'; end if;

  delete from auth.users where id <> keep_user_id;
end;
$$;

-- Keep at most ten recent proposals per franchise in staging.
with ranked as (
  select franchise_id, proposal_number,
    row_number() over (partition by franchise_id order by last_modified desc nulls last, proposal_number) as row_number
  from public.franchise_proposals
)
delete from public.franchise_proposals proposal
using ranked
where proposal.franchise_id = ranked.franchise_id
  and proposal.proposal_number = ranked.proposal_number
  and ranked.row_number > 10;

create or replace function pg_temp.sanitize_proposal_json(
  input jsonb,
  ordinal integer,
  staging_designer_name text
)
returns jsonb language plpgsql as $$
declare
  result jsonb := coalesce(input, '{}'::jsonb);
  sanitized_versions jsonb;
begin
  result := jsonb_set(result, '{customerInfo}', jsonb_build_object(
    'customerName', 'Staging Customer ' || ordinal,
    'address', ordinal || ' Test Pool Lane',
    'city', 'Test City',
    'state', coalesce(result #>> '{customerInfo,state}', 'NC'),
    'county', coalesce(result #>> '{customerInfo,county}', 'Test County'),
    'phone', '555-010-' || lpad((ordinal % 100)::text, 2, '0'),
    'email', 'staging-customer-' || ordinal || '@example.invalid'
  ), true);
  result := jsonb_set(result, '{designerName}', to_jsonb(staging_designer_name), true);
  if jsonb_typeof(result->'versions') = 'array' then
    select coalesce(
      jsonb_agg(pg_temp.sanitize_proposal_json(value, ordinal, staging_designer_name)),
      '[]'::jsonb
    )
      into sanitized_versions
    from jsonb_array_elements(result->'versions');
    result := jsonb_set(result, '{versions}', sanitized_versions, true);
  end if;
  return result;
end;
$$;

with preserved_master as (
  select coalesce(nullif(profile.name, ''), auth_user.email, 'Staging Master') as designer_name
  from auth.users auth_user
  join public.franchise_users profile on profile.auth_user_id = auth_user.id
  where lower(profile.role) = 'master' and coalesce(profile.is_active, true)
  limit 1
), numbered as (
  select franchise_id, proposal_number,
    row_number() over (order by franchise_id, proposal_number)::integer as ordinal
  from public.franchise_proposals
)
update public.franchise_proposals proposal
set proposal_json = pg_temp.sanitize_proposal_json(
      proposal.proposal_json,
      numbered.ordinal,
      preserved_master.designer_name
    ),
    designer_name = preserved_master.designer_name
from numbered
cross join preserved_master
where proposal.franchise_id = numbered.franchise_id
  and proposal.proposal_number = numbered.proposal_number;

do $$
begin
  if to_regclass('public.franchise_feedback') is not null then execute 'delete from public.franchise_feedback'; end if;
  if to_regclass('public.ledger_events') is not null then execute 'delete from public.ledger_events'; end if;
end;
$$;

commit;

select
  franchise.franchise_code,
  franchise.name,
  count(*) as sanitized_proposals,
  bool_and(proposal.proposal_json #>> '{customerInfo,email}' like 'staging-customer-%@example.invalid')
    as customer_email_sanitized,
  bool_and(proposal.designer_name = preserved_master.designer_name)
    as visible_to_master_tester
from public.franchise_proposals proposal
join public.franchises franchise on franchise.id = proposal.franchise_id
cross join (
  select coalesce(nullif(profile.name, ''), auth_user.email, 'Staging Master') as designer_name
  from auth.users auth_user
  join public.franchise_users profile on profile.auth_user_id = auth_user.id
  where lower(profile.role) = 'master' and coalesce(profile.is_active, true)
  limit 1
) preserved_master
group by franchise.franchise_code, franchise.name
order by franchise.franchise_code;
