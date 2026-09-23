-- Match only the pictured accessories in 5555's older March catalog.
-- Its pool shells, Meridian spa, Gemini ledge and Picasso ledge have no verified pictured match.
create temporary table latham_legacy_accessory_seed (
  kind text not null, name text not null, specifications jsonb not null,
  primary key (kind, name)
) on commit drop;
insert into latham_legacy_accessory_seed values
  ('spa', 'Mystic', '{"widthFeet":9,"widthInches":8,"lengthFeet":9,"lengthInches":8,"shallowDepthFeet":3,"shallowDepthInches":4,"deepDepthFeet":3,"deepDepthInches":4,"gallons":950,"surfaceArea":64,"perimeter":28}'::jsonb),
  ('spa', 'Regal', '{"widthFeet":7,"widthInches":8,"lengthFeet":9,"lengthInches":8,"shallowDepthFeet":3,"shallowDepthInches":4,"deepDepthFeet":3,"deepDepthInches":4,"gallons":775,"surfaceArea":52,"perimeter":28}'::jsonb),
  ('spa', 'Royal', '{"widthFeet":7,"widthInches":8,"lengthFeet":9,"lengthInches":8,"shallowDepthFeet":3,"shallowDepthInches":4,"deepDepthFeet":3,"deepDepthInches":4,"gallons":830,"surfaceArea":63,"perimeter":32}'::jsonb),
  ('spa', 'Shasta', '{"widthFeet":6,"widthInches":11,"lengthFeet":6,"lengthInches":11,"shallowDepthFeet":3,"shallowDepthInches":0,"deepDepthFeet":3,"deepDepthInches":0,"gallons":350,"surfaceArea":31,"perimeter":20}'::jsonb),
  ('ledge', 'Gen/Syn/Semicircle', '{"widthFeet":9,"widthInches":4,"lengthFeet":16,"lengthInches":6,"shallowDepthFeet":0,"shallowDepthInches":10,"deepDepthFeet":0,"deepDepthInches":10,"gallons":400,"surfaceArea":92,"perimeter":39}'::jsonb),
  ('ledge', 'Hermosa', '{"widthFeet":5,"widthInches":9,"lengthFeet":9,"lengthInches":8,"shallowDepthFeet":0,"shallowDepthInches":10,"deepDepthFeet":0,"deepDepthInches":10,"gallons":250,"surfaceArea":50,"perimeter":27}'::jsonb),
  ('ledge', 'Rectangle', '{"widthFeet":7,"widthInches":8,"lengthFeet":15,"lengthInches":8,"shallowDepthFeet":0,"shallowDepthInches":10,"deepDepthFeet":0,"deepDepthInches":10,"gallons":400,"surfaceArea":105,"perimeter":44}'::jsonb),
  ('ledge', 'Semicircle', '{"widthFeet":8,"widthInches":4,"lengthFeet":16,"lengthInches":0,"shallowDepthFeet":0,"shallowDepthInches":10,"deepDepthFeet":0,"deepDepthInches":10,"gallons":310,"surfaceArea":93,"perimeter":39}'::jsonb);

do $legacy$
declare
  model record;
  revised jsonb;
  updated_list jsonb;
  spa_matches integer;
  ledge_matches integer;
  new_revision_id uuid;
begin
  if (select count(*) from latham_legacy_accessory_seed) <> 8 then raise exception 'Accessory seed count changed'; end if;
  select m.*, r.revision_number, r.pricing_json as pinned_json into strict model
  from public.franchise_pricing_models m
  join public.franchises f on f.id=m.franchise_id and f.franchise_code='5555' and f.is_active
  join public.franchise_pricing_model_revisions r on r.id=m.current_revision_id
  where m.name='March 2026'
  for update of m;
  if model.revision_number <> 2 or model.pricing_json->'fiberglass' <> model.pinned_json->'fiberglass' then
    raise exception 'March 2026 pricing changed since verification';
  end if;
  revised := model.pinned_json;
  select count(*) into spa_matches
  from jsonb_array_elements(revised #> '{fiberglass,spaOptions}') item
  join latham_legacy_accessory_seed seed on seed.kind='spa' and seed.name=item->>'name';
  if spa_matches <> 4 then raise exception 'Expected four March spa matches, got %', spa_matches; end if;
  select jsonb_agg(case when seed.specifications is null then item
    else item || jsonb_build_object('specifications',seed.specifications) end order by ordinal)
    into updated_list
  from jsonb_array_elements(revised #> '{fiberglass,spaOptions}') with ordinality entries(item,ordinal)
  left join latham_legacy_accessory_seed seed on seed.kind='spa' and seed.name=item->>'name';
  revised := jsonb_set(revised,'{fiberglass,spaOptions}',updated_list,false);
  select count(*) into ledge_matches
  from jsonb_array_elements(revised #> '{fiberglass,tanningLedgeOptions}') item
  join latham_legacy_accessory_seed seed on seed.kind='ledge' and seed.name=
    case item->>'name' when 'Genesis' then 'Gen/Syn/Semicircle'
      when 'Semi-Circle' then 'Semicircle' else item->>'name' end;
  if ledge_matches <> 4 then raise exception 'Expected four March ledge matches, got %', ledge_matches; end if;
  select jsonb_agg(case when seed.specifications is null then item
    else item || jsonb_build_object('specifications',seed.specifications) end order by ordinal)
    into updated_list
  from jsonb_array_elements(revised #> '{fiberglass,tanningLedgeOptions}') with ordinality entries(item,ordinal)
  left join latham_legacy_accessory_seed seed on seed.kind='ledge' and seed.name=
    case item->>'name' when 'Genesis' then 'Gen/Syn/Semicircle'
      when 'Semi-Circle' then 'Semicircle' else item->>'name' end;
  revised := jsonb_set(revised,'{fiberglass,tanningLedgeOptions}',updated_list,false);
  insert into public.franchise_pricing_model_revisions
    (pricing_model_id, franchise_id, revision_number, pricing_json, source_version, change_summary, published_by)
  values (model.id,model.franchise_id,model.revision_number+1,revised,model.version,
    jsonb_build_array(jsonb_build_object('section','fiberglass','change','Manufacturer accessory specifications only')),
    'codex:fiberglass-legacy-accessory-specifications') returning id into new_revision_id;
  update public.franchise_pricing_models
    set pricing_json=jsonb_set(model.pricing_json,'{fiberglass}',revised->'fiberglass',false),
      current_revision_id=new_revision_id,updated_at=now(),updated_by='codex:fiberglass-legacy-accessory-specifications'
    where id=model.id;
end $legacy$;
