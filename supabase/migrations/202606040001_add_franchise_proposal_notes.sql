create table if not exists public.franchise_proposal_notes (
  franchise_id text primary key references public.franchises(id) on delete cascade,
  notes_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
