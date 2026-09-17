# Decking waste pricing rollout

The production database migration was applied on 2026-09-17 at 07:37 UTC:
`20260917073701_off_contract_decking_material_waste.sql`. The local filename matches
the recorded production migration version. The updated desktop application is
still required; the user will publish the global 3.4.0 patch. Do not replay
unrelated historical migrations.

## Admin settings

Under **Tile, Coping & Decking**:

- **Off Contract Decking → Material Waste** defaults to **10%**. It adds that
  percentage of pre-tax decking material cost only for selections marked Off
  Contract, including additional decking. Material tax also applies to the added
  material. Labor and existing quantity/freeform waste calculations are unchanged.
- **On Contract Decking → Quantity Waste** exposes the existing **5%** allowance
  on both material and labor quantities for non-concrete decking.
- **On Contract Decking → Freeform Waste** exposes the existing **5%** allowance
  on combined labor/material cost, including material tax. Existing concrete and
  additional-option `Waste not Included` exemptions remain in place.

On Contract controls affect on-contract selections only. Off-contract selections
retain their existing standard quantity/freeform rules plus the new material-only
allowance. All three settings can be edited per model and pricing tier, including
zero. Negative values are disallowed in the editor.

## Existing proposals

The migration publishes a new immutable revision for each model missing these
settings. It does not update proposal records, prior revisions, or legacy model
pricing JSON used by older desktop releases. Existing revisions without the new
off-contract setting calculate with 0%; their on-contract defaults remain 5%.

Editable proposals show the existing pricing-update prompt and require opening
the before/after comparison before accepting or keeping saved pricing. Declining
keeps the original revision. Signed versions cannot upgrade; the existing
addendum workflow remains required. Unavailable pinned revisions cannot silently
fall back to current pricing.

Publish/install the desktop release together with this migration. Older clients
do not understand the new settings and should not publish pricing revisions for
these models after rollout.

## Verification

- `npm run verify:decking-waste`: 32 combinations of primary/additional toggles,
  concrete/travertine, rectangle/freeform, and Normal/Bronze tiers; zero/custom
  rates, labor/COGS/commission preservation, on-contract controls, signed lock.
- `npm run verify:feenstra-legacy-pricing` and `tsc --noEmit` passed.
- Focused `npm run test:ui -- tests/e2e/decking-waste.spec.ts tests/e2e/pricing-cogs-overhead.spec.ts tests/e2e/proposal-persistence-safety.spec.ts tests/e2e/tile-coping-decking-price-impact.spec.ts` covers 16 passing browser/Electron tests.
- `scripts/decking-waste-migration-test.sql` runs the migration against synthetic
  temporary tables. Replace each standalone `-- MIGRATION` marker with the
  migration body, remove its BEGIN/COMMIT, and replace `public.` with `pg_temp.`.
  The fixture rolls back all changes. Verified in staging: 12 synthetic models
  across 4 franchises, preserved explicit admin settings and old revisions,
  idempotent second run.
- An additional existing `custom-off-contract-controls.spec.ts` test fails at
  line 57 because `CustomFeaturesSectionNew` does not render the expected
  `.custom-option-action-divider`. Neither that component nor that test was
  changed here.

Read-only production preflight on 2026-09-17 found 12 models across 4 franchises,
all with current immutable revisions; all 416 proposal records had model and
revision IDs.

## Production deployment verification

Applied only this migration to project `jhllbqzdapjeuuuuzcxh`, with transaction
checks that abort if proposal records, historical revisions, or legacy model
pricing JSON change. Published 12 new revisions across all 4 franchises. All
current models have Off Contract Material Waste = 10%, On Contract Quantity Waste
= 5%, and On Contract Freeform Waste = 5%.

Post-deployment checks confirmed:

- All 416 proposal records unchanged (before/after checksum
  `05f4c77c88e28a6a80fe42933f1b6787`).
- All 24 historical pricing revisions unchanged (before/after checksum
  `5dc503c29edb85dc51a6bb547136ad39`).
- 36 pricing revisions total after the 12 additions.
- Legacy pricing JSON unchanged, checked within the deployment transaction.
- Migration history records `20260917073701_off_contract_decking_material_waste`.

No desktop release or changelog changes were made as part of this deployment.
