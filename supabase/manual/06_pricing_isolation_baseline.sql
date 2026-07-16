-- READ-ONLY. Run before and after the controlled West pricing edit. A changed
-- model receives a new revision number/hash; models in the other franchise must
-- retain the exact same revision id, revision number, and hash.

select
  franchise.franchise_code,
  franchise.name as franchise_name,
  model.id as pricing_model_id,
  model.name as pricing_model_name,
  model.is_default,
  revision.id as current_revision_id,
  revision.revision_number,
  md5(revision.pricing_json::text) as current_revision_hash,
  count(distinct proposal.proposal_number) filter (
    where proposal.proposal_json->>'pricingModelId' = model.id::text
  ) as proposals_using_model
from public.franchise_pricing_models model
join public.franchises franchise on franchise.id = model.franchise_id
join public.franchise_pricing_model_revisions revision on revision.id = model.current_revision_id
left join public.franchise_proposals proposal on proposal.franchise_id = franchise.id
where franchise.franchise_code in ('5555', '9724')
group by
  franchise.franchise_code,
  franchise.name,
  model.id,
  model.name,
  model.is_default,
  revision.id,
  revision.revision_number,
  revision.pricing_json
order by franchise.franchise_code, model.is_default desc, model.name, model.id;
