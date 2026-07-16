const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(`Staging Edge Function deploy blocked: ${message}`);
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

function projectRefFromUrl(value) {
  let hostname;
  try {
    hostname = new URL(value).hostname;
  } catch (_) {
    fail('VITE_SUPABASE_URL is not a valid URL.');
  }
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match) fail('the staging URL is not a standard Supabase project URL.');
  return match[1];
}

const staging = readEnvironment('.env.staging.local');
const production = readEnvironment('.env.local');
const stagingUrl = normalizeUrl(staging.VITE_SUPABASE_URL);
const productionUrl = normalizeUrl(production.VITE_SUPABASE_URL);
const stagingKey = String(staging.VITE_SUPABASE_ANON_KEY || '').trim();
const productionKey = String(production.VITE_SUPABASE_ANON_KEY || '').trim();

if (!stagingUrl || /your-staging-project/i.test(stagingUrl)) fail('the staging URL is still a placeholder.');
if (!stagingKey || /your-staging-(anon-)?key/i.test(stagingKey)) fail('the staging key is still a placeholder.');
if (!/^(1|true|yes|on)$/i.test(String(staging.VITE_SUPABASE_ONLY || '').trim())) {
  fail('VITE_SUPABASE_ONLY must be true.');
}
if (!productionUrl) fail('the production URL could not be read from .env.local for comparison.');
if (stagingUrl === productionUrl) fail('the staging and production URLs are identical.');
if (productionKey && stagingKey === productionKey) fail('the staging and production keys are identical.');

const stagingProjectRef = projectRefFromUrl(stagingUrl);
const productionProjectRef = projectRefFromUrl(productionUrl);
if (stagingProjectRef === productionProjectRef) fail('the staging project reference matches production.');

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

console.log(`Staging safety check passed for project ${stagingProjectRef}.`);
console.log(`Deploying ${functionNames.length} Edge Functions: ${functionNames.join(', ')}`);
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
  [cliEntrypoint, 'functions', 'deploy', '--project-ref', stagingProjectRef],
  { cwd: root, env: { ...process.env }, stdio: 'inherit' }
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log('All staging Edge Functions deployed successfully.');
