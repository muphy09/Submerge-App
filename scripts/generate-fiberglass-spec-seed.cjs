const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(__dirname, 'data', 'latham-fiberglass-specifications.txt');
const target = path.join(root, 'supabase', 'migrations', '20260923000000_fiberglass_specifications.sql');
const rows = fs.readFileSync(source, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
const parsed = rows.map((line) => line.split('|'));
for (const row of parsed) {
  if (row.length !== 10 || !['pool', 'spa', 'ledge'].includes(row[0])) throw new Error(`Bad row: ${row.join('|')}`);
  for (const field of row.slice(2, 6)) {
    const [feet, inches] = field.split(':').map(Number);
    if (!Number.isInteger(feet) || !Number.isFinite(inches) || feet < 0 || inches < 0 || inches >= 12) throw new Error(`Bad dimension: ${row[1]} ${field}`);
  }
  if (row.slice(6, 9).some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) throw new Error(`Bad area/perimeter/gallons: ${row[1]}`);
  if (row[0] === 'pool' && (!Number.isFinite(Number(row[9])) || Number(row[9]) < 0)) throw new Error(`Bad steps: ${row[1]}`);
}
const counts = Object.fromEntries(['pool', 'spa', 'ledge'].map((kind) => [kind, parsed.filter((row) => row[0] === kind).length]));
if (counts.pool !== 61 || counts.spa !== 4 || counts.ledge !== 4) throw new Error(`Unexpected source counts: ${JSON.stringify(counts)}`);
if (new Set(parsed.map((row) => `${row[0]}:${row[1]}`)).size !== parsed.length) throw new Error('Duplicate catalog names');
const values = parsed.map((row) => `  ('${row.map((value) => value.replaceAll("'", "''")).join('|')}')`).join(',\n');

const sql = `-- Targeted immutable data migration. Source: scripts/data/latham-fiberglass-specifications.txt.
-- Only the eight verified current Latham catalogs are eligible. Historical revisions and proposals are untouched.
create temporary table latham_fiberglass_seed_line (line text not null) on commit drop;
insert into latham_fiberglass_seed_line (line) values
${values};

create temporary table latham_fiberglass_seed (
  kind text not null, name text not null, specifications jsonb not null,
  primary key (kind, name)
) on commit drop;
insert into latham_fiberglass_seed(kind, name, specifications)
select split_part(line, '|', 1), split_part(line, '|', 2),
  jsonb_build_object(
    'widthFeet', split_part(split_part(line, '|', 3), ':', 1)::numeric,
    'widthInches', split_part(split_part(line, '|', 3), ':', 2)::numeric,
    'lengthFeet', split_part(split_part(line, '|', 4), ':', 1)::numeric,
    'lengthInches', split_part(split_part(line, '|', 4), ':', 2)::numeric,
    'shallowDepthFeet', split_part(split_part(line, '|', 5), ':', 1)::numeric,
    'shallowDepthInches', split_part(split_part(line, '|', 5), ':', 2)::numeric,
    'deepDepthFeet', split_part(split_part(line, '|', 6), ':', 1)::numeric,
    'deepDepthInches', split_part(split_part(line, '|', 6), ':', 2)::numeric,
    'gallons', split_part(line, '|', 7)::numeric,
    'surfaceArea', split_part(line, '|', 8)::numeric,
    'perimeter', split_part(line, '|', 9)::numeric
  ) || case when split_part(line, '|', 1) = 'pool'
    then jsonb_build_object('stepsAndBench', split_part(line, '|', 10)::numeric)
    else '{}'::jsonb end
from latham_fiberglass_seed_line;

do $migration$
declare
  model record;
  revised jsonb;
  updated_list jsonb;
  size_name text;
  pool_matches integer;
  spa_matches integer;
  ledge_matches integer;
  new_revision_id uuid;
  processed integer := 0;
begin
  if (select count(*) from latham_fiberglass_seed) <> 69 then raise exception 'Fiberglass source count changed'; end if;
  for model in
    select m.*, f.franchise_code, r.revision_number, r.pricing_json as pinned_json,
      expected.expected_revision
    from public.franchise_pricing_models m
    join public.franchises f on f.id = m.franchise_id and f.is_active
    join public.franchise_pricing_model_revisions r on r.id = m.current_revision_id
    join (values
      ('5555', 'April 2026', 2), ('5555', 'June 2026', 2),
      ('5555', 'July 2026', 7), ('5555', 'Sizzlin Summer 2026', 2),
      ('8669', 'April 2026', 2),
      ('9724', 'June 2026', 2), ('9724', 'August 2026', 6),
      ('9724', 'Endless Summer 2026', 5)
    ) expected(franchise_code, model_name, expected_revision)
      on expected.franchise_code = f.franchise_code and expected.model_name = m.name
    for update of m
  loop
    if model.revision_number <> model.expected_revision or
      model.pricing_json->'fiberglass' <> model.pinned_json->'fiberglass' then
      raise exception 'Pricing model % / % changed since verification', model.franchise_code, model.name;
    end if;
    revised := model.pinned_json;
    pool_matches := 0;
    for size_name in select unnest(array['small', 'medium', 'large']) loop
      select count(*) into strict spa_matches
      from jsonb_array_elements(coalesce(revised #> array['fiberglass', 'poolModels', size_name], '[]'::jsonb)) item
      join latham_fiberglass_seed seed on seed.kind = 'pool' and seed.name =
        case item->>'name'
          when 'Corinthian 12 BME' then 'Corinthian 12B'
          when 'Corinthian 14 BME' then 'Corinthian 14B'
          when 'Corinthian 16 BME' then 'Corinthian 16B'
          when 'Synergy' then 'Synergy 16'
          else split_part(item->>'name', ' (', 1)
        end;
      pool_matches := pool_matches + spa_matches;
      select coalesce(jsonb_agg(
        case when seed.specifications is null then item else item || jsonb_build_object('specifications', seed.specifications) end
        order by ordinal), '[]'::jsonb) into updated_list
      from jsonb_array_elements(coalesce(revised #> array['fiberglass', 'poolModels', size_name], '[]'::jsonb)) with ordinality entries(item, ordinal)
      left join latham_fiberglass_seed seed on seed.kind = 'pool' and seed.name =
        case item->>'name'
          when 'Corinthian 12 BME' then 'Corinthian 12B'
          when 'Corinthian 14 BME' then 'Corinthian 14B'
          when 'Corinthian 16 BME' then 'Corinthian 16B'
          when 'Synergy' then 'Synergy 16'
          else split_part(item->>'name', ' (', 1)
        end;
      revised := jsonb_set(revised, array['fiberglass', 'poolModels', size_name], updated_list, false);
    end loop;
    if pool_matches <> 61 then raise exception 'Expected 61 pool matches for % / %, got %', model.franchise_code, model.name, pool_matches; end if;
    select count(*) into spa_matches from jsonb_array_elements(coalesce(revised #> '{fiberglass,spaOptions}', '[]'::jsonb)) item
      join latham_fiberglass_seed seed on seed.kind = 'spa' and seed.name = item->>'name';
    if spa_matches <> 4 then raise exception 'Expected four spa matches for % / %', model.franchise_code, model.name; end if;
    select coalesce(jsonb_agg(item || jsonb_build_object('specifications', seed.specifications) order by ordinal), '[]'::jsonb)
      into updated_list
    from jsonb_array_elements(revised #> '{fiberglass,spaOptions}') with ordinality entries(item, ordinal)
    join latham_fiberglass_seed seed on seed.kind = 'spa' and seed.name = item->>'name';
    revised := jsonb_set(revised, '{fiberglass,spaOptions}', updated_list, false);
    select count(*) into ledge_matches from jsonb_array_elements(coalesce(revised #> '{fiberglass,tanningLedgeOptions}', '[]'::jsonb)) item
      join latham_fiberglass_seed seed on seed.kind = 'ledge' and seed.name =
        case item->>'name' when 'Genesis/Synergy Side Ledge' then 'Gen/Syn/Semicircle'
          when 'Hermosa Tanning Ledge' then 'Hermosa'
          when 'Rectangle Tanning Ledge' then 'Rectangle'
          when 'Semicircle Tanning Ledge' then 'Semicircle' else item->>'name' end;
    if ledge_matches <> 4 then raise exception 'Expected four ledge matches for % / %', model.franchise_code, model.name; end if;
    select coalesce(jsonb_agg(item || jsonb_build_object('specifications', seed.specifications) order by ordinal), '[]'::jsonb)
      into updated_list
    from jsonb_array_elements(revised #> '{fiberglass,tanningLedgeOptions}') with ordinality entries(item, ordinal)
    join latham_fiberglass_seed seed on seed.kind = 'ledge' and seed.name =
      case item->>'name' when 'Genesis/Synergy Side Ledge' then 'Gen/Syn/Semicircle'
        when 'Hermosa Tanning Ledge' then 'Hermosa'
        when 'Rectangle Tanning Ledge' then 'Rectangle'
        when 'Semicircle Tanning Ledge' then 'Semicircle' else item->>'name' end;
    revised := jsonb_set(revised, '{fiberglass,tanningLedgeOptions}', updated_list, false);

    insert into public.franchise_pricing_model_revisions
      (pricing_model_id, franchise_id, revision_number, pricing_json, source_version, change_summary, published_by)
    values (model.id, model.franchise_id, model.revision_number + 1, revised, model.version,
      jsonb_build_array(jsonb_build_object('section', 'fiberglass', 'change', 'Manufacturer specifications only')),
      'codex:fiberglass-specifications')
    returning id into new_revision_id;
    update public.franchise_pricing_models
      set pricing_json = jsonb_set(model.pricing_json, '{fiberglass}', revised->'fiberglass', false),
      current_revision_id = new_revision_id,
      updated_at = now(), updated_by = 'codex:fiberglass-specifications' where id = model.id;
    processed := processed + 1;
  end loop;
  if processed <> 8 then raise exception 'Expected eight eligible pricing models, got %', processed; end if;
end $migration$;
`;
fs.writeFileSync(target, sql);
console.log(`Generated ${target} with ${counts.pool} pools, ${counts.spa} spas, ${counts.ledge} ledges`);

const legacyTarget = path.join(root, 'supabase', 'migrations', '20260923010000_fiberglass_legacy_accessory_specifications.sql');
const accessoryValues = parsed.filter((row) => row[0] !== 'pool').map((row) => {
  const [kind, name, width, length, shallow, deep, gallons, surfaceArea, perimeter] = row;
  const [widthFeet, widthInches] = width.split(':').map(Number);
  const [lengthFeet, lengthInches] = length.split(':').map(Number);
  const [shallowDepthFeet, shallowDepthInches] = shallow.split(':').map(Number);
  const [deepDepthFeet, deepDepthInches] = deep.split(':').map(Number);
  const specs = { widthFeet, widthInches, lengthFeet, lengthInches, shallowDepthFeet, shallowDepthInches,
    deepDepthFeet, deepDepthInches, gallons: Number(gallons), surfaceArea: Number(surfaceArea), perimeter: Number(perimeter) };
  return `  ('${kind}', '${name.replaceAll("'", "''")}', '${JSON.stringify(specs)}'::jsonb)`;
}).join(',\n');
const legacySql = `-- Match only the pictured accessories in 5555's older March catalog.
-- Its pool shells, Meridian spa, Gemini ledge and Picasso ledge have no verified pictured match.
create temporary table latham_legacy_accessory_seed (
  kind text not null, name text not null, specifications jsonb not null,
  primary key (kind, name)
) on commit drop;
insert into latham_legacy_accessory_seed values
${accessoryValues};

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
`;
fs.writeFileSync(legacyTarget, legacySql);
console.log(`Generated ${legacyTarget} with eight matched accessories`);
