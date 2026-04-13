alter table if exists public.franchise_branding
  add column if not exists disable_signed_workflow boolean not null default false;
