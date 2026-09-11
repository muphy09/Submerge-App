'use strict';

function bumpVersion(version, type) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid core version: ${version}`);
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function planRelease(previousState, mode, target, bumpType = 'patch') {
  const state = JSON.parse(JSON.stringify(previousState));
  if (state.schemaVersion !== 2) throw new Error('Migrate release-state.json to aligned versioning before publishing.');
  const codes = Object.keys(state.franchises);
  let stableTag = null;
  if (mode === 'bootstrap') {
    if (state.bootstrapped) throw new Error('The migration bootstrap has already been released.');
    stableTag = bumpVersion(state.coreVersion, 'major');
    state.bootstrapped = true;
  } else if (mode === 'global') {
    // A deliberately prepared version (such as the 3.3.8 migration) must be
    // published as-is. Subsequent global releases advance the released core.
    stableTag = state.pendingGlobalRelease && bumpType === 'patch'
      ? state.coreVersion : bumpVersion(state.coreVersion, bumpType);
  } else if (mode === 'franchise') {
    if (state.pendingGlobalRelease) throw new Error('Publish the prepared global release before a franchise-only release.');
    if (!codes.includes(target)) throw new Error(`Unknown franchise: ${target}`);
    state.franchises[target] += 1;
    state.masterBuild += 1;
  } else {
    throw new Error(`Unknown release mode: ${mode}`);
  }
  if (stableTag) {
    state.coreVersion = stableTag;
    delete state.pendingGlobalRelease;
    state.masterBuild = 1;
    codes.forEach(code => { state.franchises[code] = 1; });
  }
  const tags = stableTag ? [`v${stableTag}`] : [];
  (mode === 'franchise' ? [target] : codes).forEach(code => {
    tags.push(`v${state.coreVersion}-franchise-${code}.${state.franchises[code]}`);
  });
  tags.push(`v${state.coreVersion}-master.${state.masterBuild}`);
  return { state, stableTag, tags };
}

module.exports = { planRelease };
