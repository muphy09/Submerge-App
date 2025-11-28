Franchise admin quickstart
==========================

Purpose: keep pricing per franchise, let users enter only their name + franchise code, and give you a place to manually add franchises/IDs without exposing passwords yet.

Default franchise
-----------------
- A default franchise is created automatically with id `default` and code `DEFAULT-CODE`.
- If your existing DB had no code column, it is migrated and missing codes are backfilled to `<id>-CODE`.
- Starter franchises are seeded: `Franchise 1111` (code `1111`) and `Franchise 2222` (code `2222`).

Adding or editing a franchise (manual)
--------------------------------------
- From the renderer DevTools console you can call:
  - `window.electron.upsertFranchise({ id: 'franchise-123', name: 'Franchise 123', franchiseCode: 'ABC-123' })`
  - Set `isActive: true` to make it the current active franchise immediately.
- Codes must be unique. Re-running with the same id updates the name/code.

Using a franchise code (no password)
------------------------------------
- Prompt the user for Name + Franchise Code, then call:
  - `window.electron.enterFranchiseCode({ franchiseCode: 'ABC-123', displayName: 'Jane Doe' })`
  - On success, the active franchise is switched and the response includes `franchiseId`/`franchiseName`.
- After a successful code entry, call `initPricingDataStore(franchiseId)` (and/or `setActiveFranchiseId(franchiseId)`) so pricing reloads in that bubble.

Pricing isolation
-----------------
- Pricing is stored in `franchise_pricing` keyed by `franchise_id`. Each franchise code switches the active franchise, and all pricing edits save to that franchise only.
- Legacy localStorage overrides are migrated into the default franchise on first load.
- Pricing models are versioned per franchise in `franchise_pricing_models`; admins can save named models, load them, and set a default model per franchise. Designers pick a model on the proposal form; existing proposals keep their chosen model even if the default later changes.

Future login/admin
------------------
- When you add roles later, keep the code flow and layer simple admin controls on top; codes can remain the “tenant selector” even if you add real auth.
