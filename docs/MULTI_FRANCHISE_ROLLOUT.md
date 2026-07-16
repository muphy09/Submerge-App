# Multi-Franchise Staging and Rollout Guide

This rollout is designed so the currently published app keeps using its existing tables and mutable pricing snapshot until the new app is released. The migration adds tables, columns, functions, policies, and a private Storage bucket. It also adds pricing-revision identifiers to existing proposal JSON (including stored versions) so every existing proposal is pinned to the migration-time baseline before any admin can publish a new price. It does not recalculate prices, alter selections or workflow states, change proposal timestamps inside the JSON, or delete/rename current proposal, user, franchise, branding, or pricing data. Older clients ignore the added JSON fields.

## Recommended staging setup

Use a separate, persistent Supabase staging project. A Supabase branch is isolated, but new branches are data-less by default. For this transition, a separately restored staging project is easier because it lets us verify realistic proposal and pricing-model shapes before production.

1. In the production Supabase dashboard, open **Database > Backups > Restore to a New Project** and create a project whose dashboard name clearly includes `STAGING`.
2. In the new project, disable any copied external jobs, webhooks, email integrations, or scheduled tasks before testing.
3. Confirm that you are viewing the new staging project. Open its SQL Editor.
4. Open `supabase/manual/02_staging_sanitize_after_clone.sql` in VS Code.
5. Replace both safety placeholders at the top: your master email and `I_AM_ON_STAGING`.
6. Copy the entire SQL file into the staging SQL Editor and run it. This removes all other Auth users, keeps at most ten proposals per franchise, replaces customer/designer identity fields, and removes feedback/ledger history. It does not run unless both safeguards are changed.
7. Storage files are not included by Supabase database restore. That is acceptable for this rollout because the four PPAS West revision-1 contracts are bundled in the app and PPAS East intentionally has no contracts yet.

If **Restore to a New Project** is unavailable on your Supabase plan, create a normal second project instead. We will need to export/import the production schema before continuing; do not try to recreate tables manually.

## Run the migration in staging

Run these files in this exact order:

1. `supabase/manual/01_multi_franchise_preflight_read_only.sql`
2. `supabase/migrations/202607150001_add_franchise_configuration_and_revisions.sql`
3. `supabase/manual/03_multi_franchise_post_migration_verification.sql`

Each file can be opened in VS Code, selected with **Ctrl+A**, copied with **Ctrl+C**, and pasted directly into the browser SQL Editor. The first and third scripts are read-only. Stop if either script raises an error or does not show its final PASSED result.

## Point the local app at staging

1. Copy `.env.staging.example` to `.env.staging.local`.
2. In the staging Supabase dashboard, open **Project Settings > API**.
3. Paste the staging Project URL and staging anon/publishable key into `.env.staging.local`.
4. Never put the service-role/secret key in this file.
5. Run the VS Code task **Test App - Staging (Recommended)**.
6. The West/East test tasks use this same staging file and add a visible test target. Sign in as the master account and use **Act as Owner** to get the exact franchise-owner UI.

The production `.env.local` is not changed, so switching back is simply a matter of running the original **Test App** task.

## Required staging test matrix

### Compatibility and isolation

- PPAS West code is `5555`; PPAS East code is `6666`.
- Existing users and sanitized proposals load for both franchises.
- West shows its four blank bundled contract templates. East says no templates are published.
- Editing a West pricing model does not change East models, proposals, or configuration.
- Editing an East configuration revision does not change West.
- Master **Act as Owner** matches the selected franchise owner UI.
- While acting as owner, the master can create/edit test proposals and exercise the same workflow controls as that owner; RLS still records the real authenticated master account.

### Pricing revision safety

- Saving an admin pricing edit publishes Revision 2; Revision 1 stays visible and read-only.
- Designers see only one dropdown entry per model name and new proposals select the latest revision.
- Existing drafts keep their pinned price and receive the Yes / No / Compare Difference prompt.
- Comparison shows only proposal-relevant changed rows; higher After values are red and lower values green.
- A changed Submitted/Needs Approval/Approved proposal shows light-brown `User Review*` with the required tooltip.
- Choosing No records the decision, restores the underlying status, and shows **Upgrade to newest version** in that proposal's builder.
- Publishing Revision 3 restarts review even when Revision 2 was declined.
- Upgrading an Approved proposal with a price impact returns it to Needs Approval.
- Signed proposals never prompt or reprice.
- Addendum creation from a signed proposal asks whether to use the original or newest pricing revision, and the signed baseline remains unchanged.

### Contract safety

- First open pins the selected West contract revision to that proposal.
- A newer template prompts on contract-block open. No opens the pinned contract and asks again on the next open; Yes pins the new revision.
- Signed proposal contracts never change.
- Owners/Admins can view blank templates but cannot upload them. Only a master-published revision can become current.
- Open a remote revision once online, disconnect, and confirm the cached contract can still open.

### Offline recovery

- While online, rapid typing does not trigger background proposal saves.
- Disconnect while editing. Meaningful changes save locally without freezing or erasing typed text.
- Reconnect and confirm the proposal syncs.
- Simulate a newer cloud copy and confirm newest-wins behavior; the losing copy remains in the hidden recovery snapshot store.

### Roles

- Master: everything and master update channel.
- Owner: Admin Panel, Book Keeper area, Admin Settings, contracts, pricing, franchise configuration, workflow, and users.
- Admin: the same operational tools except Admin Settings.
- Bookkeeper: Book Keeper area plus proposal creation.
- Designer: Dashboard and personal Settings only.

## Production rollout

1. Finish the entire staging matrix and retain screenshots/notes for failures.
2. Confirm a current production backup exists. Do not restore it; it is only the recovery point.
3. Run the read-only preflight in production and save the results.
4. Run the additive migration in production, then immediately run post-migration verification.
5. Existing 2.4.7 users can continue working because their tables and columns remain intact; the added proposal revision metadata is ignored by that client.
6. Freeze pricing-model edits from the start of the production migration until the bootstrap adoption check in step 10. Proposal creation and ordinary proposal work can continue.
7. Test the new app locally against production with the master account without publishing a release.
8. Commit all code and confirm a clean worktree.
9. Run **Release - One-Time Migration Bootstrap** once. This gives current stable users the channel-aware app, then establishes isolated West, East, and master endpoints.
10. In the Master user list, verify every active user has reported the new revision-capable version before ending the temporary pricing-edit freeze. A user who has not opened the app since release remains on the old baseline and cannot be silently repriced because new RPC revisions no longer overwrite the legacy `pricing_json` snapshot.
11. For later releases use exactly one of:
   - **Release - PPAS West Only (5555)**
   - **Release - PPAS East Only (6666)**
   - **Release - Global (All Franchises)**

Every release task type-checks and production-builds first, refuses a dirty worktree, creates intentional Git tags, and then lets GitHub Actions update only the selected fixed endpoint. Global releases reset franchise counters to 1. Franchise releases increment only that franchise counter. Master receives every authorized build.

For a future franchise, its database configuration/release rows are created automatically when the franchise is created. Run **Release - Register New Franchise Channel**, enter its code, and commit the resulting `release-state.json` change. Thereafter **Release - Selected Franchise Only** publishes just that code. The two named West/East tasks remain convenient shortcuts; no new hard-coded app fork is needed.

## Recovery position

Routine executable rollback is intentionally not part of this design. If a new build has a UI defect, stop publishing that franchise channel; users can remain on the older build. Pricing, configuration, and contract data are immutable revisions, so the current assignment can be corrected with a new revision without rewriting old proposals. The additive database objects should remain in place even if the new app release is paused. A Supabase backup restore is reserved for a verified database incident, because restoring production causes downtime and can discard data created after the restore point.
