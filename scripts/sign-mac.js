'use strict';

const path = require('path');
const { signAsync } = require('@electron/osx-sign');

// electron-builder 24 skips signing entirely when mac.identity is null and
// does not support identity="-" directly. Sign the completed bundle here,
// before it is put into a DMG. Keep mac.identity=null so builder cannot
// replace this signature using a certificate from the machine's keychain.
exports.default = async function signMac(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.platform !== 'darwin') {
    throw new Error('Mac packaging requires macOS to apply and verify the ad-hoc signature.');
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const projectDir = context.packager.projectDir;

  console.log(`[sign-mac] Ad-hoc signing ${appPath}`);
  // osx-sign signs Mach-O files (including native .node modules), frameworks
  // and helper apps from the inside out, then seals the outer app bundle.
  // Its final codesign --verify --deep --strict check rejects broken builds.
  await signAsync({
    app: appPath,
    platform: 'darwin',
    identity: '-',
    identityValidation: false,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    // Omit strictVerify: 1.0.5 defaults to --strict; true becomes the invalid
    // codesign argument --strict=true in this version.
    optionsForFile: (filePath) => ({
      entitlements: path.join(
        projectDir,
        filePath === appPath ? 'entitlements.mac.plist' : 'entitlements.mac.inherit.plist'
      ),
      hardenedRuntime: false,
      timestamp: 'none',
    }),
  });
  console.log('[sign-mac] Ad-hoc signature verified. Users must approve this unidentified app in macOS Privacy & Security.');
};
