-- Older app builds select is_active = true and continue to use their bundled
-- PPAS West contracts. New builds select remote_client_published for West.
alter table public.franchise_contract_templates
  add column if not exists remote_client_published boolean not null default false;

create index if not exists idx_contract_templates_remote_client_published
  on public.franchise_contract_templates (franchise_id, jurisdiction_key, pool_type)
  where remote_client_published;

comment on column public.franchise_contract_templates.remote_client_published is
  'Published for clients that require remote contracts. PPAS West keeps is_active=false so older app builds continue using their bundled contracts.';
