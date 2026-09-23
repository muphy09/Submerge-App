-- Older application builds show their generic pricing prompt for this revision.
-- The updated application shows an informational Fiberglass Dimensions notice.
-- The nine seeded revisions were published, then held by the 20260923020000 migration.
-- This guarded transaction activates exactly those nine revisions. If any model
-- received later admin edits, it aborts without changing any model.
do $activate$
declare
  model record;
  processed integer := 0;
begin
  for model in
    select m.id, m.pricing_json as model_json,
      m.current_revision_id as held_revision_id,
      p.pricing_json as held_json,
      r.id as seeded_revision_id,
      r.pricing_json as seeded_json
    from public.franchise_pricing_models m
    join public.franchise_pricing_model_revisions r
      on r.pricing_model_id = m.id and r.published_by in (
        'codex:fiberglass-specifications',
        'codex:fiberglass-legacy-accessory-specifications'
      )
    join public.franchise_pricing_model_revisions p
      on p.id = m.current_revision_id
      and p.pricing_model_id = r.pricing_model_id
      and p.revision_number = r.revision_number - 1
    for update of m
  loop
    if model.model_json->'fiberglass' <> model.held_json->'fiberglass' then
      raise exception 'Fiberglass catalog changed since rollout hold for model %', model.id;
    end if;
    update public.franchise_pricing_models
      set pricing_json = jsonb_set(model.model_json, '{fiberglass}', model.seeded_json->'fiberglass', false),
        current_revision_id = model.seeded_revision_id,
        updated_at = now(),
        updated_by = 'codex:fiberglass-specifications-activation'
      where id = model.id;
    processed := processed + 1;
  end loop;
  if processed <> 9 then raise exception 'Expected nine held models, got %', processed; end if;
end $activate$;
