const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'release-state.json');
const franchiseNotesDirectory = path.join(root, 'release-notes', 'franchises');
const targetIndex = process.argv.indexOf('--target');
const code = String(targetIndex >= 0 ? process.argv[targetIndex + 1] || '' : '').trim().toLowerCase();

if (!/^[A-Za-z0-9-]+$/.test(code)) {
  throw new Error('Usage: node scripts/register-franchise-release.js --target <franchise-code>');
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.franchises ||= {};
if (Object.prototype.hasOwnProperty.call(state.franchises, code)) {
  console.log(`Franchise ${code} already has a release channel.`);
  process.exit(0);
}

state.franchises[code] = 1;
state.franchises = Object.fromEntries(
  Object.entries(state.franchises).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
);
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.mkdirSync(franchiseNotesDirectory, { recursive: true });
const franchiseNotesPath = path.join(franchiseNotesDirectory, `${code}.md`);
if (!fs.existsSync(franchiseNotesPath)) fs.writeFileSync(franchiseNotesPath, '');
console.log(`Registered franchise-${code} at release counter 1. Commit this state before publishing.`);
