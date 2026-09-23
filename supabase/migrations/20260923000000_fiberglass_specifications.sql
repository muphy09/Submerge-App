-- Targeted immutable data migration. Source: scripts/data/latham-fiberglass-specifications.txt.
-- Only the eight verified current Latham catalogs are eligible. Historical revisions and proposals are untouched.
create temporary table latham_fiberglass_seed_line (line text not null) on commit drop;
insert into latham_fiberglass_seed_line (line) values
  ('pool|Apollo 14|13:10|32:0|3:6|6:1|7700|391|87|53'),
  ('pool|Ariel 16|15:10|40:0|3:6|7:4|15300|570|107|27'),
  ('pool|Aruba|11:0|22:0|3:6|5:0|5200|177|54|19'),
  ('pool|Astoria 12|12:0|28:0|3:6|5:7|6000|277|102|27'),
  ('pool|Astoria 14|14:0|35:0|3:6|6:6|10700|434|120|32'),
  ('pool|Astoria 16|15:10|40:0|3:6|7:0|15600|548|137|36'),
  ('pool|Axiom 12|12:0|26:0|4:0|5:0|5300|214|64|22'),
  ('pool|Axiom 12 Deluxe|12:0|26:0|3:0|4:7|4400|209|73|35'),
  ('pool|Axiom 14|14:0|30:0|4:0|6:0|8000|297|74|33'),
  ('pool|Axiom 14 Deluxe|14:0|30:0|4:6|5:6|5100|288|89|51'),
  ('pool|Axiom 16|16:0|35:0|4:6|6:6|11600|395|87|50'),
  ('pool|Barcelona|16:0|37:10|3:6|7:0|18500|518|101|36'),
  ('pool|Bay Isle|14:6|29:10|3:0|6:6|10000|318|74|25'),
  ('pool|Bermuda 12|12:0|26:0|3:6|5:6|7000|226|63|29'),
  ('pool|Bermuda 12 Deluxe|12:0|26:0|3:6|5:6|4500|216|84|24'),
  ('pool|Bermuda 14|14:0|30:0|3:6|6:0|10000|310|74|22'),
  ('pool|Bermuda 14 Deluxe|14:0|30:0|4:0|6:0|9000|300|92|31'),
  ('pool|Bermuda 16.35|16:0|35:0|3:6|6:6|14000|397|86|22'),
  ('pool|Bermuda 16.35 Deluxe|16:0|35:0|4:3|6:6|11500|381|114|37'),
  ('pool|Bermuda 16.40|16:0|40:0|3:6|6:6|17000|468|96|32'),
  ('pool|Cape Cod 12|12:0|26:9|3:6|5:5|6800|233|69|13'),
  ('pool|Cape Cod 14|14:0|31:0|3:6|6:0|12000|325|79|13'),
  ('pool|Cape Cod 16|16:0|36:0|3:6|7:0|18000|451|93|13'),
  ('pool|Claremont|14:0|33:0|3:7|5:4|11700|416|90|48'),
  ('pool|Coral 16|15:10|30:10|3:6|6:11|9000|331|75|34'),
  ('pool|Corinthian 12|12:0|25:0|3:6|5:5|5100|254|69|39'),
  ('pool|Corinthian 12B|12:0|25:0|3:6|5:5|5100|254|69|39'),
  ('pool|Corinthian 14|14:0|30:0|3:6|6:0|8200|365|83|45'),
  ('pool|Corinthian 14B|14:0|30:0|3:6|6:0|8200|365|83|45'),
  ('pool|Corinthian 16|15:10|40:0|3:6|7:0|15400|563|107|49'),
  ('pool|Corinthian 16B|15:10|40:0|3:6|7:0|15400|563|107|49'),
  ('pool|Coronado|15:0|34:0|3:6|6:6|13000|410|84|24'),
  ('pool|Delray|11:10|25:5|4:6|4:6|8100|264|70|20'),
  ('pool|Enchantment 9.17|9:1|17:5|4:9|4:9|3200|129|48|29'),
  ('pool|Enchantment 9.21|9:1|20:7|4:9|4:9|4000|154|55|29'),
  ('pool|Enchantment 9.24|9:1|23:10|4:9|4:9|4800|180|61|29'),
  ('pool|Fiji|15:0|34:0|3:6|6:0|12000|375|83|18'),
  ('pool|Jamaica 10|9:10|19:9|3:2|5:0|3750|138|48|16'),
  ('pool|Jamaica 12|12:3|23:11|3:6|5:0|6000|211|59|27'),
  ('pool|Jamaica 14|14:4|27:7|3:7|5:10|10000|288|68|30'),
  ('pool|Key West|12:0|25:7|3:7|6:0|9000|230|66|13'),
  ('pool|Kingston|16:0|38:0|3:6|5:10|17500|555|104|60'),
  ('pool|Lake Shore|16:0|33:0|3:7|5:5|15000|480|94|60'),
  ('pool|Milan 8.14|8:0|14:0|4:0|4:0|1200|88|39|22'),
  ('pool|Milan 10.16|10:0|16:0|4:0|4:0|2450|135|48|31'),
  ('pool|Milan 10.20|10:0|20:0|4:10|4:10|3900|166|55|34'),
  ('pool|Monaco|16:0|40:0|3:8|8:0|21000|585|108|60'),
  ('pool|Olympia 12|12:0|26:0|3:6|5:8|7600|275|72|52'),
  ('pool|Olympia 14|14:0|30:0|3:6|6:0|11200|377|84|61'),
  ('pool|Olympia 16|16:0|35:0|3:6|6:4|15250|510|98|76'),
  ('pool|Pleasant Cove|11:0|22:0|3:5|5:6|5000|173|54|8'),
  ('pool|Sirius|12:0|24:0|3:6|5:6|6700|239|70|21'),
  ('pool|St. Thomas|14:0|31:6|3:7|7:0|13700|396|85|20'),
  ('pool|Synergy 16|16:0|40:2|3:10|6:3|14000|553|106|35'),
  ('pool|Synergy Grand|16:0|40:2|3:10|8:6|20000|553|106|35'),
  ('pool|Tuscan 11.20|11:1|20:3|3:11|5:2|5000|168|57|20'),
  ('pool|Tuscan 13.24|12:10|23:7|3:11|5:5|6100|229|59|21'),
  ('pool|Tuscan 14.27|13:9|26:10|3:11|5:9|7900|288|76|24'),
  ('pool|Tuscan 14.30|13:9|30:1|3:11|5:11|10000|325|83|24'),
  ('pool|Tuscan 14.40|13:9|39:11|3:7|6:2|13200|459|102|31'),
  ('pool|Vista Isle|12:0|28:0|3:6|5:10|8000|294|70|10'),
  ('spa|Mystic|9:8|9:8|3:4|3:4|950|64|28|'),
  ('spa|Regal|7:8|9:8|3:4|3:4|775|52|28|'),
  ('spa|Royal|7:8|9:8|3:4|3:4|830|63|32|'),
  ('spa|Shasta|6:11|6:11|3:0|3:0|350|31|20|'),
  ('ledge|Gen/Syn/Semicircle|9:4|16:6|0:10|0:10|400|92|39|'),
  ('ledge|Hermosa|5:9|9:8|0:10|0:10|250|50|27|'),
  ('ledge|Rectangle|7:8|15:8|0:10|0:10|400|105|44|'),
  ('ledge|Semicircle|8:4|16:0|0:10|0:10|310|93|39|');

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
