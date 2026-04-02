# Runtime Source Of Truth

## Main process

- The Electron entrypoint is `main.js` via `package.json -> main`.
- Local dev also boots Electron through `electron .`, so it resolves to `main.js`.
- Packaged builds include `main.js` directly through the electron-builder `files` list.

## Preload bridge

- The preload script loaded by the main process is `preload-script.js`.
- Renderer typings for the exposed bridge live in `src/types/electron.d.ts`.
- Any IPC contract change should be reflected in both `main.js` and `preload-script.js`, with matching renderer typings in `src/types/electron.d.ts`.

## Database path

- The active desktop runtime initializes SQLite directly inside `main.js`.
- Schema and seed files live under `src/database/`.
- There is no separate production database service layer at the moment.

## Removed legacy path

- `electron.ts`
- `preload.ts`
- `src/services/database.ts`

These files were older parallel implementations and were removed so the runtime contract has a single maintained path.
