-- Keep specification revisions immutable but inactive until clients with
-- specification-only comparison suppression have been distributed.
do $hold$
declare
  model record;
  processed integer := 0;
begin
  for model in
    select m.id, m.pricing_json as model_json, r.id as seeded_revision_id,
      r.pricing_json as seeded_json, p.id as previous_revision_id,
      p.pricing_json as previous_json
    from public.franchise_pricing_models m
    join public.franchise_pricing_model_revisions r on r.id = m.current_revision_id
      and r.published_by in (
        'codex:fiberglass-specifications',
        'codex:fiberglass-legacy-accessory-specifications'
      )
    join public.franchise_pricing_model_revisions p
      on p.pricing_model_id = r.pricing_model_id and p.revision_number = r.revision_number - 1
    for update of m
  loop
    if model.model_json->'fiberglass' <> model.seeded_json->'fiberglass' then
      raise exception 'Fiberglass catalog changed before rollout hold for model %', model.id;
    end if;
    update public.franchise_pricing_models
      set pricing_json = jsonb_set(model.model_json, '{fiberglass}', model.previous_json->'fiberglass', false),
        current_revision_id = model.previous_revision_id,
        updated_at = now(),
        updated_by = 'codex:fiberglass-rollout-hold'
      where id = model.id;
    processed := processed + 1;
  end loop;
  if processed <> 9 then raise exception 'Expected nine models to hold, got %', processed; end if;
end $hold$;
