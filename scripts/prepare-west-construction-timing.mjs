import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Preparation only: this script never connects to a database or publishes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(await readFile(resolve(root, 'scripts/data/west-construction-timing-baselines.json'), 'utf8'));
const output = resolve(root, 'test-results/west-construction-timing-revision');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const compiled = await build({ entryPoints: [resolve(root, 'src/services/westContractConstructionTiming.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { withWestConstructionTiming } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const revisionIdFor = (templateId) => {
  const hex = createHash('sha256').update(`${templateId}:permit-and-dig-v1`).digest('hex').slice(0, 32).split('');
  hex[12] = '5'; hex[16] = '8';
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};
if (snapshot.templates.length !== 4) throw new Error('Expected exactly four verified West baselines.');
const revisions = snapshot.templates.map((base) => {
  const layoutId = `${base.jurisdiction_key.toLowerCase()}-${base.pool_type === 'fiberglass' ? 'fiberglass' : 'gunite'}`;
  const template = withWestConstructionTiming({ id: base.template_id, label: base.name, pdfUrl: '', pdfPath: '',
    fields: base.field_layout_json, staticPatches: base.autofill_rules_json.staticPatches || [],
    defaultFieldValues: base.autofill_rules_json.defaultFieldValues }, layoutId);
  if (template.fields.length !== base.field_layout_json.length - 2 ||
      JSON.stringify(template.fields) !== JSON.stringify(base.field_layout_json.filter((field) => !['p1_8', 'p1_9'].includes(field.id)))) {
    throw new Error(`${base.name}: the date fields must be the only field-map change.`);
  }
  const rules = { ...base.autofill_rules_json,
    staticPatches: template.staticPatches,
    changeNotes: ['Construction timing uses 2-4 weeks after permit issuance and full HOA approval, and 8-12 weeks from the dig date. Applies only to new proposal trees.'],
    newProposalTreesOnly: true, westConstructionTimingVersion: 'permit-and-dig-v1',
    // Old clients infer unpinned revisions from this date. Keep this revision
    // out of that inference; updated clients use the proposal-tree marker.
    effectivePublishedAt: null,
  };
  delete rules.legacyBundledId;
  const nextRevisionNumber = base.revision_number + 1;
  const storagePath = base.storage_path.replace(/\/r\d+-/, `/r${nextRevisionNumber}-`);
  if (storagePath === base.storage_path) throw new Error('Could not derive a unique revision PDF path.');
  return { ...base, revision_id: revisionIdFor(base.template_id), revision_number: nextRevisionNumber,
    source_storage_path: base.storage_path, storage_path: storagePath,
    field_layout_json: template.fields, autofill_rules_json: rules,
    baseline_revision_number: base.revision_number, baseline_fields: base.field_layout_json,
    baseline_rules: base.autofill_rules_json };
});
const lines = ['-- Prepared only. Publish after reviewing the client and these four new revisions.',
  '-- Historical rows, PDFs, legacy current_revision_id pointers and all proposals remain unchanged.', 'begin;'];
for (const row of revisions) {
  lines.push('do $timing$ begin',
    `if not exists (select 1 from public.franchises where id=${literal(row.franchise_id)} and franchise_code='5555') then raise exception 'Verified West franchise not found'; end if;`,
    `if not exists (select 1 from public.franchise_contract_templates t join public.franchise_contract_template_revisions r on r.id=t.current_revision_id where t.id=${literal(row.template_id)} and t.franchise_id=${literal(row.franchise_id)} and t.current_revision_id=${literal(row.current_revision_id)} and t.remote_client_published and r.revision_number=${row.baseline_revision_number} and r.storage_path=${literal(row.source_storage_path)} and r.file_checksum=${literal(row.file_checksum)} and r.field_layout_json=${json(row.baseline_fields)} and r.autofill_rules_json=${json(row.baseline_rules)}) then raise exception 'West baseline changed; re-audit before publication'; end if;`,
    `if not exists (select 1 from storage.objects src join storage.objects dst on src.bucket_id=dst.bucket_id where src.bucket_id='franchise-contract-templates' and src.name=${literal(row.source_storage_path)} and dst.name=${literal(row.storage_path)} and src.metadata->>'eTag'=dst.metadata->>'eTag' and src.metadata->>'size'=dst.metadata->>'size') then raise exception 'West revision PDF copy missing or different from source'; end if;`,
    `if exists (select 1 from public.franchise_contract_template_revisions where contract_template_id=${literal(row.template_id)} and revision_number=${row.revision_number}) then`,
    `if not exists (select 1 from public.franchise_contract_template_revisions where id=${literal(row.revision_id)} and contract_template_id=${literal(row.template_id)} and revision_number=${row.revision_number} and storage_path=${literal(row.storage_path)} and file_checksum=${literal(row.file_checksum)} and field_layout_json=${json(row.field_layout_json)} and autofill_rules_json=${json(row.autofill_rules_json)}) then raise exception 'New revision number already occupied; refusing overwrite'; end if;`,
    'else',
    `insert into public.franchise_contract_template_revisions (id,contract_template_id,franchise_id,revision_number,storage_path,original_file_name,file_checksum,field_layout_json,autofill_rules_json,minimum_core_version,published_at,published_by) values (${literal(row.revision_id)},${literal(row.template_id)},${literal(row.franchise_id)},${row.revision_number},${literal(row.storage_path)},${literal(row.original_file_name)},${literal(row.file_checksum)},${json(row.field_layout_json)},${json(row.autofill_rules_json)},${literal(version)},now(),'west-construction-timing-revision');`,
    'end if;', 'end $timing$;');
}
lines.push('commit;');
await mkdir(output, { recursive: true });
for (const row of revisions) {
  const bytes = await readFile(resolve(root, 'docs/Contracts', row.original_file_name));
  if (createHash('sha256').update(bytes).digest('hex') !== row.file_checksum) {
    throw new Error(`${row.name}: local source PDF does not match the verified revision checksum.`);
  }
  const destination = resolve(output, 'storage', row.storage_path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ projectId: snapshot.projectId, revisions }, null, 2));
await writeFile(resolve(output, 'publish.sql'), lines.join('\n') + '\n');
console.log(`Prepared four immutable West revisions in ${output}. Nothing was published.`);
