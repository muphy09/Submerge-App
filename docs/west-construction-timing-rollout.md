# West construction timing revision

Published to production on October 13, 2026. All four new revision records and
their separate PDF copies were verified. Source SHA-256 checksums, storage ETags,
sizes, the remaining 198 fields, and the exact two timing lines match the prepared
revisions. All 481 saved proposal rows, every historical revision, all template
records and the legacy default pointers retained their pre-publication checksums.
The app release has not been published; the West-only client release is next.

Only franchise 5555 changes. The new NC/SC shotcrete revisions are r3, and the
new NC/SC fiberglass revisions are r4. Each uses an exact copy of its verified source PDF and
owns a rendering patch plus a field map that removes only p1_8 and p1_9.

New proposal trees created in the updated client receive
`westConstructionTimingVersion: permit-and-dig-v1`. Copies and scratch versions
inherit the tree's marker. Existing proposals never receive it when loaded or
saved. Revision selection uses this marker and the revision's
`newProposalTreesOnly` rule; the renderer does not alter historical revisions.

Prepare the publication locally with:

```powershell
node scripts/prepare-west-construction-timing.mjs
```

This writes a review manifest and transactional publication SQL under
`test-results/west-construction-timing-revision`. It never connects to or writes a database.
It also prepares checksum-verified PDF copies under the `storage` subdirectory.
Upload those four files to their manifest paths in `franchise-contract-templates`
before running the publication SQL. Each revision needs its own storage path.
The baseline snapshot was read from production on October 13, 2026. The SQL
checks the exact baseline IDs, fields, rules, PDF references and checksums and
refuses to overwrite a conflicting revision. Re-audit if a baseline changes.

Publication remains a separate, explicitly authorized step. The West-only
VS Code release task publishes the client; it does not execute this SQL.
Publish these guarded revisions before distributing the updated client so new
trees can select them immediately after installation.

The publication intentionally leaves legacy `current_revision_id` pointers
unchanged. Updated clients select the new-tree-only revisions for marked trees.
Older installed clients retain the old head, and a null `effectivePublishedAt`
prevents their date-based inference from selecting the new revisions. Existing
trees see the same eligible latest revision as before, so this change introduces
no update prompt. Earlier unrelated revision prompts retain their usual behavior.

No proposal data, historical revision, original PDF, East template, changelog or
release channel is changed by preparation. Cached/offline rendering uses the
same revision-owned field maps and patches as online rendering.
