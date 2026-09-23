import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bucket = 'franchise-contract-templates';
const target = process.argv.find((arg) => arg.startsWith('--target='))?.split('=')[1];
const publish = process.argv.includes('--publish');
const manifestOnly = process.argv.includes('--manifest-only');
const prepareDashboard = process.argv.includes('--prepare-dashboard');
const dashboardFranchiseId = process.argv.find((arg) => arg.startsWith('--franchise-id='))?.split('=')[1];
if (!['staging', 'production'].includes(target)) throw new Error('Use --target=staging or --target=production.');
if (prepareDashboard && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(dashboardFranchiseId || '')) {
  throw new Error('Use --franchise-id=<verified West UUID> with --prepare-dashboard.');
}
const url = process.env.WEST_CONTRACT_SUPABASE_URL;
const key = process.env.WEST_CONTRACT_SERVICE_ROLE_KEY;
if (!manifestOnly && !prepareDashboard && (!url || !key)) throw new Error('Set WEST_CONTRACT_SUPABASE_URL and WEST_CONTRACT_SERVICE_ROLE_KEY outside the repository.');

const envPath = resolve(root, target === 'staging' ? '.env.staging.local' : '.env.local');
const expectedUrl = (await readFile(envPath, 'utf8')).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
if (!expectedUrl || (url && new URL(url).origin !== new URL(expectedUrl).origin)) {
  throw new Error(`The supplied URL does not match the ${target} project.`);
}

const compiled = await build({
  entryPoints: [resolve(root, 'src/services/contractTemplates.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`;
const { getBundledContractTemplateRevision } = await import(moduleUrl);
const client = manifestOnly || prepareDashboard ? null : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const franchiseResult = client
  ? await client.from('franchises').select('id,franchise_code').eq('franchise_code', '5555').single()
  : { data: { id: dashboardFranchiseId || 'manifest-only-west' }, error: null };
const franchise = franchiseResult.data;
if (franchiseResult.error || !franchise?.id) throw franchiseResult.error || new Error('PPAS West franchise was not found.');

const definitions = [
  { id: 'nc-gunite', state: 'NC', pool: 'shotcrete', files: ['NEW 2026 Contract NC Shotcrete.pdf', 'NEW 2026 Contract NC Shotcrete.pdf'] },
  { id: 'nc-fiberglass', state: 'NC', pool: 'fiberglass', files: ['NEW 2026 Contract NC Fiberglass Revision 1.pdf', 'NEW 2026 Contract NC Fiberglass.pdf', 'NEW 2026 Contract NC Fiberglass.pdf'] },
  { id: 'sc-gunite', state: 'SC', pool: 'shotcrete', files: ['NEW 2026 Contract SC Shotcrete.pdf', 'NEW 2026 Contract SC Shotcrete.pdf'] },
  { id: 'sc-fiberglass', state: 'SC', pool: 'fiberglass', files: ['NEW 2026 Contract SC Fiberglass Revision 1.pdf', 'NEW 2026 Contract SC Fiberglass.pdf', 'NEW 2026 Contract SC Fiberglass.pdf'] },
];

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

const prepared = [];
for (const definition of definitions) {
  const revisions = [];
  for (let number = 1; number <= definition.files.length; number += 1) {
    const legacy = getBundledContractTemplateRevision(definition.id, number);
    if (!legacy?.contractTemplate?.fields?.length) throw new Error(`Missing ${definition.id} revision ${number} field map.`);
    const bytes = await readFile(resolve(root, 'docs/Contracts', definition.files[number - 1]));
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const storageEtag = `${createHash('md5').update(createHash('md5').update(bytes).digest()).digest('hex')}-1`;
    const path = `${franchise.id}/west-2026/${definition.id}/r${number}-${checksum.slice(0, 16)}.pdf`;
    revisions.push({
      number, bytes, checksum, storageEtag, path,
      file: definition.files[number - 1],
      fields: legacy.contractTemplate.fields,
      rules: {
        schemaVersion: 2,
        renderProfile: 'ppas-west-2026-v1',
        defaultFieldValues: legacy.contractTemplate.defaultFieldValues,
        staticPatches: legacy.contractTemplate.staticPatches,
        changeNotes: [...(legacy.changeNotes || [])],
        effectivePublishedAt: legacy.publishedAt || null,
        legacyBundledId: `bundled:${franchise.id}:${definition.id}:r${number}`,
      },
    });
  }
  const label = getBundledContractTemplateRevision(definition.id)?.contractTemplate.label;
  prepared.push({ ...definition, name: target === 'staging' ? `${label} (remote migration)` : label, revisions });
}

if (prepareDashboard) {
  const output = resolve(root, 'tmp', 'west-contract-dashboard', target);
  const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
  for (const item of prepared) {
    for (const revision of item.revisions) {
      const destination = resolve(output, revision.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, revision.bytes);
    }
    const lines = [
      'do $west$ declare v_template uuid; v_revision uuid; v_fields jsonb; begin',
      `if not exists (select 1 from public.franchises where id=${literal(franchise.id)} and franchise_code='5555') then raise exception 'Verified West franchise not found'; end if;`,
      `if exists (select 1 from public.franchise_contract_templates where franchise_id=${literal(franchise.id)} and jurisdiction_key=${literal(item.state)} and pool_type=${literal(item.pool)} and name=${literal(item.name)}) then raise exception 'Contract template already exists'; end if;`,
      `insert into public.franchise_contract_templates (franchise_id,name,jurisdiction_key,pool_type,is_active,remote_client_published,created_by,updated_by) values (${literal(franchise.id)},${literal(item.name)},${literal(item.state)},${literal(item.pool)},false,false,'west-contract-history-migration','west-contract-history-migration') returning id into v_template;`,
      `v_fields := ${literal(JSON.stringify(item.revisions[0].fields))}::jsonb;`,
    ];
    for (const revision of item.revisions) {
      lines.push(`if not exists (select 1 from storage.objects where bucket_id=${literal(bucket)} and name=${literal(revision.path)} and (metadata->>'size')::bigint=${revision.bytes.length} and replace(metadata->>'eTag','"','')=${literal(revision.storageEtag)}) then raise exception 'Missing or checksum-mismatched PDF: ${revision.path}'; end if;`);
      lines.push(`insert into public.franchise_contract_template_revisions (contract_template_id,franchise_id,revision_number,storage_path,original_file_name,file_checksum,field_layout_json,autofill_rules_json,minimum_core_version,published_at,published_by) values (v_template,${literal(franchise.id)},${revision.number},${literal(revision.path)},${literal(revision.file)},${literal(revision.checksum)},v_fields,${literal(JSON.stringify(revision.rules))}::jsonb,'3.3.10',${literal(revision.rules.effectivePublishedAt || new Date().toISOString())}::timestamptz,'west-contract-history-migration') returning id into v_revision;`);
    }
    lines.push('update public.franchise_contract_templates set current_revision_id=v_revision where id=v_template;', 'end $west$;');
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, `${item.id}.sql`), lines.join('\n'));
  }
  const manifest = prepared.map((item) => ({
    id: item.id, name: item.name, state: item.state, pool: item.pool,
    revisions: item.revisions.map(({ number, checksum, storageEtag, path, file, fields, rules }) => ({
      number, checksum, storageEtag, path, file, fields, rules,
    })),
  }));
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest));
  const expectedRows = prepared.flatMap((item) => item.revisions.map((revision) =>
    `(${literal(revision.path)},${literal(revision.checksum)},${literal(revision.storageEtag)},${revision.bytes.length},${literal(revision.rules.legacyBundledId)})`
  )).join(',\n');
  await writeFile(resolve(output, 'verify-storage.sql'), `with expected(path,sha256,etag,bytes,legacy_id) as (values\n${expectedRows}\n)
select count(*) as expected_revisions,
       count(r.id) as matching_revision_rows,
       count(o.id) as matching_storage_objects,
       bool_and(r.file_checksum=e.sha256) as sha256_metadata_matches,
       bool_and(r.autofill_rules_json->>'legacyBundledId'=e.legacy_id) as legacy_mappings_match,
       bool_and((o.metadata->>'size')::bigint=e.bytes and replace(o.metadata->>'eTag','"','')=e.etag) as uploaded_bytes_match
from expected e
left join public.franchise_contract_template_revisions r on r.storage_path=e.path
left join storage.objects o on o.bucket_id=${literal(bucket)} and o.name=e.path;`);
  process.stdout.write(`Prepared ${prepared.reduce((count, item) => count + item.revisions.length, 0)} exact PDF copies and metadata in ${output}. No remote records were changed.\n`);
  process.exit(0);
}

if (!publish || manifestOnly) {
  for (const item of prepared) {
    process.stdout.write(`${target} ${item.id}: ${item.revisions.map((r) => `r${r.number} ${r.checksum.slice(0, 12)}`).join(', ')}\n`);
  }
  process.stdout.write('Manifest verified locally. No remote records were changed.\n');
  process.exit(0);
}

const templateIds = [];
for (const item of prepared) {
  const existing = checked(await client.from('franchise_contract_templates')
    .select('id,is_active,remote_client_published,current_revision_id')
    .eq('franchise_id', franchise.id).eq('jurisdiction_key', item.state)
    .eq('pool_type', item.pool).eq('name', item.name), `Read ${item.id} template`);
  if (existing.length > 1) throw new Error(`Multiple ${item.id} templates exist; resolve the conflict before publishing.`);
  let template = existing[0];
  if (template?.is_active) throw new Error(`${item.id} is active for old clients; refusing publication.`);
  if (!template) {
    template = checked(await client.from('franchise_contract_templates').insert({
      franchise_id: franchise.id, name: item.name, jurisdiction_key: item.state,
      pool_type: item.pool, is_active: false, remote_client_published: false,
      created_by: 'west-contract-history-migration', updated_by: 'west-contract-history-migration',
    }).select('id,is_active,remote_client_published,current_revision_id').single(), `Create ${item.id} template`);
  }
  const revisionIds = [];
  for (const revision of item.revisions) {
    const existingRevision = checked(await client.from('franchise_contract_template_revisions')
      .select('id,revision_number,file_checksum,storage_path,field_layout_json,autofill_rules_json')
      .eq('contract_template_id', template.id).eq('revision_number', revision.number).maybeSingle(),
    `Read ${item.id} r${revision.number}`);
    if (existingRevision && (
      existingRevision.file_checksum !== revision.checksum || existingRevision.storage_path !== revision.path ||
      !sameJson(existingRevision.field_layout_json, revision.fields) ||
      !sameJson(existingRevision.autofill_rules_json, revision.rules)
    )) throw new Error(`${item.id} r${revision.number} differs from the verified history; refusing overwrite.`);

    const { data: existingFile, error: downloadError } = await client.storage.from(bucket).download(revision.path);
    if (downloadError && !/not found|404/i.test(downloadError.message)) throw downloadError;
    if (!existingFile) {
      checked(await client.storage.from(bucket).upload(revision.path, revision.bytes, {
        contentType: 'application/pdf', upsert: false,
      }), `Upload ${item.id} r${revision.number}`);
    }
    const downloaded = checked(await client.storage.from(bucket).download(revision.path),
      `Verify ${item.id} r${revision.number}`);
    const remoteChecksum = createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex');
    if (remoteChecksum !== revision.checksum) throw new Error(`${item.id} r${revision.number} uploaded PDF checksum mismatch.`);

    const saved = existingRevision || checked(await client.from('franchise_contract_template_revisions').insert({
      contract_template_id: template.id, franchise_id: franchise.id,
      revision_number: revision.number, storage_path: revision.path,
      original_file_name: revision.file, file_checksum: revision.checksum,
      field_layout_json: revision.fields, autofill_rules_json: revision.rules,
      minimum_core_version: '3.3.10',
      published_at: revision.rules.effectivePublishedAt || new Date().toISOString(),
      published_by: 'west-contract-history-migration',
    }).select('id').single(), `Insert ${item.id} r${revision.number}`);
    revisionIds.push(saved.id);
  }
  checked(await client.from('franchise_contract_templates').update({
    current_revision_id: revisionIds[revisionIds.length - 1],
    updated_by: 'west-contract-history-migration',
  }).eq('id', template.id).eq('is_active', false), `Set ${item.id} current revision`);
  templateIds.push(template.id);
}

const { data: published, error: publishError } = await client.from('franchise_contract_templates')
  .update({ remote_client_published: true, updated_by: 'west-contract-history-migration' })
  .in('id', templateIds).eq('is_active', false)
  .select('id,is_active,remote_client_published,current_revision_id');
if (publishError || published?.length !== 4 || published.some((row) => row.is_active || !row.remote_client_published || !row.current_revision_id)) {
  throw publishError || new Error('The four West templates were not published for new clients.');
}
process.stdout.write(`Published and verified ${prepared.reduce((count, item) => count + item.revisions.length, 0)} West revisions across four remote templates in ${target}. Old-client visibility remains off.\n`);
