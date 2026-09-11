const fs = require('fs');
const path = require('path');
const { parseReleaseVersion, compareCore, installedRevision, isNewerChannelRelease } = require('./release-version');

// Keep failed installation state outside the updater's disposable download
// cache so a relaunch cannot immediately offer the same blocked installer.
function createUpdateRecovery(filePath, currentVersion, releaseState) {
  let state = { failedVersions: [] };
  try { state = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) { /* First launch. */ }
  if (!Array.isArray(state.failedVersions)) state.failedVersions = [];
  const save = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(`${filePath}.tmp`, JSON.stringify(state));
    fs.renameSync(`${filePath}.tmp`, filePath);
  };
  const fail = (version) => {
    state.failedVersions = [...new Set([...state.failedVersions, version])].slice(-20);
    delete state.pendingInstall;
    save();
  };
  if (state.pendingInstall) {
    const current = parseReleaseVersion(currentVersion);
    const pending = parseReleaseVersion(state.pendingInstall.version);
    const superseded = current && pending && (compareCore(current.core, pending.core) > 0 ||
      (compareCore(current.core, pending.core) === 0 &&
        installedRevision(current, pending.channel, releaseState) >= pending.revision));
    if (currentVersion === state.pendingInstall.version || superseded) {
      state.failedVersions = state.failedVersions.filter(version => version !== state.pendingInstall.version);
      delete state.pendingInstall;
      save();
    } else {
      fail(state.pendingInstall.version);
    }
  }
  return {
    offer(version, channel, retryFailed = false) {
      const candidate = parseReleaseVersion(version);
      if (!candidate?.channel || candidate.channel !== channel) {
        return { available: false, message: 'This update does not match your update channel. You can keep using the current app.' };
      }
      if (!isNewerChannelRelease(currentVersion, version, channel, releaseState)) return { available: false };
      if (state.failedVersions.includes(version)) {
        if (!retryFailed) return {
          available: false,
          message: 'The previous update did not finish installing. Automatic retries are paused for this version. You can keep working; use Check for Updates in Settings when you are ready to retry.',
        };
        state.failedVersions = state.failedVersions.filter(entry => entry !== version);
        save();
      }
      return { available: true };
    },
    beginInstall(version) {
      state.pendingInstall = { version, fromVersion: currentVersion };
      save();
    },
    fail,
  };
}

async function handOffUpdateInstall({ platform, updater, openPath, quit }) {
  if (platform !== 'win32') {
    updater.quitAndInstall(false, true);
    return;
  }
  // electron-updater 6.x quits immediately after starting an asynchronous
  // Windows spawn. A rejected launch can otherwise be lost after app exit.
  // This is the already downloaded/verified NSIS installer, not a new URL.
  const installerPath = updater.installerPath;
  if (!installerPath) throw new Error('The downloaded installer is unavailable.');
  const error = await openPath(installerPath);
  if (error) throw new Error(error);
  quit();
}

module.exports = { createUpdateRecovery, handOffUpdateInstall };
