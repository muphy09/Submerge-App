-- PRODUCTION CONTROLLED CLEANUP.
-- Archives five explicitly reviewed orphan drafts into a private schema, then
-- deletes only those five rows from the live proposal table. Each mutating
-- statement is self-contained for compatibility with the pooled SQL Editor.

do $$
declare
  v_matches integer;
begin
  select count(*) into v_matches
  from (values
    ('PROP-1764876925526', '3333'),
    ('PROP-1765292943241', '3333'),
    ('PROP-1765232686424', '3333'),
    ('PROP-1765238486971', '3333'),
    ('PROP-1774474260886', '5555')
  ) as target(proposal_number, franchise_code)
  join public.franchise_proposals proposal
    on proposal.proposal_number = target.proposal_number
  join public.franchises franchise
    on franchise.id = proposal.franchise_id
   and franchise.franchise_code = target.franchise_code
  where lower(coalesce(
    proposal.status,
    proposal.proposal_json ->> 'status',
    'draft'
  )) = 'draft';

  if v_matches <> 5 then
    raise exception
      'SAFETY STOP: expected exactly 5 matching orphan drafts; found %.',
      v_matches;
  end if;

  if exists (
    select 1
    from (values
      ('PROP-1764876925526', '3333'),
      ('PROP-1765292943241', '3333'),
      ('PROP-1765232686424', '3333'),
      ('PROP-1765238486971', '3333'),
      ('PROP-1774474260886', '5555')
    ) as target(proposal_number, franchise_code)
    left join public.franchise_proposals proposal
      on proposal.proposal_number = target.proposal_number
    left join public.franchises franchise
      on franchise.id = proposal.franchise_id
    where proposal.proposal_number is null
       or franchise.franchise_code is distinct from target.franchise_code
       or lower(coalesce(
            proposal.status,
            proposal.proposal_json ->> 'status',
            'draft'
          )) <> 'draft'
  ) then
    raise exception
      'SAFETY STOP: a target is missing, belongs to another franchise, or is no longer a draft.';
  end if;
end;
$$;

create schema if not exists migration_archive;
revoke all on schema migration_archive from public, anon, authenticated;

do $$
begin
  if to_regclass('migration_archive.orphaned_proposals_20260717') is not null then
    raise exception
      'SAFETY STOP: migration_archive.orphaned_proposals_20260717 already exists.';
  end if;
end;
$$;

create table migration_archive.orphaned_proposals_20260717 as
select
  proposal.*,
  now() as archived_at
from public.franchise_proposals proposal
join (values
  ('PROP-1764876925526', '3333'),
  ('PROP-1765292943241', '3333'),
  ('PROP-1765232686424', '3333'),
  ('PROP-1765238486971', '3333'),
  ('PROP-1774474260886', '5555')
) as target(proposal_number, franchise_code)
  on target.proposal_number = proposal.proposal_number;

revoke all on table migration_archive.orphaned_proposals_20260717
  from public, anon, authenticated;

do $$
declare
  v_archived integer;
begin
  select count(*) into v_archived
  from migration_archive.orphaned_proposals_20260717;

  if v_archived <> 5 then
    raise exception
      'SAFETY STOP: expected 5 archived rows; found %.',
      v_archived;
  end if;
end;
$$;

do $$
declare
  v_deleted integer;
begin
  delete from public.franchise_proposals proposal
  using
    (values
      ('PROP-1764876925526', '3333'),
      ('PROP-1765292943241', '3333'),
      ('PROP-1765232686424', '3333'),
      ('PROP-1765238486971', '3333'),
      ('PROP-1774474260886', '5555')
    ) as target(proposal_number, franchise_code),
    public.franchises franchise
  where proposal.proposal_number = target.proposal_number
    and proposal.franchise_id = franchise.id
    and franchise.franchise_code = target.franchise_code
    and lower(coalesce(
      proposal.status,
      proposal.proposal_json ->> 'status',
      'draft'
    )) = 'draft';

  get diagnostics v_deleted = row_count;

  if v_deleted <> 5 then
    raise exception
      'SAFETY STOP: expected to delete 5 archived drafts; deleted %.',
      v_deleted;
  end if;
end;
$$;

select
  'ARCHIVED'::text as result_type,
  proposal_number as detail,
  lower(coalesce(status, proposal_json ->> 'status', 'draft')) as proposal_status,
  archived_at::text as verification
from migration_archive.orphaned_proposals_20260717

union all

select
  'RESULT',
  'PRODUCTION ORPHAN DRAFT CLEANUP PASSED',
  '',
  format(
    'archived=%s; live_remaining=%s',
    (select count(*) from migration_archive.orphaned_proposals_20260717),
    (
      select count(*)
      from public.franchise_proposals
      where proposal_number in (
        'PROP-1764876925526',
        'PROP-1765292943241',
        'PROP-1765232686424',
        'PROP-1765238486971',
        'PROP-1774474260886'
      )
    )
  )
order by result_type, detail;
