# Mac distribution without Developer ID

Mac releases use a free ad-hoc signature. No Apple Developer Program membership,
signing certificate, or notarization credentials are needed for this build path.
This provides signature integrity, not an Apple-verified developer identity or
notarization. macOS will still require a per-app security exception.

## Building and publishing

Publish the normal global patch after including these changes. The Mac workflow
runs `scripts/sign-mac.js` through electron-builder's `afterPack` hook before
creating or uploading the DMG. It signs native modules, frameworks, helper apps,
and the outer bundle with `@electron/osx-sign`, then checks the complete signature
with `codesign --verify --deep --strict`. A failed signature stops the build.

Keep `mac.identity` set to `null`: electron-builder 24 does not support ad-hoc
identity selection directly. The hook does the signing; builder's subsequent
"skipped macOS code signing" message is expected. Do not strip signatures or
modify the packaged app after the hook runs. Notarization is intentionally unused
because it requires Developer ID signing.

To build locally on macOS without publishing:

```sh
npm run build:renderer
npx electron-builder --mac dmg --arm64 --publish never
```

Use `--x64` for Intel Macs. Verify the app copied out of the resulting DMG:

```sh
codesign --verify --deep --strict --verbose=2 "/path/to/Submerge Proposal Builder.app"
```

`spctl --assess` is expected to reject an ad-hoc app under default Gatekeeper
policy. A valid codesign result does not mean the app is notarized or bypasses
the user's security approval.

The existing Electron smoke test can exercise a packaged app using isolated
application data, without signing in:

```sh
SUBMERGE_ELECTRON_UI_ONLY=1 \
SUBMERGE_TEST_PACKAGED_EXECUTABLE="/path/to/Submerge Proposal Builder.app/Contents/MacOS/Submerge Proposal Builder" \
npx playwright test tests/e2e/electron-smoke.spec.ts
```

This checks app startup, not Finder's first-launch Gatekeeper flow. Before
distributing a newly published release, download its DMG through Safari on a
Mac and verify the following installation steps with the quarantined download.

## Recipient instructions

1. Download the appropriate Mac DMG and drag the app into Applications.
2. Attempt to open the installed app.
3. If macOS blocks it as an unidentified or unverified app, open System Settings
   → Privacy & Security, click **Open Anyway**, and confirm **Open**.

Apple documents this per-app exception at https://support.apple.com/en-us/102445.
Managed Macs can restrict overrides. A "damaged" error that persists is a build
or integrity problem to investigate; disabling Gatekeeper globally is not part
of this installation procedure.
