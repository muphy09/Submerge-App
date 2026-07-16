const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rawTag = process.env.RELEASE_TAG || process.argv[2] || '';
const version = rawTag.replace(/^v/i, '').trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
  throw new Error(`Invalid release version: ${rawTag || '(missing)'}`);
}

for (const fileName of ['package.json', 'package-lock.json']) {
  const filePath = path.join(root, fileName);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.version = version;
  if (json.packages && json.packages['']) json.packages[''].version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

console.log(`Build package version set to ${version}`);
