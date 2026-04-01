alter table public.franchise_pricing_models
add column if not exists is_hidden_from_view boolean not null default false;
