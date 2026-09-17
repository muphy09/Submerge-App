-- Run this fixture with each -- MIGRATION marker replaced by the migration
-- body (without BEGIN/COMMIT), replacing public. with pg_temp. throughout it.
-- All data is synthetic and transaction-local; ROLLBACK leaves no changes.
begin;
create temporary table franchise_pricing_models (
  id uuid primary key default gen_random_uuid(), franchise_id text,
  current_revision_id uuid, pricing_json jsonb, version text,
  updated_at timestamptz, updated_by text
);
create temporary table franchise_pricing_model_revisions (
  id uuid primary key default gen_random_uuid(), pricing_model_id uuid,
  franchise_id text, revision_number integer, pricing_json jsonb,
  source_version text, change_summary jsonb, published_by text,
  published_at timestamptz default now(), unique(pricing_model_id, revision_number)
);
insert into franchise_pricing_models (franchise_id, pricing_json, version)
select 'franchise-' || (n % 4), case when n=12 then
  '{"tileCoping":{"offContractDecking":{"materialWasteRate":0},"onContractDecking":{"quantityWasteRate":0.08,"freeformWasteRate":0.03}},"unrelated":123}'::jsonb
  else '{"tileCoping":{"decking":{"material":{"pavers":7}}},"unrelated":123}'::jsonb end, 'test'
from generate_series(1,12) n;
insert into franchise_pricing_model_revisions (pricing_model_id, franchise_id, revision_number, pricing_json, source_version)
select id, franchise_id, 1, pricing_json, version from franchise_pricing_models;
update franchise_pricing_models m set current_revision_id=r.id from franchise_pricing_model_revisions r where r.pricing_model_id=m.id;
create temporary table original_models as select * from franchise_pricing_models;
create temporary table original_revisions as select * from franchise_pricing_model_revisions;

-- MIGRATION

do $$
begin
  if (select count(*) from franchise_pricing_model_revisions) <> 23 then raise exception 'Expected exactly 11 new revisions'; end if;
  if exists (select 1 from original_revisions o join franchise_pricing_model_revisions r using(id) where to_jsonb(o) <> to_jsonb(r)) then raise exception 'Historical revision changed'; end if;
  if exists (select 1 from original_models o join franchise_pricing_models m using(id) where o.pricing_json <> m.pricing_json) then raise exception 'Legacy pricing changed'; end if;
  if exists (select 1 from franchise_pricing_model_revisions where revision_number=2 and (
    pricing_json #>> '{tileCoping,offContractDecking,materialWasteRate}' <> '0.10'
    or pricing_json #>> '{tileCoping,onContractDecking,quantityWasteRate}' <> '0.05'
    or pricing_json #>> '{tileCoping,onContractDecking,freeformWasteRate}' <> '0.05'
    or pricing_json ->> 'unrelated' <> '123')) then raise exception 'Wrong defaults or unrelated pricing changed'; end if;
  if (select count(*) from franchise_pricing_models m join franchise_pricing_model_revisions r on r.id=m.current_revision_id where r.revision_number=2) <> 11 then raise exception 'Pointers not updated'; end if;
end $$;

-- MIGRATION

do $$ begin
  if (select count(*) from franchise_pricing_model_revisions) <> 23 then raise exception 'Migration is not idempotent'; end if;
end $$;
select 'Passed: 12 models, 4 franchises, 11 new revisions, custom values preserved, historical/legacy pricing unchanged, repeat run unchanged' as result;
rollback;
