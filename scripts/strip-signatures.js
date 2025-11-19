'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function walk(dir, onFile, onDir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (onDir) {
        onDir(full, entry.name);
      }
      walk(full, onFile, onDir);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

function removeCodeSignatureDirs(root) {
  walk(
    root,
    () => {},
    (full, name) => {
      if (name === '_CodeSignature') {
        try {
          fs.rmSync(full, { recursive: true, force: true });
          console.log(`[strip-signatures] Removed ${full}`);
        } catch (err) {
          console.warn(`[strip-signatures] Failed to remove ${full}: ${err.message}`);
        }
      }
    }
  );
}

function removeSignaturesFromBinaries(root) {
  const targets = [];
  walk(root, (file) => {
    // Heuristic: skip obvious non-binary files to reduce noise
    if (/\.(plist|icns|json|html|js|css|png|jpg|svg|ttf|otf|woff2?|node)$/.test(file)) {
      return;
    }
    targets.push(file);
  });

  for (const target of targets) {
    const result = spawnSync('codesign', ['--remove-signature', target], { stdio: 'pipe' });
    if (result.status === 0) {
      console.log(`[strip-signatures] Removed signature from ${target}`);
    } else if (result.stderr && !result.stderr.toString().includes('code object is not signed')) {
      console.warn(`[strip-signatures] codesign failed for ${target}: ${result.stderr.toString().trim()}`);
    }
  }
}

exports.default = async function stripSignatures(context) {
  if (process.platform !== 'darwin') {
    // Only relevant on macOS builds.
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    console.warn(`[strip-signatures] App not found at ${appPath}`);
    return;
  }

  console.log(`[strip-signatures] Stripping signatures from ${appPath}`);

  removeCodeSignatureDirs(appPath);
  removeSignaturesFromBinaries(appPath);

  console.log('[strip-signatures] Done.');
};
