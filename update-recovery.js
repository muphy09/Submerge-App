const fs = require('fs');
const path = require('path');

// Keep failed installation state outside the updater's disposable download
// cache so a relaunch cannot immediately offer the same blocked installer.
function createUpdateRecovery(filePath, currentVersion) {
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
    if (currentVersion === state.pendingInstall.version) {
      state.failedVersions = state.failedVersions.filter(version => version !== currentVersion);
      delete state.pendingInstall;
      save();
    } else {
      fail(state.pendingInstall.version);
    }
  }
  return {
    offer(version, channel, retryFailed = false) {
      const match = /^(\d+)\.(\d+)\.(\d+)-(master|franchise-[a-z0-9-]+)\.(\d+)$/.exec(version || '');
      if (!match || match[4] !== channel) {
        return { available: false, message: 'This update does not match your update channel. You can keep using the current app.' };
      }
      // A global release and the initial channel build contain the same code.
      // Do not require a second installation just to change the version label.
      const stableVersion = `${match[1]}.${match[2]}.${Number(match[3]) - 1}`;
      if (currentVersion === version || (currentVersion === stableVersion && Number(match[5]) === 1)) {
        return { available: false };
      }
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
