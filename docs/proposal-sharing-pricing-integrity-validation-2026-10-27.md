# Proposal sharing pricing integrity: implementation and validation

Date: October 27, 2026. Branch: `sharing-wip`.

Implementation remains local and unpublished. Seven targeted migrations were applied only to staging project `maczvrxjnnpcsbcetabm`, including the later application-destination migration documented below. Production was neither queried nor changed. No commits or pushes were made.

## Follow-up: ordinary proposal creation regression

The user's staging creation test exposed an overbroad invalidation rule: `saveSession` incremented the proposal context generation on every session write, including an equivalent authentication restore. A restore during pricing initialization rejected an otherwise valid pricing load, and the editor's captured context subsequently rejected Save. The original matrix did not cover this routine session rewrite.

Session generations now change only when account, email identity, app-session identity, role, franchise, test mode, or test-account identity changes. Sign-out always invalidates existing contexts, including sign-out followed by a return to the same account. Routine display-name/profile refreshes preserve the context. New drafts also capture `designerAuthUserId` immediately, so a subsequent display-name refresh cannot make a draft appear to belong to another designer at its first save.

Added regressions exercise real ProposalForm creation with a session refresh during pricing requests, another refresh while editing, and saving with the exact loaded model/revision. Context tests also cover account/workspace/role/mode changes, transitions away and back, and sign-out/relogin. The focused corrected run passed all 10 creation/sharing/context tests; TypeScript and diff checks passed. The subsequent complete `npm run test:ui` run finished in four minutes: **225 passed, 2 failed, 1 skipped (228 total)**. Both failures are the same existing divider and updater tests documented below. The optional staging-snapshot test was skipped because its local fixture environment variable was not supplied in this run; its earlier six staging cases remain separately recorded. Normal creation, existing saves, version creation, historical pricing, exports/contracts, permission boundaries, workflow and sharing tests passed. This correction needs no database migration or data repair.

## Resulting behavior

### Follow-up: untouched information changed during owner review

The user's perimeter-only request (`PROP-1793134068100`, request `23a8274f-03a9-4347-be51-fe70ecad95cd`) was inspected read-only in staging. Its saved baseline and contributor equipment JSON were exactly equal. The eight-row comparison was generated later by owner-review preparation, not by an equipment edit in the contributor copy.

Two independent document-reconstruction errors affected all contribution sections:

- `mergeContribution` replaced full sections with their input-only projections, deleting saved catalog prices, section totals, and `hasBeenEdited` even when the section had no edits.
- `calculateCollaborativeVersion` returned its entire defaulted, catalog-hydrated, sanitized calculation view as the approval document. This replaced saved equipment specifications/prices and injected catalog defaults and flags into untouched selections.

The input projection now detects intent only. Its delta is replayed onto the complete current owner document. Review calculation still uses the exact accepted immutable snapshot, but the persisted document receives only differences between the normalized owner baseline and normalized candidate. Unrelated normalization is not persisted. Real changed selections receive their complete pinned representation, unchanged array entries preserve saved information, and dependency changes still appear for explicit review. The comparison UI was not filtered or changed to hide differences. Existing conflict, missing-selection, concurrency and server authorization checks remain active; no schema change was needed.

Validation of this follow-up:

- `npm run test:ui` focused run: **48 passed**, including the actual exported staging request, six real-price revision cases, real ProposalForm creation/contributor saves, isolated Electron persistence, sharing UI, version identities and authorization.
- New preservation regressions assert full JSON equality for every untouched section, no-op reviews, nested values, existing array members, explicit manual prices, owner edits, and deletions. Selected-item changes use pinned costs despite forged contributor prices; spa-dependent changes remain visible and require review.
- The actual request now shows exactly **one row: Perimeter 20 to 25, +$1,700**, total **$62,960 to $64,660**. The actual prepared approval payload preserves every other saved section exactly. The resulting review screenshot was inspected.
- An authenticated staging transaction cloned the QA proposal, added an untouched sibling, saved/submitted through the contributor RPC, and applied the browser-prepared payload through the owner RPC. It verified no owner mutation before approval, exact persisted equality of all untouched sections/pins/sibling, total $64,660, and one revision increment. All clone/share/request/event changes rolled back. Reusable assertions are in `supabase/tests/shared_proposals_untouched_information.sql`.
- TypeScript and whitespace checks passed. No full-suite rerun was needed for this follow-up; the earlier full-suite failures below remain separately recorded.
- Staging proposals before/after: **45**, fingerprint **`73ef95f2d8d751c6c018f5f026a1f2f3`**, zero leftover preservation clones. The user's real request remains submitted with its original timestamp. Production was not accessed. Nothing was committed, pushed, published, or applied to the user's real proposal.

These tests establish the covered preservation boundaries; they do not claim that every possible collaboration interaction has completed manual live-account acceptance.

- Only the owner can decide a proposal's pricing revision. Admin contributors see an advisory notice and can continue editing their private working copy while the decision is pending.
- Accepting or declining pricing preserves contributor work, notes, original baseline, and the owner-review path. Resuming an older working copy loads that copy's own pinned catalog before editing starts.
- Review performs a three-way merge of contributor inputs, their original baseline, and the current owner version. Unrelated owner edits survive; overlapping edits require a decision. Changed or missing catalog selections are preserved in the original request and flagged for explicit owner resolution.
- The owner review recalculates proposed inputs using the owner's exact accepted immutable pricing snapshot, tier, PAP basis, and saved commission settings. Contributor totals and embedded catalog costs are not financial authority. Explicit manual prices remain proposed inputs.
- Approval is a separate explicit owner action. The database checks owner identity, contributor access, workflow/version locks, protected pricing identity, request timestamp, and owner content revision atomically. Stale previews, old-client apply paths, duplicate application, and saves from another working-copy window are rejected.
- New private working copies remain hidden from the owner and other collaborators until submitted. Multiple contributors retain independent baselines and review histories.
- Model and shared-proposal caches include backend/account context and validate payload identity. Delayed responses after account changes cannot populate the next account's cache. Explicit model loads fail instead of silently selecting another model. Editor catalog bindings and per-version snapshot sanitization prevent background pricing loads from changing the pricing basis.
- Reviewer workflow saves cannot change the owner's model, revision, tier, or pricing decision. Signed versions remain protected; editable addendums retain their own target identity.

Financial arithmetic runs in the owner's canonical application pricing engine. SQL validates the permitted input merge, identity, permissions, and concurrency and accepts the owner's prepared financial result; it does not reimplement the full pricing engine in Postgres. Contributor-supplied financial results are discarded by the review preparation path.

## Staging schema

Applied migrations, matching the staging migration history:

1. `20261027195125_shared_proposal_pricing_integrity.sql`
2. `20261027195739_shared_proposal_integrity_review_refinements.sql`
3. `20261027200352_shared_proposal_reviewer_pricing_guards.sql`
4. `20261027201043_shared_proposal_catalog_input_guards.sql`
5. `20261027201652_shared_proposal_private_work_visibility.sql`
6. `20261027202324_shared_proposal_private_rpc_implementation.sql`

The new public RPCs are security-invoker wrappers around narrowly authorized private implementations with fixed empty search paths. Anonymous execution is denied for both wrappers and implementations. The final security-advisor comparison introduced no new findings; unrelated existing findings remain. Older sharing clients must upgrade to the new working-copy/review protocol rather than applying through the legacy RPC.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript `npx.cmd tsc --noEmit` | Passed |
| `git diff --check` | Passed |
| Original complete `npm run test:ui` run before creation follow-up | 222 passed, 2 failed, 224 total |
| Complete run after creation/session-refresh correction | 225 passed, 2 failed, 1 skipped, 228 total |
| Final sharing/pricing/real Electron persistence regressions after the final cache change | 16 passed |
| Additional focused authorization and sharing regressions after the complete run | 17 passed |
| Authenticated staging protocol matrix | 28 scenarios passed |
| Authenticated staging multiple-contributor/privacy scenario | Passed |
| Real-snapshot arithmetic through final authenticated staging RPCs | All 6 cases passed |

Staging protocol scenarios cover pricing decision timing before first save and after submission, repeated revisions, unrelated/overlapping owner edits, target-version creation/deletion, access revocation/downgrade, workflow locks, stale tabs, review races, duplicate apply, restore after pricing decisions, withdrawal/resubmission, notes, reviewer tampering, signed baselines, and addendums. The multiple-contributor scenario verifies private-draft visibility and preservation through sequential owner approvals.

The complete UI run has two outstanding failures outside the changed sharing paths:

- `tests/e2e/custom-off-contract-controls.spec.ts:3`: missing expected `.custom-option-action-divider` in Manual Custom Features.
- `tests/e2e/update-recovery.spec.ts:56`: updater install invocation count expected 1, received 0.

Screenshots and traces were inspected during diagnosis. The final contributor-editor screenshot was also inspected after the older-working-copy fix. Focused tests and complete-suite results are separate runs; they are not combined into a claimed all-green suite.

## Real-price staging cases

Each case proposes 50 additional square feet of decking, uses a real saved staging pricing snapshot, and passes the browser pricing engine's prepared result through authenticated database RPCs in a rolled-back transaction. The accepted test revision also changes excavation PAP by five percentage points. All cases compare complete financial objects, preserve saved owner commissions and the sibling version, and verify no owner mutation before approval.

| Version | Pricing decision | Before | After explicit contribution approval |
| --- | --- | ---: | ---: |
| Original | Pending | $83,360 | $84,660 |
| Original | Declined | $83,360 | $84,660 |
| Original | Accepted | $82,760 | $84,060 |
| Alternate | Pending | $88,330 | $89,630 |
| Alternate | Declined | $88,330 | $89,630 |
| Alternate | Accepted | $87,730 | $89,030 |

## Data preservation and scope

All disposable proposal clones, requests, synthetic revisions, events, and the credential-free temporary contributor identity were rolled back. Staging before/after: 44 saved proposals, 2 shares, 4 requests, 15 events, 19 pricing revisions, and zero leftover disposable contributor users. Proposal fingerprint remained `11b94151e84850cbedc083ba9e368ce3`, calculated as `md5(string_agg(proposal_number || proposal_json::text, '' order by proposal_number))`. The staging test-proposal table remains empty. Only the authorized schema migrations persist.

UI verification uses the production components with intercepted services in isolated browser fixtures, plus real Electron tests with isolated application data. Database verification uses real staging RPCs with authenticated role/JWT context and real snapshot arithmetic. This does not claim a manual, simultaneous live-login acceptance session for every matrix permutation. No normal user application data, passwords, or login sessions were reset. No production deployment or frontend release was performed.

The original audit and acceptance matrix are in [the audit document](proposal-sharing-pricing-integrity-audit-2026-10-27.md). Test source is under `tests/e2e` and `supabase/tests`; local snapshot fixtures and generated artifacts remain ignored under `test-results`.

## Follow-up: new draft or overwrite when applying contributions

The owner review now asks, "Review the changes made by [contributor] and decide how to proceed." Every review requires an explicit selection between **Create a new draft with these changes** and **Overwrite current version with these changes**. Switching this destination does not change or remove the comparison. Radios sit inline with their labels, the old original/current/proposed expander is removed, and the action button reads **Apply Changes**. Whole-draft "keep owner" is removed; genuine concurrent field conflicts still require separate resolution. Missing catalog items remain blocked from being accepted as unavailable selections.

`collab_apply_review_v3` applies both destinations through one server transaction and the existing owner/access/version/pricing/concurrency validation. New-draft approval appends a uniquely identified and named draft, preserving the source body and every sibling. It copies the current owner's pricing/template metadata, accepts only the reviewed mutable fields, resets lifecycle state, and records the source version. Overwrite uses the existing version replacement path without adding a version. The request records `application_mode` and `applied_version_id`, along with before/after history, in the same commit. Approval returns the destination version for the summary to select. Restore uses the existing guarded snapshot restoration and reverses either mode. The older overwrite RPC delegates to the same implementation for compatibility.

The local migration filename matches staging history: `20261027214923_shared_proposal_application_destination.sql`. Only this new staging schema migration persists. Anonymous execution of the new public and private functions is denied; the public wrapper is security invoker and the narrowly authorized private implementation uses an empty search path. Comparing security advisories without observation timestamps found no new findings.

Displayed construction values now say **Shotcrete** in collaboration and workflow comparisons. Persisted `gunite` enum keys remain compatible; no existing proposal data was rewritten to change display vocabulary.

Validation:

- **52 focused Playwright tests passed**, including the real apply-service transport, both UI destination choices, comparison stability, inline alignment, Shotcrete wording, original preservation regressions, real snapshot arithmetic, and isolated Electron persistence/version/authorization checks. Screenshots of both choices were inspected.
- **Six authenticated staging destination scenarios passed**: both destinations on Original, an alternate, and an editable addendum with a signed baseline. Each checks unauthorized approval, stale review rejection, invalid destinations, duplicate approval rejection, source/sibling preservation, reviewed financial values, saved pricing pin, request history, and restore. All disposable data rolled back. Assertions are in `supabase/tests/shared_proposals_application_destination.sql`.
- The existing **28-scenario authenticated staging protocol matrix passed again**, exercising legacy overwrite compatibility and access/workflow/pricing guards.
- TypeScript and diff whitespace checks passed. The earlier complete-suite results are separate; this follow-up ran focused checks.
- Staging proposal count remained **45**, fingerprint **`86a5c208a60a16f393e40babfd2b815c`**, zero destination-test clones. This fingerprint reflects the user's additional staging testing since the earlier perimeter investigation. No real request was approved by these tests. Production was not accessed; nothing was committed, pushed, or published.
