-- READ-ONLY POST-MIGRATION VERIFICATION. Safe in staging or production.

do $$
declare
  v_missing integer;
begin
  if to_regclass('public.franchise_pricing_model_revisions') is null then raise exception 'Missing pricing revisions table'; end if;
  if to_regclass('public.franchise_configuration_revisions') is null then raise exception 'Missing configuration revisions table'; end if;
  if to_regclass('public.franchise_configuration_assignments') is null then raise exception 'Missing configuration assignments table'; end if;
  if to_regclass('public.franchise_release_assignments') is null then raise exception 'Missing release assignments table'; end if;
  if to_regclass('public.franchise_contract_templates') is null then raise exception 'Missing contract templates table'; end if;
  if to_regclass('public.franchise_contract_template_revisions') is null then raise exception 'Missing contract revisions table'; end if;

  select count(*) into v_missing
  from public.franchise_pricing_models model
  left join public.franchise_pricing_model_revisions revision on revision.id = model.current_revision_id
  where model.current_revision_id is null or revision.id is null;
  if v_missing > 0 then raise exception '% pricing models do not have a valid current revision', v_missing; end if;

  select count(*) into v_missing
  from public.franchise_proposals proposal
  where nullif(proposal.proposal_json->>'pricingModelId', '') is not null
    and nullif(proposal.proposal_json->>'pricingModelRevisionId', '') is null;
  if v_missing > 0 then raise exception '% legacy proposals with a pricing model were not revision-pinned', v_missing; end if;

  select count(*) into v_missing
  from public.franchise_proposals proposal
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(proposal.proposal_json->'versions') = 'array'
        then proposal.proposal_json->'versions'
      else '[]'::jsonb
    end
  ) stored_version
  where nullif(stored_version->>'pricingModelId', '') is not null
    and nullif(stored_version->>'pricingModelRevisionId', '') is null;
  if v_missing > 0 then raise exception '% stored proposal versions were not revision-pinned', v_missing; end if;

  select count(*) into v_missing
  from public.franchises franchise
  left join public.franchise_configuration_assignments assignment on assignment.franchise_id = franchise.id
  where assignment.franchise_id is null;
  if v_missing > 0 then raise exception '% franchises do not have a configuration assignment', v_missing; end if;

  select count(*) into v_missing
  from public.franchises franchise
  left join public.franchise_release_assignments assignment on assignment.franchise_id = franchise.id
  where assignment.franchise_id is null;
  if v_missing > 0 then raise exception '% franchises do not have a release assignment', v_missing; end if;

  select count(*) into v_missing
  from pg_class table_definition
  join pg_namespace namespace on namespace.oid = table_definition.relnamespace
  where namespace.nspname = 'public'
    and table_definition.relname in (
      'franchise_pricing_model_revisions',
      'franchise_configuration_revisions',
      'franchise_configuration_assignments',
      'franchise_release_assignments',
      'franchise_contract_templates',
      'franchise_contract_template_revisions'
    )
    and table_definition.relrowsecurity is false;
  if v_missing > 0 then raise exception '% new tables do not have RLS enabled', v_missing; end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'franchise-contract-templates' and public is false
  ) then raise exception 'Private franchise-contract-templates bucket is missing'; end if;
end;
$$;

select
  franchise.franchise_code,
  franchise.name,
  count(distinct model.id) as pricing_models,
  count(distinct pricing_revision.id) as pricing_revisions,
  max(config_revision.revision_number) as configuration_revision,
  release_assignment.core_version,
  release_assignment.franchise_release_number,
  release_assignment.release_channel,
  release_assignment.update_enabled
from public.franchises franchise
left join public.franchise_pricing_models model on model.franchise_id = franchise.id
left join public.franchise_pricing_model_revisions pricing_revision on pricing_revision.pricing_model_id = model.id
left join public.franchise_configuration_assignments config_assignment on config_assignment.franchise_id = franchise.id
left join public.franchise_configuration_revisions config_revision on config_revision.id = config_assignment.current_revision_id
left join public.franchise_release_assignments release_assignment on release_assignment.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '6666')
group by franchise.franchise_code, franchise.name, release_assignment.core_version,
  release_assignment.franchise_release_number, release_assignment.release_channel,
  release_assignment.update_enabled
order by franchise.franchise_code;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'franchise_pricing_model_revisions',
    'franchise_configuration_revisions',
    'franchise_configuration_assignments',
    'franchise_release_assignments',
    'franchise_contract_templates',
    'franchise_contract_template_revisions'
  )
order by c.relname;

select id, name, public
from storage.buckets
where id = 'franchise-contract-templates';

select 'POST-MIGRATION VERIFICATION PASSED' as result;
