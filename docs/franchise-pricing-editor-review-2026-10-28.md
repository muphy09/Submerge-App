# Franchise Pricing editor: review and redesign proposal

Reviewed October 28, 2026. Repository: C:\dev\Submerge. Branch: sharing-wip, commit 3b76b9c (newshare).

The requested name was shared-wip. The checkout and available branch list contain sharing-wip, not shared-wip; this review uses the current clean sharing-wip checkout. No production services were called, no production data was changed, and no application source was edited. Local review documents and disposable test artifacts are the only additions.

## Recommendation

Replace the current editor interface and its editing-state architecture with a dedicated pricing workspace. Preserve the canonical calculation engines, immutable revisions, franchise boundaries, and historical proposal behavior. A visual restyle alone would leave the main usability and correctness problems intact. Rewriting the pricing engine at the same time would unnecessarily increase risk.

The professional dashboard should help an administrator answer five questions:

1. Which franchise, model, tier, and revision am I editing?
2. Where is the setting, what does it mean, and where does it take effect?
3. What other values change when I change this one?
4. What will this do to representative proposal costs, retail prices, and profit?
5. What exactly will be published, and who will receive it?

## Review scope and evidence

Reviewed the page entry points, all 19 category definitions, generic and specialized editors, CSS layout, pricing store, tier inheritance and locks, model persistence adapter and repository SQL publication function, current calculation consumers, contract payment schedule consumer, and existing isolated UI fixtures.

Playwright visited every category using the real React editor with offline mocked models. All external browser requests were blocked. Existing admin-model-selection and COGS-overhead tests passed: 3 tests total. The standard npm test:ui invocation built successfully but its default-port server readiness check timed out. The same existing tests passed using a temporary config and a verified server at port 5189. No test harness source was changed.

Screenshots inspected: Excavation at 1600x1000 and Equipment at 1280x800. Additional screenshots include Discounts / Adjustments and Misc. This is not a live production-model audit: fixtures merge sample data with application defaults, so their dollar values must not be interpreted as franchise production prices. No authenticated Electron IPC persistence, live permissions, concurrent production sessions, or deployed database definition was exercised. Findings below distinguish observed UI behavior, source evidence, and recommendations.

Evidence artifacts: `test-results/pricing-audit/observations.json`, `review.cjs`, screenshots, and `spec-results/`. These ignored artifacts are disposable.

## Findings, ordered by implementation priority

### 1. Editing needs an isolated draft lifecycle — high priority

The editor updates the shared pricing store on each input change. `updatePricingValue` changes basePricingState, resolves the effective tier, synchronizes the mutable pricingData object, and notifies subscribers. These are in-memory changes, not automatic publication, but the editor does not own an independent transaction.

Model switching and history loading replace the current state and clear hasChanges. Back to Admin directly invokes onClose. No dirty-state decision is present in these handlers. Playwright changed the retail divisor to zero, switched models, observed no confirmation, and saw the divisor replaced by 70.

Create New Model clears metadata while retaining the existing pricing state, making its starting point implicit. Set Active clears the dirty flag as part of reloading model metadata; it is not a publish operation. These actions need distinct semantics.

Recommendation: editor-owned baseline plus draft, explicit Save Draft / Review & Publish / Discard, and dirty-state protection for navigation, model changes, history, and new-model creation. Specify whether drafts are local or shared. A tier switch should retain the entire model draft. Create Blank Model and Duplicate Model should be separate, named operations. Selecting a model for editing must not imply activation for designers.

Evidence: PricingDataModal.tsx:459, 488, 552, 579, 623, 639, 1004, 5053; pricingDataStore.ts:1067, 1121, 1130.

### 2. Publication has no stale-baseline check — high priority

The save adapter sends a whole pricing snapshot to save_pricing_model_revision, but no expected revision ID. The repository SQL serializes publication with an advisory lock; it does not compare the revision the editor loaded with the current revision. Serialization protects revision sequencing, but does not protect an administrator's changes from a second administrator publishing an older whole-model snapshot afterward.

This is source-level exposure, not a reproduced production incident. Add optimistic concurrency at publication: expectedRevisionId, conflict response, and a human-readable comparison before reapplying changes. Never silently retry a stale whole-model publication.

Evidence: pricingModelsAdapter.ts:431; supabase/migrations/202607150001_add_franchise_configuration_and_revisions.sql:584.

### 3. Validation is uneven and economically important — high priority

The retail denominator accepts zero: confirmed in the UI and pricing store. MasterPricingEngine divides COGS by this setting. The broad save path validates category adjustments for both tiers, but does not provide equivalent validation for all scalar/catalog inputs. Numeric parsing converts empty or unparseable text to zero; most scalar definitions have no bounds. This makes a temporary editing state indistinguishable from an intentional zero.

Payment schedule fields are independent percentages without an editor-level total indicator or total-equals-100 check. Rate tables need monotonic boundaries; catalogs need referential validation; package quantities need whole-number rules. Negative category adjustments are valid, while negative material costs generally should not be treated the same way.

Recommendation: a typed field registry with per-field units, blank behavior, limits, precision, applicability, and cross-field constraints. Keep raw text while editing; validate on blur and before publication. Errors should link directly to fields. Reject nonfinite values, impossible denominators, invalid schedules, broken package references, and duplicate IDs. Warn on unusual but permitted changes rather than silently clamping all inputs.

Evidence: PricingDataModal.tsx:153, 639, 660, 1825, 3521, 4276; pricingDataStore.ts:1067; masterPricingEngine.ts:600, 651.

### 4. Historical read-only behavior is not implemented consistently — high priority

Historical publication is explicitly blocked, which is good. However, generic scalar controls do not include historical state in their disabled calculation, and handlers do not universally reject historical edits. The central pane uses CSS pointer-events:none and aria-readonly, which do not disable keyboard editing. The details rail is a separate area. Category adjustments explicitly receive a disabled flag, illustrating inconsistent enforcement.

Treat this as a source-confirmed control weakness, not evidence that historical database revisions were modified. Implement read-only at component, handler, and persistence boundaries, and test keyboard access plus attempts to create/activate from historical context.

Evidence: PricingDataModal.tsx:513, 1803, 4243, 4690, 5194; PricingDataModal.css:284.

### 5. Information architecture mixes different jobs

The 19 navigation entries combine construction trades, product catalogs, financial policy, customer defaults, and contract settings. There is no global setting search, category filter, or stable section URL. The only route context is the model query parameter. Administrators have to remember historical placement rather than follow a consistent taxonomy.

Examples: tax in Misc; core pricing formula under Manual Retail Price Adjustments; fiberglass contract milestones inside shell catalogs; soil engineering in Excavation; steel Double Curtain in Excavation; automatic-cover trade costs in Pool Specifications; excavation bonding under Misc > Equipment Set.

Separate the place a designer selects a feature from the trade where its cost belongs. A feature can have a single overview with links to several trade rates; do not duplicate editable values just to make it discoverable.

### 6. The layout spends too much space on framing

The desktop layout reserves 280px for navigation and 360px for the details rail, plus gaps and padding. At 1280x800, the screenshot shows a narrow central workspace, a large empty details panel, a tall header, and lower categories requiring navigation scrolling. Nested cards and repeated headings consume space before actual settings. Several panes scroll independently.

Recommendation: compact persistent model context, grouped navigation, one primary content scroll region, and a detail drawer only when an item is selected. Use a full-width catalog table when browsing. Keep a persistent draft action bar rather than large permanent action cards. Hide inactive detail space. Support keyboard operation, visible focus, meaningful button names, zoom, and smaller laptop windows.

The DOM also exposes glyph text in several category names, for example EEquipment and FSFiberglass Shells. Mark decorative glyphs aria-hidden; use one icon system instead of mixing letter abbreviations with pictograms.

### 7. The editor has multiple interaction grammars

Scalar cards edit in place. Catalog tables select a row and edit elsewhere. Additional-feature tables use a similar selection pattern but combine cost and default state. Packages use a large bespoke form. Category adjustments have their own edit/done lifecycle. Fiberglass combines prices with physical specifications.

Different data types deserve different editors, but the same actions should behave consistently. Use four reusable patterns: rate matrix, searchable catalog table with detail form, package builder, and conditional-rule builder. All share dirty indicators, validation, reset, help, and publication behavior. A local Done action should say Apply to Draft if it does not publish.

### 8. Labels and units are not a dependable contract

Confirmed example: Additional 6-inch depth is labeled per sqft, while the engine charges by the number of six-inch depth increments above the threshold. The quantity is not surface area.

Other ambiguities: COGS vs Retail Price Increase is actually the denominator in retail = COGS / ratio. 70% is a COGS-to-retail ratio, not a 70% gross margin. The base formula rounds upward to the next $10 and later incorporates adjustments and fees. Show a worked example with the real engine rather than making admins infer this from a tooltip.

Additional Features tables show Associated Cost without its unit: Gravel Install, Dirt Haul, Soil Sample / Engineer, and Double Curtain use different bases. Material Rate / Labor Rate likewise need explicit $/ft, $/sqft, $/unit, or flat-charge labels. Percentages are displayed both as percent inputs and raw multipliers such as 1.1 and 1.125. Normalize presentation while preserving stored semantics.

Evidence: PricingDataModal.tsx:1825, 1993, 2036, 1130, 3762; pricingEngine.ts:249; masterPricingEngine.ts:651.

### 9. Dependencies exist but are not reviewable as a set

Changing catalog costs can automatically change fixed package prices. Changing the 2-inch pipe rate also changes water-feature per-foot pricing. Some tax and water-truck fields synchronize legacy aliases. These are intentional behaviors with financial impact, not just independent cells.

The package introduction explains automatic cost tracking, which should be retained. Extend it with a change summary: direct changes, dependent changes, affected packages, and scenario impact. Show where a value is inherited and where it is overridden. A dependency graph can be implemented as links and a concise affected-items list; it need not be a complex diagram.

Evidence: PricingDataModal.tsx:639, 1617; pricingDataStore.ts:621, 1130.

### 10. Tier behavior needs a first-class interface

Normal and Bronze are hardcoded tier IDs. Some Bronze values are inherited, others overridden, and selected fields are forcibly locked; East has a gravel exception. Physical fiberglass dimensions are intentionally shared across tiers. The current editor has difference styling and reset controls, but does not give a complete tier overview.

Add Inherited / Overridden / Locked / Shared across tiers states, explanations, an Overrides Only filter, and side-by-side Normal/Bronze comparison. Preserve the existing locks until their business owners approve a different rule. Arbitrary new tiers require domain work and are not a simple UI feature.

Numeric array indexes are part of tier override paths and several selection keys. Before adding sorting/reordering/import, migrate new catalog identity to stable IDs with compatibility adapters; otherwise list changes can make references fragile. This is an architectural risk, not a demonstrated current corruption.

Evidence: pricingTiers.ts:7, 93, 132, 213, 238; pricingDataStore.ts:1153.

### 11. Revision history has data that the UI does not use well

Revision summaries include publisher and changeSummary, but the visible history is mainly revision number and date. The editor save does not supply a meaningful change summary. There is no admin-focused comparison, publication reason, or impact-review step.

Add comparison against the loaded baseline, publisher, timestamp, reason, and changes grouped by category and tier. A restore should create a new revision, never rewrite history. Show the distinction between publishing a revision and making a model the franchise default. Retain existing proposal opt-in and signed-version protections.

Evidence: pricingModelsAdapter.ts:378, 399, 431; pricingDataStore.ts:1067; PricingDataModal.tsx:4950.

### 12. Some labels are local preferences masquerading as model configuration

Additional-cost label overrides are stored immediately in localStorage by franchise. They are not part of the pricing revision and are not synchronized through the publication workflow. Another admin/device can see a different label for the same cost field. Reset Changes does not roll back that local preference.

Choose deliberately: a personal display preference should be labeled as such; a business meaning should be revisioned, shared configuration. Prefer structured cost components with meaningful names over unrestricted renaming of generic Add Cost 1/2 fields.

Evidence: pricingFieldLabels.ts:1, 42; PricingDataModal.tsx:1413.

### 13. Error and success states need tightening

Some load/default operations only console.warn. handleActivateSelected flashes Activated after awaiting a helper that catches its own error, so the outer handler does not reliably know whether activation succeeded. A professional admin workspace should distinguish loading, loaded from cache, failed, draft saved, published, and activated states, and show actionable errors inline.

Deletion uses a confirmation, and active-model deletion is blocked. Preserve those protections, but prefer archive/retire terminology when a catalog item/model has historical usage. Before implementing retirement, verify how current delete behavior affects references and availability; do not assume all old objects can simply be removed.

Evidence: PricingDataModal.tsx:449, 601, 623, 1004; pricingModelsAdapter.ts:595.

## Category-by-category disposition

| Current category | Recommended destination and treatment |
|---|---|
| Discounts / Adjustments | Split into Pricing Policy, Supplier Discounts, Conditional Adjustments, and Proposal Defaults. Move core overhead/retail formula out of manual adjustments. |
| Pool Specifications | Feature Defaults plus feature-specific cost links. Silt fence belongs with site/layout costs; automatic-cover steel/shotcrete charges should be identifiable by billed trade. |
| Plans & Engineering | Keep under Construction Rates > Preconstruction. Include a discoverable soil engineer rate currently reached through Excavation. |
| Layout & Permit | Keep together under Preconstruction, with separate layout/permit groups and explicit per-project/per-spa units. |
| Excavation | Construction Rates > Excavation. Unified range matrix, overage row with clear per-sqft unit, depth increment rates, site access and disposal. Avoid duplicate over-1000 controls. Cross-link RBB and Out of Ground charges. |
| Plumbing | Construction Rates > Plumbing. Group included allowances with overrun prices; separate pipes from charge formulas. Move unused inputs into a clearly marked legacy view. |
| Water Features | Product Catalogs > Water & Fire Features. Group by type, add search and explicit cost composition; link plumbing/electrical requirements. |
| Electrical & Gas | Construction Rates with separate electrical and gas groups. Group thresholds and overrun prices together; explain dependencies on plumbing/conduit. |
| Steel | Construction Rates > Steel. Use height rows for RBB, identify flat versus per-foot charges, and cross-link Double Curtain. |
| Shotcrete Labor | Merge navigation with Shotcrete Material under Shotcrete, preserving separate labor/material cost accounting. |
| Shotcrete Material | Shotcrete > Materials and Quantity Rules. Explain the shared yardage and minimum billable labor quantity. |
| Tile, Coping & Decking | Product Catalogs > Finishes & Hardscape, with linked installation rates and waste rules. Separate tile, coping, decking, steps, and spillway subviews. |
| Equipment | Split catalog management from package composition. Equipment installation is a linked Construction Rates section. |
| Interior Finish | Finish catalog plus preparation/installation rates, minimum charge area, waterproofing, and clearly separated defaults. |
| Cleanup | Construction Rates > Completion & Startup, keeping its billing category intact. |
| Fiberglass Shells | Product Catalogs > Fiberglass: searchable models with size filters rather than three isolated tables. Distinguish specifications, acquisition costs, installation, and upgrades. Move contract schedule out. |
| Misc | Eliminate this navigation category. Move tax to Policy; equipment set to Installation; startup/warranty to Completion; water truck to Filling; drainage to Site Work. |
| Masonry | Construction Rates/Catalogs > Masonry & Walls. Facings, retaining walls, columns, waste, and related RBB/spa behavior in one discoverable area. |
| Custom Features | Catalogs > Custom Features. Structured unit pricing and add-ons with stable relationships, consistent descriptions, and clear designer availability. |

Changing navigation must not silently change billed categories, calculation order, proposal JSON paths, or contract output. For example, excavation bonding and steel bonding remain distinct charges until domain review establishes otherwise.

## Controls to expose, reorganize, or deliberately protect

| Setting | Current evidence | Recommendation |
|---|---|---|
| Gunite payment milestones | pricingData.misc.contractPaymentSchedule.gunite is consumed by contractGenerator; only fiberglass milestones are exposed here. | Expose both schedules in Contract & Payment Rules with totals and contract preview. Keep template compatibility and signed revisions protected. |
| Light-run conduit multiplier | electrical.lightRunConduitMultiplier is consumed by pricingEngine.ts:627; no field in this editor. | Expose in advanced electrical/conduit quantity rules, with affected quantity example. |
| Panel-ledge material waste | tileCoping.rockworkMaterialWaste.panelLedge is consumed by pricingEngineComplete.ts:552 and 1934; absent from editor. | Expose with masonry material allowances and explain its affected calculations. |
| Pump fallback overhead | equipment.pumpOverheadMultiplier is used when item overhead is missing; item-specific multipliers are already editable. | Show fallback/inheritance explicitly. Prefer normalizing new items to explicit values over leaving a hidden fallback. |
| Administrative fee rate | masterPricingEngine.ts:606 falls back to 2.9% on proposal pricing; no model control. | Candidate for a versioned financial policy after deciding whether this is franchise-, model-, or proposal-owned. It affects profit calculations, so do not casually label it a customer surcharge. |
| Automatic-cover retail multiplier | masterPricingEngine.ts:498 hardcodes 1.7. Trade costs are separately exposed. | Candidate for advanced Pricing Policy with a complete cost-to-retail example and explicit approval of scope. |
| Coping size price adjustments | pricingEngineComplete.ts:507 hardcodes 33% material increase for 16x16 and zero entries for 12x24. | Candidate for a size-adjustment matrix after confirming intended business rules. |
| Excavation bonding overhead | Engine explicitly fixes 10%; pricingData also contains a markup property that is not the engine's control. | Explain the fixed rule. If configurability is approved, implement a real revisioned parameter; merely exposing the existing markup property would be misleading. |
| Excavation overdig and shotcrete allowance | pricingEngine.ts:351 and 1212 contain fixed formula factors. | First expose read-only formula explanations. Only make approved business allowances editable; engineering constants are not ordinary admin rates. |
| Off-contract freeform allowance | pricingEngineComplete.ts:723 and 740 use fixed 5% branches, while other decking waste settings are editable. | Explain the difference; evaluate a separately named revisioned control rather than combining unlike allowances. |
| Tier locks and new tiers | Normal/Bronze plus explicit protected paths and franchise exception. | Make visible with reasons; configurability is a separate business decision. |
| Commissions and approval thresholds | Already managed in AdminPanelPage user management. | Link to the owner of these settings. Do not create competing pricing-model copies without changing the ownership model. |
| Unused pipe rates / legacy aliases | Three pipe inputs explicitly marked unused; tax and water-truck aliases are synchronized. | Hide from ordinary editing, document compatibility purpose, and audit consumers before removal. |

A field being absent is not sufficient evidence that it should become editable. Dead fields such as legacy aliases must not be promoted merely because they appear in pricing JSON.

## Proposed workspace

Top-level areas:

- Overview: model/tier/revision identity, draft status, validation issues, last publication, and links to common tasks.
- Pricing Policy: overhead, COGS-to-retail ratio, tax, approved fees, supplier discounts, and adjustments.
- Construction Rates: grouped trades with rate tables, units, thresholds, allowances, and linked feature costs.
- Product Catalogs: searchable equipment, water/fire features, finishes, hardscape, fiberglass, masonry, and custom features.
- Packages & Defaults: package composition, included quantities, compatibility, default selections, and feature availability.
- Contracts & Payments: supported schedules and related contract behavior, with template-management links.
- Test Pricing: compare baseline and draft through the canonical engine using isolated scenarios.
- Revisions: publish review, history, differences, and restore-as-new-revision.

Within every area: global search by label/synonym, stable section links, unit-aware inputs, contextual help, inherited/overridden/locked status, and a common action bar. Overview should present actionable information, not decorative charts or profit metrics without a defined scenario.

Example task: find Pump A, change acquisition cost, see two affected package prices, inspect scenario changes, review the full diff, and publish a revision with a reason. The comparison should show costs before overhead, COGS, retail, commissions/fees, and profit separately. Never test by saving over customer proposals.

A simple layout contract:

    Franchise / Model / Tier / Revision       Search settings
    Grouped navigation | Wide working area   [Details when selected]
    Draft: N changes   Validation: N issues   Save Draft / Review & Publish

## Engineering foundation

1. Extract a typed settings/catalog registry from the monolith. Each field needs stable identity, storage path, label, description, unit, bounds, default source, applicability, tier policy, dependency metadata, and calculation consumer.
2. Build reusable editors around this registry, retaining specialized package/rule forms where warranted.
3. Create an editor session with baseline revision, draft, validation issues, computed diff, and undoable operations. Do not use the active runtime pricing store as the editor transaction.
4. Pass snapshots explicitly into scenario calculation; isolate legacy global reads through controlled adapters until they can be removed safely.
5. Separate repository operations: load model, save draft, publish revision with expected baseline, activate, archive, and compare. Require clear success/failure results.
6. Move catalog references toward immutable IDs. Preserve old references through compatibility mappings; validate packages and tier overrides during migration.
7. Retain immutable pricing revisions, owner-controlled proposal upgrades, signed-contract immutability, and franchise-specific settings. A layout migration must not create new pricing values by accident.

PricingDataModal.tsx is roughly 5,400 lines with schema, rendering, mutation, model actions, package composition, history, and tooltip code together; its stylesheet exceeds 2,100 lines. The issue is mixed responsibility, not simply file length. Splitting files without defining these contracts would reproduce the same problems in more places.

## Delivery sequence and acceptance gates

Phase 1 — Specification and parity baseline. Build the full field registry, settle category placement and units, identify real consumer paths, approve newly configurable policies, and assemble representative isolated scenarios. Capture existing totals before changing presentation.

Phase 2 — Editing/publication foundation. Implement isolated drafts, validation, unsaved-change protection, real read-only state, and stale-revision conflict detection. Add dependable failure states. These are prerequisites for efficient bulk editing.

Phase 3 — Workspace and editors. Deliver navigation/search/context, then convert rate tables, catalogs, packages, defaults, and contract schedules section by section. Test representative dense and sparse categories at 1280x800 and larger sizes, keyboard-only, and zoomed layouts.

Phase 4 — Impact review and approved controls. Add canonical-engine comparison, dependency diffs, publication notes, and selected newly exposed parameters. Preserve legacy defaults for historical revisions; do not silently backfill current values into old snapshots.

Phase 5 — Staging and controlled rollout. Compare old/new results across Normal/Bronze, franchise exceptions, gunite/fiberglass/spa-only, package/custom equipment, On/Off-Contract, conditional adjustments, and historical proposals. Exercise real Electron persistence only with isolated application data. Publish/release only after explicit authorization.

Acceptance criteria:

- Finding a named setting does not require prior knowledge of its category.
- Every editable financial number has an explicit unit and effect description.
- Reverting to baseline clears dirty status; navigation cannot silently lose work.
- No draft affects unrelated runtime calculations or persisted customer proposals.
- Invalid denominators, broken references, nonfinite results, and invalid schedules block publication.
- A stale admin session cannot overwrite newer settings without a conflict decision.
- Every direct and automatic dependent change appears in review.
- Current calculations remain identical until an explicitly approved policy change.
- Historical and signed proposal behavior remains intact.
- Existing tests plus targeted editor tests pass; production rollout is a separate action.

## Decisions to settle before implementation

- Should unpublished drafts be personal/local or shared between administrators?
- Should publishing be available to every pricing admin, or require an owner review?
- Is the COGS-to-retail ratio the preferred control, or should the UI offer an equivalent pre-fee margin view?
- Which fixed allowances are true franchise business policy versus protected calculation rules?
- Should financial policy apply per model or per franchise, particularly admin fees and contract milestones?
- Should labels be shared business configuration or personal display preferences?
- Is bulk spreadsheet import/export needed in the first release? It should include validation and preview, not raw replacement.

These decisions do not block the review. They define the scope of implementation and should be resolved against concrete screens and examples before code changes begin.
