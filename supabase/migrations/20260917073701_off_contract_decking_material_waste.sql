-- Deploy with the desktop release that understands materialWasteRate.
-- Publish new revisions only. Proposal JSON, historical revisions, and the
-- legacy model pricing_json read by old clients are deliberately untouched.
begin;

do $$
declare
  model public.franchise_pricing_models%rowtype;
  current_revision public.franchise_pricing_model_revisions%rowtype;
  next_pricing jsonb;
  next_revision_id uuid;
  next_revision_number integer;
begin
  for model in select * from public.franchise_pricing_models order by id loop
    perform pg_advisory_xact_lock(hashtext('pricing-model:' || model.id::text));
    select * into current_revision
      from public.franchise_pricing_model_revisions
      where pricing_model_id = model.id order by revision_number desc limit 1;
    if not found then
      raise exception 'Model % has no immutable baseline; aborting waste rollout.', model.id;
    end if;
    -- Idempotent and preserves an explicit admin value, including zero.
    if current_revision.pricing_json #> '{tileCoping,offContractDecking,materialWasteRate}' is not null
      and current_revision.pricing_json #> '{tileCoping,onContractDecking,quantityWasteRate}' is not null
      and current_revision.pricing_json #> '{tileCoping,onContractDecking,freeformWasteRate}' is not null then
      continue;
    end if;
    next_pricing := jsonb_set(current_revision.pricing_json, '{tileCoping}',
      coalesce(current_revision.pricing_json -> 'tileCoping', '{}'::jsonb) ||
      jsonb_build_object('offContractDecking',
        '{"materialWasteRate":0.10}'::jsonb ||
        coalesce(current_revision.pricing_json #> '{tileCoping,offContractDecking}', '{}'::jsonb),
        'onContractDecking', '{"quantityWasteRate":0.05,"freeformWasteRate":0.05}'::jsonb ||
        coalesce(current_revision.pricing_json #> '{tileCoping,onContractDecking}', '{}'::jsonb)));
    next_revision_number := current_revision.revision_number + 1;
    insert into public.franchise_pricing_model_revisions (
      pricing_model_id, franchise_id, revision_number, pricing_json,
      source_version, change_summary, published_by
    ) values (
      model.id, model.franchise_id, next_revision_number, next_pricing,
      current_revision.source_version,
      '[{"path":"tileCoping.offContractDecking.materialWasteRate","label":"Off Contract Decking - Material Waste","before":0,"after":0.10}]'::jsonb,
      'global-off-contract-decking-material-waste'
    ) returning id into next_revision_id;
    update public.franchise_pricing_models
      set current_revision_id = next_revision_id, updated_at = now(),
          updated_by = 'global-off-contract-decking-material-waste'
      where id = model.id;
  end loop;
end;
$$;

commit;
