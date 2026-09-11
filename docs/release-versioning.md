# Release versioning

Starting at 3.3.8, the stable app and its isolated update channels share the
same core version:

- Stable: `3.3.8`
- West: `3.3.8-franchise-5555.1`
- East: `3.3.8-franchise-9724.1`
- Master: `3.3.8-master.1`

The initial channel revision (`.1`) contains the same code as the stable build.
A franchise-only release increments that franchise's revision and the master's
revision, without changing the core. A subsequent global patch increments the
core and resets all channel revisions to 1. Minor and major releases behave the
same way, with their respective core bump.

`release-state.json` schema 2 stores the actual core version. The prepared 3.3.8
migration has `pendingGlobalRelease: true`: after committing the changes, the
existing **Release - Global Hotfix (Patch)** task publishes 3.3.8 as-is. That
release removes the flag. The following global patch therefore publishes 3.3.9.
Franchise-only publication is blocked while a global release is prepared.

The app compares core versions first and revision numbers second. Stable is
equivalent to channel revision 1. Each artifact also ships its release-state
counters, so switching accounts compares the requested channel against the
revision already included in that app, rather than comparing unrelated channel
counters. Candidates must always match the signed-in account's requested update
channel. Legacy builds without matching metadata use their own channel revision
or the shared core baseline for other channels.

Electron's supported-update hook enforces this ordering before its SemVer
comparison. `allowDowngrade` allows SemVer prerelease labels below stable, while
the hook rejects actual core/revision downgrades. The original OS compatibility,
rollout, and download integrity checks remain in place.

`release-version-policy.json` records the permanent 3.3.8 migration boundary.
Earlier channel versions encoded the next patch, so those historical versions
are normalized by subtracting one patch. Keep this boundary fixed for historical
version display and recovery. Existing 3.3.5 / 3.3.6-channel installations see
3.3.8 channel builds as newer even before they receive the new comparison logic.

Verify with:

```sh
npm run test:ui -- tests/e2e/release-version.spec.ts tests/e2e/update-recovery.spec.ts tests/e2e/electron-smoke.spec.ts
```
