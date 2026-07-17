const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'release-state.json');
const args = process.argv.slice(2);
const mode = args[0];
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? String(args[targetIndex + 1] || '').trim().toLowerCase() : '';
const allowedModes = new Set(['bootstrap', 'global', 'franchise']);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed.`);
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || 'Command failed.').trim());
  return String(result.stdout || '').trim();
}

function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Expected a stable semantic version, received ${version}.`);
  return match.slice(1).map(Number);
}

function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

function bumpMinor(version) {
  const [major, minor] = parseVersion(version);
  return `${major}.${minor + 1}.0`;
}

function bumpMajor(version) {
  const [major] = parseVersion(version);
  return `${major + 1}.0.0`;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

if (!allowedModes.has(mode)) {
  throw new Error('Usage: node scripts/release-channel.js <bootstrap|global|franchise> [--target 5555]');
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const franchiseCodes = Object.keys(state.franchises || {});
if (mode === 'franchise' && !franchiseCodes.includes(target)) {
  throw new Error(`Unknown franchise target ${target || '(missing)'}. Add it to release-state.json first.`);
}
if (mode === 'bootstrap' && state.bootstrapped) {
  throw new Error('The migration bootstrap has already been released. Use global or franchise mode.');
}
if (mode !== 'bootstrap' && !state.bootstrapped) {
  throw new Error('Run the one-time migration bootstrap release before channel-specific releases.');
}

const worktree = capture('git', ['status', '--porcelain']);
if (worktree) throw new Error('Release blocked: commit or stash all current changes first.');

const branch = capture('git', ['branch', '--show-current']);
if (!branch) throw new Error('Release blocked: detached HEAD is not supported.');
const upstream = capture('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
const remote = upstream.split('/')[0];
if (!remote) throw new Error('Release blocked: the current branch does not have an upstream remote.');
capture('git', ['remote', 'get-url', remote]);

console.log('Running release verification...');
run('npx', ['tsc', '--noEmit']);
run('npm', ['run', 'build:renderer']);

let stableTag = null;
const tags = [];
if (mode === 'bootstrap') {
  stableTag = bumpMajor(state.coreVersion);
  state.coreVersion = bumpPatch(stableTag);
  state.bootstrapped = true;
  state.masterBuild = 1;
  franchiseCodes.forEach((code) => { state.franchises[code] = 1; });
} else if (mode === 'global') {
  stableTag = state.coreVersion;
  state.coreVersion = bumpPatch(state.coreVersion);
  state.masterBuild = 1;
  franchiseCodes.forEach((code) => { state.franchises[code] = 1; });
} else {
  state.franchises[target] += 1;
  state.masterBuild += 1;
}

if (stableTag) tags.push(`v${stableTag}`);
if (mode === 'franchise') {
  tags.push(`v${state.coreVersion}-franchise-${target}.${state.franchises[target]}`);
} else {
  franchiseCodes.forEach((code) => {
    tags.push(`v${state.coreVersion}-franchise-${code}.${state.franchises[code]}`);
  });
}
tags.push(`v${state.coreVersion}-master.${state.masterBuild}`);

tags.forEach((tag) => {
  if (capture('git', ['tag', '--list', tag])) throw new Error(`Release tag already exists locally: ${tag}`);
});

writeJson(statePath, state);
if (stableTag) {
  run('npm', ['version', stableTag, '--no-git-tag-version', '--allow-same-version']);
}
run('git', ['add', 'release-state.json', 'package.json', 'package-lock.json']);
run('git', ['commit', '-m', `chore(release): ${mode}${target ? ` ${target}` : ''} ${state.coreVersion}`]);
tags.forEach((tag) => run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]));

console.log(`Pushing ${branch} to ${remote} with tags: ${tags.join(', ')}`);
run('git', ['push', '--atomic', remote, `HEAD:${branch}`, ...tags]);
console.log('Release tags pushed. GitHub Actions will build each isolated update channel.');
