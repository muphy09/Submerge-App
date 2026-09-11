const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rawTag = process.env.RELEASE_TAG || process.argv[2] || '';
const version = rawTag.replace(/^v/i, '').trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
  throw new Error(`Invalid release version: ${rawTag || '(missing)'}`);
}

const releaseState = JSON.parse(fs.readFileSync(path.join(root, 'release-state.json'), 'utf8'));
const channelMatch = /-(master|franchise-[a-z0-9-]+)\.([1-9]\d*)$/.exec(version);
const channel = channelMatch?.[1];
const revision = channel === 'master' ? releaseState.masterBuild
  : releaseState.franchises?.[channel?.slice('franchise-'.length)];
const expected = channel ? `${releaseState.coreVersion}-${channel}.${revision}` : releaseState.coreVersion;
if (releaseState.schemaVersion !== 2 || version !== expected) {
  throw new Error(`Release tag ${version} does not match the aligned release state (${expected}).`);
}

for (const fileName of ['package.json', 'package-lock.json']) {
  const filePath = path.join(root, fileName);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.version = version;
  if (json.packages && json.packages['']) json.packages[''].version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

console.log(`Build package version set to ${version}`);
