-- Additive multi-franchise foundation.
-- This migration intentionally leaves all legacy columns and tables in place so
-- the currently published desktop client continues to operate during rollout.

begin;

create extension if not exists pgcrypto;

-- Remove a legacy permissive policy that made every proposal row updateable
-- whenever the table privilege was inherited through PUBLIC. Current clients
-- authenticate before proposal access and retain access through the scoped
-- authenticated policies below/existing on the project.
drop policy if exists "allow updates for franchise proposals" on public.franchise_proposals;
revoke select, insert, update, delete on public.franchise_proposals from public, anon;
grant select, insert, update, delete on public.franchise_proposals to authenticated;

-- ---------------------------------------------------------------------------
-- Immutable pricing revisions
-- ---------------------------------------------------------------------------

create table if not exists public.franchise_pricing_model_revisions (
  id uuid primary key default gen_random_uuid(),
  pricing_model_id uuid not null references public.franchise_pricing_models(id) on delete restrict,
  franchise_id text not null references public.franchises(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  pricing_json jsonb not null,
  source_version text,
  change_summary jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  published_by text,
  created_at timestamptz not null default now(),
  unique (pricing_model_id, revision_number)
);

create index if not exists idx_pricing_revisions_franchise_model
  on public.franchise_pricing_model_revisions (franchise_id, pricing_model_id, revision_number desc);

alter table public.franchise_pricing_models
  add column if not exists current_revision_id uuid references public.franchise_pricing_model_revisions(id) on delete restrict;

-- Convert each existing model into immutable revision 1 without modifying its
-- legacy pricing_json. Older clients can therefore continue reading it.
insert into public.franchise_pricing_model_revisions (
  pricing_model_id,
  franchise_id,
  revision_number,
  pricing_json,
  source_version,
  published_at,
  published_by
)
select
  model.id,
  model.franchise_id,
  1,
  coalesce(model.pricing_json, '{}'::jsonb),
  model.version,
  coalesce(model.updated_at, now()),
  model.updated_by
from public.franchise_pricing_models model
where not exists (
  select 1
  from public.franchise_pricing_model_revisions revision
  where revision.pricing_model_id = model.id
);

update public.franchise_pricing_models model
set current_revision_id = revision.id
from public.franchise_pricing_model_revisions revision
where revision.pricing_model_id = model.id
  and revision.revision_number = (
    select max(latest.revision_number)
    from public.franchise_pricing_model_revisions latest
    where latest.pricing_model_id = model.id
  )
  and model.current_revision_id is null;

-- Pin every legacy proposal (including its stored versions) to the immutable
-- revision that exists at migration time. This adds metadata only: prices,
-- selections, workflow state, timestamps inside the proposal, and status are
-- not recalculated or rewritten. It closes the window where a legacy proposal
-- without a revision id could accidentally adopt a later admin revision.
create or replace function pg_temp.pin_proposal_pricing_revision(
  input jsonb,
  fallback_franchise_id text
)
returns jsonb
language plpgsql
as $$
declare
  result jsonb := coalesce(input, '{}'::jsonb);
  model_franchise_id text;
  requested_model_id text;
  selected_model public.franchise_pricing_models%rowtype;
  selected_revision public.franchise_pricing_model_revisions%rowtype;
  pinned_versions jsonb;
begin
  if nullif(result->>'pricingModelRevisionId', '') is null then
    model_franchise_id := coalesce(
      nullif(result->>'pricingModelFranchiseId', ''),
      nullif(result->>'franchiseId', ''),
      fallback_franchise_id
    );
    requested_model_id := nullif(result->>'pricingModelId', '');

    if requested_model_id is not null then
      select * into selected_model
      from public.franchise_pricing_models model
      where model.franchise_id = model_franchise_id
        and model.id::text = requested_model_id
      limit 1;
    end if;

    if selected_model.id is null then
      select * into selected_model
      from public.franchise_pricing_models model
      where model.franchise_id = model_franchise_id
      order by model.is_default desc, model.updated_at desc nulls last, model.id
      limit 1;
    end if;

    if selected_model.id is not null and selected_model.current_revision_id is not null then
      select * into selected_revision
      from public.franchise_pricing_model_revisions revision
      where revision.id = selected_model.current_revision_id;

      if selected_revision.id is not null then
        result := jsonb_set(result, '{pricingModelId}', to_jsonb(selected_model.id), true);
        result := jsonb_set(result, '{pricingModelName}', to_jsonb(selected_model.name), true);
        result := jsonb_set(result, '{pricingModelFranchiseId}', to_jsonb(selected_model.franchise_id), true);
        result := jsonb_set(result, '{pricingModelRevisionId}', to_jsonb(selected_revision.id::text), true);
        result := jsonb_set(result, '{pricingModelRevisionNumber}', to_jsonb(selected_revision.revision_number), true);
      end if;
    end if;
  end if;

  if jsonb_typeof(result->'versions') = 'array' then
    select coalesce(
      jsonb_agg(
        pg_temp.pin_proposal_pricing_revision(version.value, fallback_franchise_id)
        order by version.ordinality
      ),
      '[]'::jsonb
    ) into pinned_versions
    from jsonb_array_elements(result->'versions') with ordinality as version(value, ordinality);
    result := jsonb_set(result, '{versions}', pinned_versions, true);
  end if;

  return result;
end;
$$;

update public.franchise_proposals proposal
set proposal_json = pg_temp.pin_proposal_pricing_revision(
  proposal.proposal_json,
  proposal.franchise_id
)
where proposal.proposal_json is not null;

-- ---------------------------------------------------------------------------
-- Versioned franchise configuration and release assignments
-- ---------------------------------------------------------------------------

create table if not exists public.franchise_configuration_revisions (
  id uuid primary key default gen_random_uuid(),
  franchise_id text not null references public.franchises(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  schema_version integer not null default 1 check (schema_version > 0),
  configuration_json jsonb not null default '{}'::jsonb,
  change_summary text,
  published_at timestamptz not null default now(),
  published_by text,
  created_at timestamptz not null default now(),
  unique (franchise_id, revision_number)
);

create index if not exists idx_franchise_configuration_revisions
  on public.franchise_configuration_revisions (franchise_id, revision_number desc);

create table if not exists public.franchise_configuration_assignments (
  franchise_id text primary key references public.franchises(id) on delete cascade,
  current_revision_id uuid not null references public.franchise_configuration_revisions(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.franchise_release_assignments (
  franchise_id text primary key references public.franchises(id) on delete cascade,
  core_version text not null,
  franchise_release_number integer not null default 1 check (franchise_release_number > 0),
  release_channel text not null default 'stable'
    check (release_channel in ('stable', 'canary', 'paused')),
  minimum_required_version text,
  update_enabled boolean not null default true,
  release_notes text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Seed a no-op configuration for every existing franchise. The JSON defaults
-- deliberately describe the behavior of the currently published application.
insert into public.franchise_configuration_revisions (
  franchise_id,
  revision_number,
  schema_version,
  configuration_json,
  change_summary,
  published_by
)
select
  franchise.id,
  1,
  1,
  jsonb_build_object(
    'themeProfile', 'default',
    'proposalLayout', 'standard',
    'locationInputMode', 'state',
    'contractResolutionMode', 'state_and_pool_type',
    'capabilities', jsonb_build_object()
  ),
  'Compatibility baseline created during multi-franchise migration',
  'system-migration'
from public.franchises franchise
where not exists (
  select 1
  from public.franchise_configuration_revisions revision
  where revision.franchise_id = franchise.id
);

insert into public.franchise_configuration_assignments (
  franchise_id,
  current_revision_id,
  updated_by
)
select
  franchise.id,
  revision.id,
  'system-migration'
from public.franchises franchise
join public.franchise_configuration_revisions revision
  on revision.franchise_id = franchise.id
 and revision.revision_number = 1
on conflict (franchise_id) do nothing;

insert into public.franchise_release_assignments (
  franchise_id,
  core_version,
  franchise_release_number,
  release_channel,
  update_enabled,
  release_notes,
  updated_by
)
select
  franchise.id,
  '2.4.7',
  1,
  'stable',
  true,
  'Compatibility baseline created during multi-franchise migration',
  'system-migration'
from public.franchises franchise
on conflict (franchise_id) do nothing;

-- Every future franchise receives the same versioned foundation immediately,
-- including franchises created by the existing Edge Function.
create or replace function public.initialize_new_franchise_foundation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_configuration_revision_id uuid;
begin
  insert into public.franchise_configuration_revisions (
    franchise_id,
    revision_number,
    schema_version,
    configuration_json,
    change_summary,
    published_by
  ) values (
    new.id,
    1,
    1,
    jsonb_build_object(
      'themeProfile', 'default',
      'proposalLayout', 'standard',
      'locationInputMode', 'state',
      'contractResolutionMode', 'state_and_pool_type',
      'capabilities', jsonb_build_object()
    ),
    'Compatibility baseline created for new franchise',
    'system-auto'
  )
  on conflict (franchise_id, revision_number) do update
    set franchise_id = excluded.franchise_id
  returning id into v_configuration_revision_id;

  insert into public.franchise_configuration_assignments (
    franchise_id, current_revision_id, updated_by
  ) values (
    new.id, v_configuration_revision_id, 'system-auto'
  ) on conflict (franchise_id) do nothing;

  insert into public.franchise_release_assignments (
    franchise_id,
    core_version,
    franchise_release_number,
    release_channel,
    update_enabled,
    release_notes,
    updated_by
  ) values (
    new.id,
    '2.4.7',
    1,
    'stable',
    true,
    'Initial isolated franchise release assignment',
    'system-auto'
  ) on conflict (franchise_id) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_new_franchise_foundation on public.franchises;
create trigger initialize_new_franchise_foundation
after insert on public.franchises
for each row execute function public.initialize_new_franchise_foundation();

-- PPAS East (code 9724) will eventually use pool-type-only contract resolution
-- and county input. Those changes are intentionally NOT enabled by this migration.

-- ---------------------------------------------------------------------------
-- Versioned contract registry
-- ---------------------------------------------------------------------------

create table if not exists public.franchise_contract_templates (
  id uuid primary key default gen_random_uuid(),
  franchise_id text not null references public.franchises(id) on delete cascade,
  name text not null,
  jurisdiction_key text not null default '*',
  pool_type text not null check (pool_type in ('shotcrete', 'fiberglass')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (franchise_id, jurisdiction_key, pool_type, name)
);

create table if not exists public.franchise_contract_template_revisions (
  id uuid primary key default gen_random_uuid(),
  contract_template_id uuid not null references public.franchise_contract_templates(id) on delete restrict,
  franchise_id text not null references public.franchises(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  storage_path text not null,
  original_file_name text not null,
  file_checksum text not null,
  field_layout_json jsonb not null default '[]'::jsonb,
  autofill_rules_json jsonb not null default '{}'::jsonb,
  minimum_core_version text,
  published_at timestamptz not null default now(),
  published_by text,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contract_template_id, revision_number),
  unique (storage_path)
);

alter table public.franchise_contract_templates
  add column if not exists current_revision_id uuid
    references public.franchise_contract_template_revisions(id) on delete restrict;

create index if not exists idx_contract_templates_resolution
  on public.franchise_contract_templates (franchise_id, jurisdiction_key, pool_type, is_active);

create index if not exists idx_contract_revisions_template
  on public.franchise_contract_template_revisions (contract_template_id, revision_number desc);

-- ---------------------------------------------------------------------------
-- RLS for the new records
-- ---------------------------------------------------------------------------

alter table public.franchise_pricing_model_revisions enable row level security;
alter table public.franchise_configuration_revisions enable row level security;
alter table public.franchise_configuration_assignments enable row level security;
alter table public.franchise_release_assignments enable row level security;
alter table public.franchise_contract_templates enable row level security;
alter table public.franchise_contract_template_revisions enable row level security;

create or replace function public.current_user_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.franchise_users user_profile
    where user_profile.auth_user_id = auth.uid()
      and lower(user_profile.role) = 'master'
      and coalesce(user_profile.is_active, true) = true
  );
$$;

create or replace function public.current_user_can_manage_franchise(target_franchise_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_master() or exists (
    select 1
    from public.franchise_users user_profile
    where user_profile.auth_user_id = auth.uid()
      and user_profile.franchise_id = target_franchise_id
      and lower(user_profile.role) in ('owner', 'admin')
      and coalesce(user_profile.is_active, true) = true
  );
$$;

create or replace function public.current_user_belongs_to_franchise(target_franchise_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_master() or exists (
    select 1
    from public.franchise_users user_profile
    where user_profile.auth_user_id = auth.uid()
      and user_profile.franchise_id = target_franchise_id
      and coalesce(user_profile.is_active, true) = true
  );
$$;

create or replace function public.publish_pricing_model_revision(
  p_pricing_model_id uuid,
  p_pricing_json jsonb,
  p_source_version text default null,
  p_change_summary jsonb default '[]'::jsonb,
  p_published_by text default null
)
returns public.franchise_pricing_model_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model public.franchise_pricing_models%rowtype;
  v_revision public.franchise_pricing_model_revisions%rowtype;
  v_next_revision integer;
begin
  if jsonb_typeof(coalesce(p_pricing_json, 'null'::jsonb)) <> 'object' then
    raise exception 'Pricing revision payload must be a JSON object.';
  end if;

  select * into v_model
  from public.franchise_pricing_models
  where id = p_pricing_model_id;

  if not found then
    raise exception 'Pricing model not found.';
  end if;

  if not public.current_user_can_manage_franchise(v_model.franchise_id) then
    raise exception 'You are not authorized to publish pricing for this franchise.';
  end if;

  perform pg_advisory_xact_lock(hashtext('pricing-model:' || p_pricing_model_id::text));

  select coalesce(max(revision_number), 0) + 1
    into v_next_revision
  from public.franchise_pricing_model_revisions
  where pricing_model_id = p_pricing_model_id;

  insert into public.franchise_pricing_model_revisions (
    pricing_model_id,
    franchise_id,
    revision_number,
    pricing_json,
    source_version,
    change_summary,
    published_by
  ) values (
    p_pricing_model_id,
    v_model.franchise_id,
    v_next_revision,
    coalesce(p_pricing_json, '{}'::jsonb),
    p_source_version,
    coalesce(p_change_summary, '[]'::jsonb),
    p_published_by
  ) returning * into v_revision;

  -- Point revision-capable clients at the new immutable snapshot. Deliberately
  -- leave legacy pricing_json unchanged: a pre-migration client may continue
  -- using the old baseline, but it can never silently reprice an old proposal
  -- from a newly published revision.
  update public.franchise_pricing_models
  set version = coalesce(p_source_version, version),
      current_revision_id = v_revision.id,
      updated_at = v_revision.published_at,
      updated_by = p_published_by
  where id = p_pricing_model_id;

  return v_revision;
end;
$$;

create or replace function public.publish_franchise_configuration(
  p_franchise_id text,
  p_configuration_json jsonb,
  p_schema_version integer default 1,
  p_change_summary text default null,
  p_published_by text default null
)
returns public.franchise_configuration_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision public.franchise_configuration_revisions%rowtype;
  v_next_revision integer;
begin
  if not public.current_user_can_manage_franchise(p_franchise_id) then
    raise exception 'You are not authorized to publish configuration for this franchise.';
  end if;

  if jsonb_typeof(coalesce(p_configuration_json, 'null'::jsonb)) <> 'object' then
    raise exception 'Franchise configuration must be a JSON object.';
  end if;

  perform pg_advisory_xact_lock(hashtext('franchise-config:' || p_franchise_id));

  select coalesce(max(revision_number), 0) + 1
    into v_next_revision
  from public.franchise_configuration_revisions
  where franchise_id = p_franchise_id;

  insert into public.franchise_configuration_revisions (
    franchise_id,
    revision_number,
    schema_version,
    configuration_json,
    change_summary,
    published_by
  ) values (
    p_franchise_id,
    v_next_revision,
    greatest(coalesce(p_schema_version, 1), 1),
    coalesce(p_configuration_json, '{}'::jsonb),
    p_change_summary,
    p_published_by
  ) returning * into v_revision;

  insert into public.franchise_configuration_assignments (
    franchise_id,
    current_revision_id,
    updated_at,
    updated_by
  ) values (
    p_franchise_id,
    v_revision.id,
    v_revision.published_at,
    p_published_by
  )
  on conflict (franchise_id) do update
    set current_revision_id = excluded.current_revision_id,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return v_revision;
end;
$$;

create or replace function public.save_pricing_model_revision(
  p_pricing_model_id uuid,
  p_franchise_id text,
  p_name text,
  p_pricing_json jsonb,
  p_source_version text default null,
  p_set_default boolean default false,
  p_is_hidden_from_view boolean default false,
  p_change_summary jsonb default '[]'::jsonb,
  p_published_by text default null,
  p_create_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model public.franchise_pricing_models%rowtype;
  v_revision public.franchise_pricing_model_revisions%rowtype;
begin
  if not public.current_user_can_manage_franchise(p_franchise_id) then
    raise exception 'You are not authorized to publish pricing for this franchise.';
  end if;

  perform pg_advisory_xact_lock(hashtext('pricing-model:' || p_pricing_model_id::text));

  if p_create_new then
    insert into public.franchise_pricing_models (
      id,
      franchise_id,
      name,
      version,
      pricing_json,
      is_default,
      is_hidden_from_view,
      created_at,
      updated_at,
      updated_by
    ) values (
      p_pricing_model_id,
      p_franchise_id,
      p_name,
      coalesce(p_source_version, 'v1'),
      coalesce(p_pricing_json, '{}'::jsonb),
      coalesce(p_set_default, false),
      coalesce(p_is_hidden_from_view, false),
      now(),
      now(),
      p_published_by
    );
  else
    select * into v_model
    from public.franchise_pricing_models
    where id = p_pricing_model_id
      and franchise_id = p_franchise_id;

    if not found then
      raise exception 'Pricing model not found.';
    end if;

    update public.franchise_pricing_models
    set name = p_name,
        is_hidden_from_view = coalesce(p_is_hidden_from_view, false)
    where id = p_pricing_model_id;
  end if;

  select * into v_revision
  from public.publish_pricing_model_revision(
    p_pricing_model_id,
    p_pricing_json,
    p_source_version,
    p_change_summary,
    p_published_by
  );

  if p_set_default then
    update public.franchise_pricing_models
    set is_default = (id = p_pricing_model_id),
        updated_at = case when id = p_pricing_model_id then now() else updated_at end
    where franchise_id = p_franchise_id;
  end if;

  return jsonb_build_object(
    'franchiseId', p_franchise_id,
    'pricingModelId', p_pricing_model_id,
    'pricingModelName', p_name,
    'revisionId', v_revision.id,
    'revisionNumber', v_revision.revision_number,
    'publishedAt', v_revision.published_at,
    'isDefault', coalesce(p_set_default, false)
  );
end;
$$;

create or replace function public.publish_contract_template_revision(
  p_franchise_id text,
  p_name text,
  p_jurisdiction_key text,
  p_pool_type text,
  p_storage_path text,
  p_original_file_name text,
  p_file_checksum text,
  p_field_layout_json jsonb,
  p_autofill_rules_json jsonb,
  p_published_by text,
  p_contract_template_id uuid default null,
  p_minimum_core_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.franchise_contract_templates%rowtype;
  v_revision public.franchise_contract_template_revisions%rowtype;
  v_next_revision integer;
begin
  if not public.current_user_is_master() then
    raise exception 'Only a master user can publish contract templates.';
  end if;

  if p_storage_path is null
     or p_storage_path not like p_franchise_id || '/%' then
    raise exception 'Contract storage path must begin with the franchise id.';
  end if;

  if nullif(trim(coalesce(p_file_checksum, '')), '') is null then
    raise exception 'Contract file checksum is required.';
  end if;

  if jsonb_typeof(coalesce(p_field_layout_json, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_field_layout_json) = 0 then
    raise exception 'A mapped contract field layout is required before publishing.';
  end if;

  if lower(coalesce(p_pool_type, '')) not in ('shotcrete', 'fiberglass') then
    raise exception 'Contract pool type must be shotcrete or fiberglass.';
  end if;

  if p_contract_template_id is not null then
    select * into v_template
    from public.franchise_contract_templates
    where id = p_contract_template_id
      and franchise_id = p_franchise_id;
    if not found then raise exception 'Contract template not found.'; end if;
  else
    select * into v_template
    from public.franchise_contract_templates
    where franchise_id = p_franchise_id
      and jurisdiction_key = upper(coalesce(nullif(trim(p_jurisdiction_key), ''), '*'))
      and pool_type = lower(p_pool_type)
      and name = trim(p_name)
    limit 1;

    if not found then
      insert into public.franchise_contract_templates (
        franchise_id, name, jurisdiction_key, pool_type, created_by, updated_by
      ) values (
        p_franchise_id,
        trim(p_name),
        upper(coalesce(nullif(trim(p_jurisdiction_key), ''), '*')),
        lower(p_pool_type),
        p_published_by,
        p_published_by
      ) returning * into v_template;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('contract-template:' || v_template.id::text));
  select coalesce(max(revision_number), 0) + 1 into v_next_revision
  from public.franchise_contract_template_revisions
  where contract_template_id = v_template.id;

  insert into public.franchise_contract_template_revisions (
    contract_template_id,
    franchise_id,
    revision_number,
    storage_path,
    original_file_name,
    file_checksum,
    field_layout_json,
    autofill_rules_json,
    minimum_core_version,
    published_by
  ) values (
    v_template.id,
    p_franchise_id,
    v_next_revision,
    p_storage_path,
    p_original_file_name,
    p_file_checksum,
    coalesce(p_field_layout_json, '[]'::jsonb),
    coalesce(p_autofill_rules_json, '{}'::jsonb),
    p_minimum_core_version,
    p_published_by
  ) returning * into v_revision;

  update public.franchise_contract_templates
  set current_revision_id = v_revision.id,
      updated_at = v_revision.published_at,
      updated_by = p_published_by
  where id = v_template.id;

  return jsonb_build_object(
    'templateId', v_template.id,
    'revisionId', v_revision.id,
    'revisionNumber', v_revision.revision_number,
    'publishedAt', v_revision.published_at
  );
end;
$$;

revoke all on function public.current_user_is_master() from public, anon;
revoke all on function public.current_user_can_manage_franchise(text) from public, anon;
revoke all on function public.current_user_belongs_to_franchise(text) from public, anon;
revoke all on function public.publish_pricing_model_revision(uuid, jsonb, text, jsonb, text) from public, anon;
revoke all on function public.publish_franchise_configuration(text, jsonb, integer, text, text) from public, anon;
revoke all on function public.save_pricing_model_revision(uuid, text, text, jsonb, text, boolean, boolean, jsonb, text, boolean) from public, anon;
revoke all on function public.publish_contract_template_revision(text, text, text, text, text, text, text, jsonb, jsonb, text, uuid, text) from public, anon;
revoke all on function public.initialize_new_franchise_foundation() from public, anon, authenticated;

grant execute on function public.current_user_is_master() to authenticated;
grant execute on function public.current_user_can_manage_franchise(text) to authenticated;
grant execute on function public.current_user_belongs_to_franchise(text) to authenticated;
grant execute on function public.publish_pricing_model_revision(uuid, jsonb, text, jsonb, text) to authenticated;
grant execute on function public.publish_franchise_configuration(text, jsonb, integer, text, text) to authenticated;
grant execute on function public.save_pricing_model_revision(uuid, text, text, jsonb, text, boolean, boolean, jsonb, text, boolean) to authenticated;
grant execute on function public.publish_contract_template_revision(text, text, text, text, text, text, text, jsonb, jsonb, text, uuid, text) to authenticated;

drop policy if exists "franchise members read pricing revisions" on public.franchise_pricing_model_revisions;
create policy "franchise members read pricing revisions"
  on public.franchise_pricing_model_revisions for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

drop policy if exists "franchise managers publish pricing revisions" on public.franchise_pricing_model_revisions;
create policy "franchise managers publish pricing revisions"
  on public.franchise_pricing_model_revisions for insert to authenticated
  with check (public.current_user_can_manage_franchise(franchise_id));

drop policy if exists "franchise members read configuration revisions" on public.franchise_configuration_revisions;
create policy "franchise members read configuration revisions"
  on public.franchise_configuration_revisions for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

drop policy if exists "franchise managers publish configuration revisions" on public.franchise_configuration_revisions;
create policy "franchise managers publish configuration revisions"
  on public.franchise_configuration_revisions for insert to authenticated
  with check (public.current_user_can_manage_franchise(franchise_id));

drop policy if exists "franchise members read configuration assignment" on public.franchise_configuration_assignments;
create policy "franchise members read configuration assignment"
  on public.franchise_configuration_assignments for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

drop policy if exists "franchise managers update configuration assignment" on public.franchise_configuration_assignments;
create policy "franchise managers update configuration assignment"
  on public.franchise_configuration_assignments for all to authenticated
  using (public.current_user_can_manage_franchise(franchise_id))
  with check (public.current_user_can_manage_franchise(franchise_id));

drop policy if exists "franchise members read release assignment" on public.franchise_release_assignments;
create policy "franchise members read release assignment"
  on public.franchise_release_assignments for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

drop policy if exists "master manages release assignment" on public.franchise_release_assignments;
create policy "master manages release assignment"
  on public.franchise_release_assignments for all to authenticated
  using (public.current_user_is_master())
  with check (public.current_user_is_master());

drop policy if exists "franchise members read contract templates" on public.franchise_contract_templates;
create policy "franchise members read contract templates"
  on public.franchise_contract_templates for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

drop policy if exists "master manages contract templates" on public.franchise_contract_templates;
create policy "master manages contract templates"
  on public.franchise_contract_templates for all to authenticated
  using (public.current_user_is_master())
  with check (public.current_user_is_master());

drop policy if exists "franchise members read contract revisions" on public.franchise_contract_template_revisions;
create policy "franchise members read contract revisions"
  on public.franchise_contract_template_revisions for select to authenticated
  using (public.current_user_belongs_to_franchise(franchise_id));

drop policy if exists "master manages contract revisions" on public.franchise_contract_template_revisions;
drop policy if exists "master publishes contract revisions" on public.franchise_contract_template_revisions;
create policy "master publishes contract revisions"
  on public.franchise_contract_template_revisions for insert to authenticated
  with check (public.current_user_is_master());

-- Private contract-template bucket. Object paths must start with franchise_id/.
insert into storage.buckets (id, name, public)
values ('franchise-contract-templates', 'franchise-contract-templates', false)
on conflict (id) do update set public = false;

drop policy if exists "franchise members download contract template files" on storage.objects;
create policy "franchise members download contract template files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'franchise-contract-templates'
    and public.current_user_belongs_to_franchise((storage.foldername(name))[1])
  );

drop policy if exists "master manages contract template files" on storage.objects;
create policy "master manages contract template files"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'franchise-contract-templates'
    and public.current_user_is_master()
  )
  with check (
    bucket_id = 'franchise-contract-templates'
    and public.current_user_is_master()
  );

commit;
