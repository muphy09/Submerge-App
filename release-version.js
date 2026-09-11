'use strict';

const { alignedFrom } = require('./release-version-policy.json');

function compareCore(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function parseReleaseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(master|franchise-[a-z0-9-]+)\.([1-9]\d*))?$/.exec(version || '');
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  const revision = Number(match[5] || 1);
  if (![...core, revision].every(Number.isSafeInteger)) return null;
  // Releases before 3.3.8 encoded the following patch in channel builds.
  if (match[4] && compareCore(core, alignedFrom) < 0) core[2] = Math.max(0, core[2] - 1);
  return { core, channel: match[4] || null, revision };
}

function installedRevision(current, channel, releaseState) {
  if (!channel) return 1;
  if (releaseState?.schemaVersion === 2 && releaseState.coreVersion === current.core.join('.')) {
    const revision = channel === 'master' ? releaseState.masterBuild : releaseState.franchises?.[channel.slice('franchise-'.length)];
    if (Number.isSafeInteger(revision) && revision > 0) return revision;
  }
  return current.channel === channel ? current.revision : 1;
}

function isNewerChannelRelease(currentVersion, candidateVersion, channel, releaseState) {
  const current = parseReleaseVersion(currentVersion);
  const candidate = parseReleaseVersion(candidateVersion);
  if (!current || !candidate?.channel || candidate.channel !== channel) return false;
  const coreComparison = compareCore(candidate.core, current.core);
  if (coreComparison !== 0) return coreComparison > 0;
  // Every artifact includes its channel counters. This also avoids reinstalling
  // code already present when switching between franchise and master accounts.
  const currentRevision = installedRevision(current, channel, releaseState);
  return candidate.revision > currentRevision;
}

function configureReleaseComparison(updater, currentVersion, getChannel, releaseState) {
  const originalIsSupported = updater.isUpdateSupported.bind(updater);
  updater.isUpdateSupported = async function (info) {
    if (!isNewerChannelRelease(currentVersion, info.version, getChannel(), releaseState)) return false;
    // A same-core channel revision sorts below stable in SemVer. Our predicate
    // above rejects real downgrades; retain Electron's OS and rollout checks.
    return originalIsSupported(info);
  };
}

module.exports = { compareCore, parseReleaseVersion, installedRevision, isNewerChannelRelease, configureReleaseComparison };
