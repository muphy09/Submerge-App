'use strict';

const { notarize } = require('@electron/notarize');
const fs = require('fs');
const os = require('os');
const path = require('path');

function maybeWriteApiKeyFile() {
  const apiKeyBase64 = process.env.APPLE_API_KEY_BASE64 || process.env.APPLE_API_KEY;
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  if (!apiKeyBase64 || !apiKeyId) {
    return process.env.APPLE_API_KEY_PATH;
  }

  const keyPath = path.join(os.tmpdir(), `ppas-notary-${apiKeyId}.p8`);
  if (!fs.existsSync(keyPath)) {
    const rawKey = apiKeyBase64.includes('BEGIN PRIVATE KEY')
      ? apiKeyBase64
      : Buffer.from(apiKeyBase64, 'base64').toString('utf8');
    fs.writeFileSync(keyPath, rawKey, { mode: 0o600 });
  }
  return keyPath;
}

exports.default = async function notarizeApp(context) {
  if (process.platform !== 'darwin') {
    return;
  }

  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`[notarize] Cannot find app at ${appPath}`);
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_KEY_ISSUER;
  const appleApiKeyPath = maybeWriteApiKeyFile();
  const teamId = process.env.APPLE_TEAM_ID;

  const hasApiKeyCreds = Boolean(appleApiKeyId && appleApiIssuer && appleApiKeyPath);
  const hasAppleIdCreds = Boolean(appleId && appleIdPassword);

  if (!hasApiKeyCreds && !hasAppleIdCreds) {
    console.warn('[notarize] Skipping notarization because Apple credentials are missing.');
    return;
  }

  const notarizeOptions = {
    appPath,
    tool: 'notarytool'
  };

  if (hasApiKeyCreds) {
    notarizeOptions.appleApiKey = appleApiKeyPath;
    notarizeOptions.appleApiKeyId = appleApiKeyId;
    notarizeOptions.appleApiIssuer = appleApiIssuer;
  } else {
    notarizeOptions.appleId = appleId;
    notarizeOptions.appleIdPassword = appleIdPassword;
  }
  if (teamId) {
    notarizeOptions.teamId = teamId;
  }

  console.log('[notarize] Submitting app for notarization...');
  await notarize(notarizeOptions);
  console.log('[notarize] Notarization complete.');
};
