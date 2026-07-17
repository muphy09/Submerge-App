const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(`Production Edge Function deploy blocked: ${message}`);
}

function readEnvironment(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) fail(`${relativePath} was not found.`);
  const values = {};
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
  return values;
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '').toLowerCase();
}

function projectRefFromUrl(value, label) {
  let hostname;
  try {
    hostname = new URL(value).hostname;
  } catch (_) {
    fail(`${label} VITE_SUPABASE_URL is not a valid URL.`);
  }
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match) fail(`${label} URL is not a standard Supabase project URL.`);
  return match[1];
}

const production = readEnvironment('.env.local');
const staging = readEnvironment('.env.staging.local');
const productionUrl = normalizeUrl(production.VITE_SUPABASE_URL);
const stagingUrl = normalizeUrl(staging.VITE_SUPABASE_URL);
const productionKey = String(production.VITE_SUPABASE_ANON_KEY || '').trim();
const stagingKey = String(staging.VITE_SUPABASE_ANON_KEY || '').trim();

if (!productionUrl) fail('the production URL is missing from .env.local.');
if (!productionKey) fail('the production publishable/anon key is missing from .env.local.');
if (!/^(1|true|yes|on)$/i.test(String(production.VITE_SUPABASE_ONLY || '').trim())) {
  fail('production VITE_SUPABASE_ONLY must be true.');
}
if (!stagingUrl) fail('the staging URL could not be read for comparison.');
if (productionUrl === stagingUrl) fail('the production and staging URLs are identical.');
if (stagingKey && productionKey === stagingKey) fail('the production and staging keys are identical.');

const productionProjectRef = projectRefFromUrl(productionUrl, 'production');
const stagingProjectRef = projectRefFromUrl(stagingUrl, 'staging');
if (productionProjectRef === stagingProjectRef) fail('the production project reference matches staging.');

const functionsRoot = path.join(root, 'supabase', 'functions');
const functionNames = fs.readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();
if (!functionNames.length) fail('no Edge Function directories were found.');
for (const functionName of functionNames) {
  if (!fs.existsSync(path.join(functionsRoot, functionName, 'index.ts'))) {
    fail(`${functionName} is missing index.ts.`);
  }
}

console.log(`Production safety check passed for project ${productionProjectRef}.`);
console.log(`Prepared ${functionNames.length} Edge Functions: ${functionNames.join(', ')}`);
console.log('The existing linked Supabase project is intentionally ignored.');

if (process.argv.includes('--check')) {
  console.log('Validation-only check passed; nothing was deployed.');
  process.exit(0);
}

const cliEntrypoint = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
if (!fs.existsSync(cliEntrypoint)) {
  fail('the pinned local Supabase CLI is not installed; run npm install.');
}
const result = spawnSync(
  process.execPath,
  [cliEntrypoint, 'functions', 'deploy', '--project-ref', productionProjectRef],
  { cwd: root, env: { ...process.env }, stdio: 'inherit' }
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log('All production Edge Functions deployed successfully.');
