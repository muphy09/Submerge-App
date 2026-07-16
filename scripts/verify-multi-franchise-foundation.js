const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];
const requireText = (content, pattern, description) => {
  if (!pattern.test(content)) failures.push(description);
};

const migration = read('supabase/migrations/202607150001_add_franchise_configuration_and_revisions.sql');
const forbiddenMigrationChanges = [
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table[\s\S]{0,120}\bdrop\s+column\b/i,
];
for (const pattern of forbiddenMigrationChanges) {
  if (pattern.test(migration)) failures.push(`Additive migration contains forbidden operation: ${pattern}`);
}

[
  ['immutable pricing revision table', /create table if not exists public\.franchise_pricing_model_revisions/i],
  ['configuration revision table', /create table if not exists public\.franchise_configuration_revisions/i],
  ['release assignment table', /create table if not exists public\.franchise_release_assignments/i],
  ['contract revision table', /create table if not exists public\.franchise_contract_template_revisions/i],
  ['pricing revision RPC', /create or replace function public\.save_pricing_model_revision/i],
  ['configuration revision RPC', /create or replace function public\.publish_franchise_configuration/i],
  ['contract revision RPC', /create or replace function public\.publish_contract_template_revision/i],
  ['future-franchise initialization trigger', /create trigger initialize_new_franchise_foundation/i],
  ['private contract storage bucket', /'franchise-contract-templates',\s*'franchise-contract-templates',\s*false/i],
  ['authenticated RLS', /enable row level security/i],
].forEach(([description, pattern]) => requireText(migration, pattern, `Migration is missing ${description}.`));

if ((migration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Migration has an unbalanced dollar-quoted function body.');
}

const tasks = JSON.parse(read('.vscode/tasks.json'));
const taskLabels = new Set((tasks.tasks || []).map((task) => task.label));
[
  'Test App',
  'Test App - Staging (Recommended)',
  'Release - One-Time Migration Bootstrap',
  'Release - PPAS West Only (5555)',
  'Release - PPAS East Only (6666)',
  'Release - Global (All Franchises)',
  'Release - Register New Franchise Channel',
  'Release - Selected Franchise Only',
].forEach((label) => {
  if (!taskLabels.has(label)) failures.push(`VS Code task is missing: ${label}`);
});

const releaseState = JSON.parse(read('release-state.json'));
for (const code of ['5555', '6666']) {
  if (!Number.isInteger(releaseState.franchises?.[code])) {
    failures.push(`release-state.json is missing franchise ${code}.`);
  }
}

const workflow = read('.github/workflows/release.yml');
requireText(workflow, /EP_PRE_RELEASE:/, 'Release workflow does not isolate channel tags as prereleases.');
requireText(workflow, /stage-update-assets\.js/, 'Release workflow does not stage manifest-matched asset names.');
requireText(workflow, /updates-\$channel/, 'Release workflow does not publish fixed per-franchise endpoints.');

const main = read('main.js');
requireText(main, /provider:\s*'generic'/, 'Electron updater is not using isolated generic endpoints.');
requireText(main, /updates-\$\{requestedChannel\}/, 'Electron updater does not derive a fixed endpoint from the authenticated channel.');

if (failures.length) {
  console.error('Multi-franchise foundation verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Multi-franchise foundation verification passed.');
