const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];
const requireText = (content, pattern, description) => {
  if (!pattern.test(content)) failures.push(description);
};

const migration = read('supabase/migrations/202607150001_add_franchise_configuration_and_revisions.sql');
const roleMigration = read('supabase/migrations/202607170001_harden_role_permissions.sql');
const draftPrivacyMigration = read('supabase/migrations/202607170002_keep_drafts_creator_private.sql');
const adminSettingsMigration = read('supabase/migrations/202607170003_secure_owner_admin_settings.sql');
const masterDraftMigration = read('supabase/migrations/202607170004_claim_legacy_master_drafts.sql');
const ownershipBackfillMigration = read('supabase/migrations/202607170005_backfill_all_legacy_proposal_owners.sql');
requireText(migration, /^begin;[\s\S]*commit;\s*$/im, 'Additive migration is not wrapped in an explicit transaction.');
requireText(roleMigration, /^begin;[\s\S]*commit;\s*$/im, 'Role migration is not wrapped in an explicit transaction.');
requireText(draftPrivacyMigration, /^begin;[\s\S]*commit;\s*$/im, 'Draft privacy migration is not wrapped in an explicit transaction.');
requireText(adminSettingsMigration, /^begin;[\s\S]*commit;\s*$/im, 'Admin Settings migration is not wrapped in an explicit transaction.');
requireText(masterDraftMigration, /^begin;[\s\S]*commit;\s*$/im, 'Master draft migration is not wrapped in an explicit transaction.');
requireText(ownershipBackfillMigration, /^begin;[\s\S]*commit;\s*$/im, 'Ownership backfill migration is not wrapped in an explicit transaction.');
const forbiddenMigrationChanges = [
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table[\s\S]{0,120}\bdrop\s+column\b/i,
];
for (const pattern of forbiddenMigrationChanges) {
  if (pattern.test(migration)) failures.push(`Additive migration contains forbidden operation: ${pattern}`);
  if (pattern.test(roleMigration)) failures.push(`Role migration contains forbidden operation: ${pattern}`);
  if (pattern.test(draftPrivacyMigration)) failures.push(`Draft privacy migration contains forbidden operation: ${pattern}`);
  if (pattern.test(adminSettingsMigration)) failures.push(`Admin Settings migration contains forbidden operation: ${pattern}`);
  if (pattern.test(masterDraftMigration)) failures.push(`Master draft migration contains forbidden operation: ${pattern}`);
  if (pattern.test(ownershipBackfillMigration)) failures.push(`Ownership backfill migration contains forbidden operation: ${pattern}`);
}

[
  ['immutable pricing revision table', /create table if not exists public\.franchise_pricing_model_revisions/i],
  ['configuration revision table', /create table if not exists public\.franchise_configuration_revisions/i],
  ['release assignment table', /create table if not exists public\.franchise_release_assignments/i],
  ['contract revision table', /create table if not exists public\.franchise_contract_template_revisions/i],
  ['pricing revision RPC', /create or replace function public\.save_pricing_model_revision/i],
  ['UUID-compatible pricing revision foreign key', /pricing_model_id\s+uuid\s+not null\s+references public\.franchise_pricing_models\(id\)/i],
  ['legacy proposal policy removal', /drop policy if exists "allow updates for franchise proposals" on public\.franchise_proposals/i],
  ['authenticated-only proposal table grants', /revoke select, insert, update, delete on public\.franchise_proposals from public, anon;[\s\S]{0,160}grant select, insert, update, delete on public\.franchise_proposals to authenticated;/i],
  ['configuration revision RPC', /create or replace function public\.publish_franchise_configuration/i],
  ['contract revision RPC', /create or replace function public\.publish_contract_template_revision/i],
  ['future-franchise initialization trigger', /create trigger initialize_new_franchise_foundation/i],
  ['private contract storage bucket', /'franchise-contract-templates',\s*'franchise-contract-templates',\s*false/i],
  ['authenticated RLS', /enable row level security/i],
].forEach(([description, pattern]) => requireText(migration, pattern, `Migration is missing ${description}.`));

if ((migration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Migration has an unbalanced dollar-quoted function body.');
}

[
  ['proposal ownership column', /add column if not exists designer_auth_user_id uuid/i],
  ['proposal ownership helper', /create or replace function public\.current_user_owns_proposal/i],
  ['bookkeeper review helper', /create or replace function public\.current_user_can_review_franchise/i],
  ['proposal role select policy', /create policy "proposal_role_select"/i],
  ['pricing-model role policy', /create policy "pricing_model_role_update"/i],
  ['user self-update policy removal', /drop policy if exists "franchise_users_self_update"/i],
  ['direct authenticated user updates revoked', /revoke insert, update, delete on public\.franchise_users from authenticated/i],
  ['guarded approval settings RPC', /create or replace function public\.update_franchise_user_approval_settings/i],
  ['guarded commission settings RPC', /create or replace function public\.update_franchise_user_commission_rates/i],
  ['guarded last-login RPC', /create or replace function public\.touch_current_user_last_login/i],
].forEach(([description, pattern]) => requireText(roleMigration, pattern, `Role migration is missing ${description}.`));

if ((roleMigration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Role migration has an unbalanced dollar-quoted function body.');
}

[
  ['creator-private proposal SELECT policy', /create policy "proposal_role_select"[\s\S]*current_user_owns_proposal[\s\S]*current_user_can_review_franchise[\s\S]*<> 'draft'/i],
  ['creator-only proposal INSERT policy', /create policy "proposal_role_insert"[\s\S]*with check \([\s\S]*current_user_owns_proposal/i],
  ['creator-private proposal UPDATE policy', /create policy "proposal_role_update"[\s\S]*using \([\s\S]*<> 'draft'[\s\S]*with check \([\s\S]*<> 'draft'/i],
  ['master cross-franchise ownership pin', /target_designer_auth_user_id = auth\.uid\(\)[\s\S]*lower\(profile\.role\) = 'master'/i],
].forEach(([description, pattern]) => requireText(draftPrivacyMigration, pattern, `Draft privacy migration is missing ${description}.`));

if ((draftPrivacyMigration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Draft privacy migration has an unbalanced dollar-quoted function body.');
}

[
  ['owner-only franchise helper', /create or replace function public\.current_user_is_owner_for_franchise/i],
  ['server-side PIN verification', /create or replace function public\.verify_franchise_admin_panel_pin/i],
  ['owner-only branding write RPC', /create or replace function public\.save_franchise_branding_owner_settings/i],
  ['owner-only franchise-code RPC', /create or replace function public\.save_franchise_code_owner_setting/i],
  ['anonymous branding grants revoked', /revoke all privileges on public\.franchise_branding from public, anon, authenticated/i],
  ['PIN omitted from branding column grant', /grant select \(\s*franchise_id,\s*logo_url,\s*app_name,\s*disable_signed_workflow,\s*updated_at,\s*updated_by\s*\) on public\.franchise_branding to authenticated/i],
  ['legacy public branding policy removal', /drop policy if exists "franchise_branding_read" on public\.franchise_branding/i],
].forEach(([description, pattern]) => requireText(adminSettingsMigration, pattern, `Admin Settings migration is missing ${description}.`));

if ((adminSettingsMigration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Admin Settings migration has an unbalanced dollar-quoted function body.');
}

[
  ['null-only legacy ownership guard', /target_designer_auth_user_id is null/i],
  ['master-stamped legacy draft guard', /target_proposal_json ->> 'designerRole'[\s\S]*= 'master'/i],
  ['active master identity match', /lower\(profile\.role\) = 'master'[\s\S]*profile\.auth_user_id = auth\.uid\(\)/i],
  ['unique master identity guard', /select count\(\*\)[\s\S]*lower\(candidate\.role\) = 'master'/i],
].forEach(([description, pattern]) => requireText(masterDraftMigration, pattern, `Master draft migration is missing ${description}.`));

if ((masterDraftMigration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Master draft migration has an unbalanced dollar-quoted function body.');
}

[
  ['unique master ownership backfill', /with master_matches[\s\S]*count\(distinct profile\.auth_user_id\)[\s\S]*ownership\.match_count = 1/i],
  ['same-franchise ownership backfill', /with franchise_matches[\s\S]*profile\.franchise_id = proposal\.franchise_id[\s\S]*ownership\.match_count = 1/i],
  ['ownership-column-only update', /set designer_auth_user_id = ownership\.auth_user_id/i],
].forEach(([description, pattern]) => requireText(ownershipBackfillMigration, pattern, `Ownership backfill migration is missing ${description}.`));

if ((ownershipBackfillMigration.match(/\$\$/g) || []).length % 2 !== 0) {
  failures.push('Ownership backfill migration has an unbalanced dollar-quoted function body.');
}

const tasks = JSON.parse(read('.vscode/tasks.json'));
const taskLabels = new Set((tasks.tasks || []).map((task) => task.label));
[
  'Test App',
  'Test App - Staging (Recommended)',
  'Test App - Production Migration (Isolated)',
  'Supabase - Login CLI',
  'Supabase - Deploy All Edge Functions to Staging',
  'Supabase - Deploy All Edge Functions to Production',
  'Release - One-Time Migration Bootstrap',
  'Release - PPAS West Only (5555)',
  'Release - PPAS East Only (9724)',
  'Release - Global (All Franchises)',
  'Release - Register New Franchise Channel',
  'Release - Selected Franchise Only',
].forEach((label) => {
  if (!taskLabels.has(label)) failures.push(`VS Code task is missing: ${label}`);
});

const releaseState = JSON.parse(read('release-state.json'));
for (const code of ['5555', '9724']) {
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
requireText(main, /app\.setPath\('userData',\s*isolatedUserDataPath\)/, 'Staging does not use an isolated Electron userData directory.');
requireText(main, /DATA_PARTITION[\s\S]{0,180}app\.getPath\('userData'\),\s*'proposals'/, 'Staging proposal files are not isolated from production files.');

const settings = read('src/pages/SettingsPage.tsx');
requireText(settings, /getUpdateChannel\(sessionRole,\s*getSessionFranchiseCode\(\)\)/, 'The manual update check does not resolve the authenticated franchise channel.');
requireText(settings, /checkForUpdates\(channel\s*\?\s*\{\s*channel\s*\}/, 'The manual update check does not pass its isolated channel to Electron.');

const releaseScript = read('scripts/release-channel.js');
requireText(releaseScript, /stableTag\s*=\s*bumpMajor\(state\.coreVersion\)/, 'The one-time bootstrap does not create a major-version stable bridge.');
requireText(releaseScript, /rev-parse[\s\S]{0,100}@\{upstream\}/, 'The release script does not resolve the configured upstream remote.');
requireText(releaseScript, /tags\.forEach\(\(tag\)\s*=>\s*run\('git',\s*\['push',\s*remote,\s*tag\]\)\)/, 'The release script does not publish tags individually for GitHub Actions.');

const productionDeploy = read('scripts/deploy-edge-functions-production.js');
requireText(productionDeploy, /\.env\.local/, 'The production Edge Function deploy does not derive its target from .env.local.');
requireText(productionDeploy, /\.env\.staging\.local/, 'The production Edge Function deploy does not compare its target with staging.');
requireText(productionDeploy, /--project-ref/, 'The production Edge Function deploy does not pass an explicit Supabase project ref.');
requireText(productionDeploy, /Validation-only check passed; nothing was deployed/, 'The production Edge Function deploy is missing its validation-only safety path.');

const devStart = read('dev-start.js');
requireText(devStart, /SUBMERGE_DATA_PARTITION\s*=\s*'staging'/, 'The staging task does not activate its isolated data partition.');

const app = read('src/App.tsx');
requireText(app, /VITE_SUBMERGE_ENVIRONMENT[\s\S]{0,220}\[\$\{environmentLabel\}\]/, 'The staging environment is not visible in the window title.');

if (failures.length) {
  console.error('Multi-franchise foundation verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Multi-franchise foundation verification passed.');
