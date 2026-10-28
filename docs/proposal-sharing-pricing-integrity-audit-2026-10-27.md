# Proposal sharing: pricing integrity audit and implementation plan

Date: October 27, 2026. Branch: `sharing-wip`, HEAD `13fc062`.

Status: historical investigation and implementation scope. The approved implementation is now local on `sharing-wip`, with its database migrations applied only to staging. See [implementation and validation results](proposal-sharing-pricing-integrity-validation-2026-10-27.md). Findings below describe the behavior before those fixes.

## Required behavior

- A published pricing revision is an owner decision, including when a collaborator is an admin.
- Recipients see a notice that the owner must review the revision. They can continue editing under the currently accepted, pinned revision.
- Publishing, accepting, or declining a pricing revision must preserve contributor work and its route to owner review.
- If the owner accepts the revision, prepare the contributor's actual edits against that revision and recalculate the comparison. Do not restore old catalog prices or calculated totals.
- If the owner declines, retain the old revision and preserve contributor edits against it.
- The user chose: preserve an edited item that conflicts with the accepted revision and flag it for explicit owner resolution before application. Do not silently substitute or drop the item.
- No contributor save, cache response, background refresh, or unrelated proposal/version may silently change the owner draft. Contributor approval and pricing-revision approval are separate decisions.

## Findings

### 1. Accepting a pricing revision invalidates contributor requests

Confirmed in staging using authenticated RPC calls on disposable proposal clones in a rolled-back transaction. Changing the pinned revision through `collab_owner_save` changed a submitted request to `stale`. A decline-only decision retained `submitted` and left `content_revision` unchanged.

Cause: `collab_content_signature` includes the pricing pin, and any content change marks all active requests stale. `ProposalView.handleEdit` and the collaboration panel only resume working/revision-requested copies; the stored stale work remains, but its normal review/edit path is lost.

Sources: `supabase/migrations/20260923215634_shared_proposals_owner_review.sql:500`, `:761`, `:774`; `src/pages/ProposalView.tsx:2017`.

### 2. A stale first save can become a current request and roll back owner fields

Confirmed in staging. The contributor held the original snapshot, the owner changed pool max width from 20 to 25, and the contributor submitted only an intended city edit from the old page. The server accepted the request and attached the latest base revision. Applying it restored width to 20 as well as applying the city edit.

Cause: `collab_save_work` checks `base_revision` only when an active request already exists. For a first request, it assigns the current server revision without checking the snapshot the contributor actually edited. A terminal stale request also falls outside the active-request lookup. Whole-section replacement can therefore import unintended older values.

Source: `supabase/migrations/20260924032913_shared_proposal_single_pending_request.sql:25-46`.

### 3. Approval imports contributor-supplied calculated financial fields

Confirmed in staging. A request with unchanged proposal selections but a synthetic total of $1 and dig commission rate of 90% was accepted and applied. The original pricing revision ID stayed pinned. This is a deliberately inconsistent diagnostic payload, not evidence that an existing customer proposal has these values.

Cause: the mutable-field allowlist includes `pricing`, `costBreakdown`, `subtotal`, `taxRate`, `taxAmount`, `totalCost`, and `papDiscounts`. Approval copies them without canonical recalculation. The visible field comparison excludes several of these derived fields. A stable model ID alone does not ensure consistent financial data.

Sources: `supabase/migrations/20260923215634_shared_proposals_owner_review.sql:489`, `:518`, `:617`; `src/components/ProposalCollaborationPanel.tsx:29`.

Additional code finding: `ProposalForm.applySessionCommissionRates` unconditionally inserts the current user's commission rates into calculations, including contributor saves. Those results can flow through the broad approval allowlist. Shared work must preserve the proposal's approved commission basis; contributing does not transfer ownership or commission attribution.

Source: `src/pages/ProposalForm.tsx:603`.

### 4. Delayed shared reads can repopulate another account's cache

Confirmed in a browser diagnostic with intercepted backend requests. Account A started a shared read; the response was paused at the people lookup. After `clearSession()` and a switch to account B, completing the read stored A's share under a cache key for B.

Cause: `getSharedProposal` captures a user initially, but `cacheSharedProposal` computes the key from the current session after asynchronous work. Clearing the cache at sign-out cannot prevent a later response from repopulating it. UI request guards alone do not fix service-level caching.

Sources: `src/services/proposalCollaboration.ts:72`, `:127`, `:208`, `:245`. Audit `listSharedProposals` and other asynchronous reads/mutations for the same context drift.

### 5. Cached pricing values are trusted without full identity validation

Confirmed with a deliberately mis-keyed local cache entry. A cache key requesting franchise A/model A/pin A returned a cached object describing another franchise/model with pin A. Both the pricing adapter and existing-proposal snapshot loader accepted it.

This proves a missing integrity check; it does not prove that normal cache writes currently create this malformed entry. Validate the returned franchise, model, and revision as well as the lookup key, and do not silently fall back to another model for an existing pinned proposal.

Sources: `src/services/pricingModelsAdapter.ts:110`, `:230`; `src/services/pricingDataStore.ts:786`.

### 6. Revision upgrades can retain stale PAP metadata

Confirmed in a browser diagnostic: upgrading to a revision with excavation PAP 50% retained saved PAP metadata of 0%. The engine correctly used the new snapshot's 50% for arithmetic in this test; the total matched the canonical snapshot calculation. This is a metadata inconsistency, not a reproduced arithmetic failure. It can create misleading collaboration diffs and should be corrected at revision acceptance.

Source: `src/services/pricingRevisionReview.ts:770`.

### Further boundaries requiring dedicated regressions

- Selection sanitization in the general save adapter occurs outside the builder's temporary pinned snapshot. The sanitizer reads global catalog data. Determine whether a different active model can change selection defaults, including sibling versions, at this later save boundary.
- Async model selection, tier changes, navigation snapshots, in-flight autosaves, and account/franchise/mode changes must preserve their starting context or fail without mutation.
- Catalog selections contain embedded prices. Rehydration must distinguish explicit custom prices from cached catalog costs, including packages, dependencies, arrays, renamed items, and removed items.
- Restore, signed baselines, addendums, workflow approval resets, and review previews must use the same pricing and ownership rules as ordinary saves.

These are inspection targets, not confirmed failures unless identified above.

## Proposed implementation

1. **Separate revision visibility from permission to decide.** Add a recipient notice in summary and builder. Detection reads revision information; it does not update the proposal or pricing store. Keep owner decision controls and server enforcement owner-only. Handle unavailable revision checks explicitly.
2. **Capture contributor intent and its actual baseline.** Require proposal/version identity, expected revision, pricing identity, and session context on every initial save, update, submit, and apply. Compare contributor edits with their original base; retain untouched owner fields. Do not relabel an old full snapshot as current. Preserve original working data and notes throughout refresh/conflict handling.
3. **Preserve requests through pricing decisions.** Track when a request needs a new comparison instead of discarding its review path. Handle pricing-only changes separately from owner content edits and workflow submission. Repeated revisions, alternate versions, declined revisions, and unsaved contributor pages must be supported.
4. **Prepare a canonical owner review.** Merge only intended editable inputs into the current target. Resolve catalog costs, PAP rates, tier rules, taxes, and calculation defaults from that target's exact accepted immutable snapshot. Preserve proposal-owned financial settings and explicit custom adjustments. Calculate the before/after comparison from the same revision. Display conflicts involving changed/removed selections and require explicit owner resolution. Never auto-approve contributions after a pricing decision.
5. **Commit the reviewed result atomically.** Bind the owner-confirmed result to the exact request, current target, pricing identity, and content revision. Reject changed state between preview and apply. The server must enforce allowed fields, owner access, current contributor permission, workflow locks, signed-version protection, and expected revision. Do not accept contributor-supplied derived financial objects as authority. An implementation must identify which layer calculates and validates each financial field rather than merely trusting an added client-side check.
6. **Contain caches and async work.** Validate cached payload identity; capture account/franchise/mode/backend context before awaits and verify it before cache writes, state updates, or mutations. Scope caches to their environment. Wrap normalization, calculations, reviews, and persistence sanitization in the exact target snapshot, including each sibling version separately.
7. **Stage and verify compatibility.** Add focused Playwright and rollback SQL regressions, including old-client rejection where the RPC contract changes. Rehearse a targeted migration in staging; do not replay all migrations. Preserve existing requests and signed records. Keep production and publication separate from this implementation.

## Acceptance matrix

| Area | Cases and required invariant |
| --- | --- |
| Published revision | Owner and contributor both have open pages; contributor sees owner-review notice, stays editable, and remains on accepted pricing. |
| Decision timing | Owner accepts/declines before first contributor save, during editing, after save, after submission, and after requesting revisions; intended edits survive and remain reviewable. |
| Repeated revisions | R1 to R2 to R3, including R3 published during comparison; no stale comparison applies without refresh. |
| Conflict resolution | Changed/removed/renamed catalog items, package members, dependencies, custom selections; no silent drop, substitute, or reuse of old catalog costs. |
| Concurrent editing | Owner and multiple contributors edit unrelated fields, the same field, and different versions; unrelated edits survive, overlaps require resolution, duplicate application is rejected. |
| Pricing isolation | Different models, revisions, tiers, borrowed model franchises, warm/cold/malformed caches, and delayed out-of-order responses; accepted identity and canonical output stay aligned. |
| Financial integrity | PAP, commissions, admin fee, tax, markup, category adjustments, manual/retail adjustments, discount settings, embedded item costs, and historical pricing protection; no unrelated derived changes enter approval. |
| Persistence boundaries | Builder preview, manual save, autosave, summary adjustments, version creation/deletion/switching, reopening, export/contract generation, and restore; one authoritative pricing basis per target version. |
| Access/context | Admin contributor, view-only recipient, owner transfer, revocation/downgrade, leave, sign-out/in-flight response, franchise switch, test/live and staging isolation; access never broadens implicitly. |
| Workflow locks | Draft, submitted, approved/reapproval, signed baseline plus editable addendum, completed; signed content remains frozen and reviewability never bypasses submission locks. |
| Connectivity | Offline view, disconnect during editing/review/apply, failed pin lookup, reconnect with newer owner data; retain work, block unsafe persistence, refresh conflicts explicitly. |

## Validation completed during this audit

- 22 existing sharing UI, version-save, and proposal-sync authorization tests passed through `npm run test:ui`.
- 8 focused existing pinned-model, historical-protection, foreign-review, own-admin revision-choice, and borrowed-revision UI tests passed through `npm run test:ui` with the isolated revision-review server.
- 3 temporary browser diagnostics reproduced the account-cache race, malformed-cache identity acceptance, and PAP metadata inconsistency. These tests assert current behavior; they are not safety acceptance tests.
- 4 authenticated staging RPC scenarios reproduced acceptance/decline asymmetry, stale first-save overwrite, and derived-financial import. All disposable data rolled back.
- A read-only helper probe additionally retained the original tier/pin while importing inconsistent synthetic totals and PAP rates.
- Staging before/after: 44 proposals, proposal JSON fingerprint `11b94151e84850cbedc083ba9e368ce3`, 2 shares, 4 requests, 15 events. Verified unchanged after rollback testing.
- Initial sandbox UI attempts could not access localhost/the installed Chromium. The final tests ran successfully outside that sandbox with isolated Playwright profiles. No normal Submerge application data was used.
- Diagnostic scripts are in ignored `test-results/staging-sharing-pricing-audit.sql`, `test-results/sharing-pricing-audit.spec.ts`, and its configuration. Application source changes shown by Git predate this audit.

Production was not queried or changed. No changes were pushed or published. The subsequent implementation and acceptance results are recorded in the linked validation report; the audit results above describe the original diagnostic run.
