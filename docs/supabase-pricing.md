Supabase online pricing (multi-franchise)
=========================================

Goal
----
Move franchise pricing models to Supabase so all machines share pricing per franchise, while retaining local/offline fallback.

Environment variables (renderer / Vite)
---------------------------------------
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Tables (match local schema)
---------------------------
Create these tables in Supabase (you can use the SQL editor):
```sql
-- Franchises
create table public.franchises (
  id text primary key,
  name text not null,
  franchise_code text not null unique,
  is_active boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Pricing models per franchise
create table public.franchise_pricing_models (
  id text primary key,
  franchise_id text not null references public.franchises (id) on delete cascade,
  name text not null,
  version text not null,
  pricing_json jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by text
);

create index on public.franchise_pricing_models(franchise_id);
create index on public.franchise_pricing_models(franchise_id, is_default);
```

Recommended RLS
---------------
Enable RLS on both tables and add policies such as:
- Allow read to anon for the specific franchise codes you distribute (or require a session claim with `franchise_id`).
- Allow insert/update/delete on `franchise_pricing_models` where `franchise_id = current_setting('request.jwt.claims.franchise_id')::text`.
- If using anon key directly, scope by `franchise_code` (e.g., restrict by a signed JWT you issue via an Edge Function).

App integration
---------------
- Set the env vars above. When present, the app uses Supabase for pricing models; otherwise it falls back to local/IPC.
- Files added:
  - `src/services/supabaseClient.ts` – creates the client from env.
  - `src/services/pricingModelsAdapter.ts` – unified adapter that calls Supabase when configured, else the existing Electron IPC.
- Existing pricing flows (Pricing Data modal, pricingDataStore) now route through the adapter, so no UI changes are required.

Seeding franchises in Supabase
------------------------------
Insert the franchises you need (ids/codes must match the desktop app):
```sql
insert into public.franchises (id, name, franchise_code, is_active)
values
 ('default','Default Franchise','DEFAULT-CODE', true),
 ('franchise-1111','Franchise 1111','1111', false),
 ('franchise-2222','Franchise 2222','2222', false)
on conflict (id) do nothing;
```

Notes
-----
- Pricing models created in the app are stored in `franchise_pricing_models`; the default model flag is updated there.
- To stay client-only (no secret keys in the app), rely on RLS and the anon key. If you need stricter control, proxy via an Edge Function or a backend that issues short-lived tokens containing the `franchise_id` claim.
