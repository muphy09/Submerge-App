create table if not exists public.franchise_branding (
  franchise_id text primary key references public.franchises(id) on delete cascade,
  logo_url text,
  app_name text,
  admin_panel_pin text,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table if exists public.franchise_branding
  add column if not exists admin_panel_pin text;
