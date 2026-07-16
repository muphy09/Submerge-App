const fs = require('fs');
const path = require('path');

const [, , manifestArg, outputArg] = process.argv;
if (!manifestArg || !outputArg) {
  throw new Error('Usage: node scripts/stage-update-assets.js <manifest.yml> <staging-directory>');
}

const manifestPath = path.resolve(manifestArg);
const buildDirectory = path.dirname(manifestPath);
const stagingDirectory = path.resolve(outputArg);
const manifest = fs.readFileSync(manifestPath, 'utf8');
const version = manifest.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1];
const urls = [...manifest.matchAll(/^\s*-?\s*url:\s*['"]?([^'"\r\n]+?)['"]?\s*$/gm)]
  .map((match) => path.basename(match[1].trim()));

if (!version || urls.length === 0) {
  throw new Error(`Could not read a version and artifact URLs from ${manifestPath}.`);
}

const normalizeName = (value) => value.replace(/[^A-Za-z0-9._-]+/g, '-');
const sourceFiles = fs.readdirSync(buildDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

fs.rmSync(stagingDirectory, { recursive: true, force: true });
fs.mkdirSync(stagingDirectory, { recursive: true });

const copied = [];
for (const url of new Set(urls)) {
  const sourceName = sourceFiles.find((name) => name === url)
    || sourceFiles.find((name) => normalizeName(name) === url)
    || sourceFiles.find((name) => name.includes(version) && path.extname(name) === path.extname(url));
  if (!sourceName) throw new Error(`No local build artifact matches manifest URL ${url}.`);

  fs.copyFileSync(path.join(buildDirectory, sourceName), path.join(stagingDirectory, url));
  copied.push(url);

  const sourceBlockmap = `${sourceName}.blockmap`;
  if (sourceFiles.includes(sourceBlockmap)) {
    fs.copyFileSync(
      path.join(buildDirectory, sourceBlockmap),
      path.join(stagingDirectory, `${url}.blockmap`)
    );
    copied.push(`${url}.blockmap`);
  }
}

const targetManifestName = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
fs.copyFileSync(manifestPath, path.join(stagingDirectory, targetManifestName));
copied.push(targetManifestName);

console.log(`Staged update assets for ${version}: ${copied.join(', ')}`);
