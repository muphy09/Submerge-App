# Manufacturer Transition Assessment (Pricing + Options Flexibility)

## Why this matters
A franchise that changes equipment manufacturers needs to quickly update:
- Option catalogs shown to designers (equipment names/models and “included vs upgrade” choices).
- Price logic tied to those options (base, adders, tax, overhead, labor/material impacts).
- Governance controls (who can update, preview, activate, and roll back model changes).

## Current state in the app

### 1) There is already a franchise-scoped pricing model system
- The app supports multiple **pricing models per franchise** with create/save/delete and active model selection.
- Admin users can open a dedicated **Admin Pricing Model Editor** and set a model as active.
- Proposal data stores `pricingModelId`/`pricingModelName`, so historical proposals can remain tied to the model they were built with.

**Implication:** This is a strong foundation for manufacturer transitions because the business can clone current pricing into a “new manufacturer” model, adjust, then activate.

### 2) Option catalogs are centrally sourced from `pricingData`
- Major UI sections (Equipment, Plumbing, Electrical, Water Features, Pool Specs, etc.) build their selectable options from `pricingData`.
- The pricing engines also read from `pricingData`.

**Implication:** Changing one catalog in pricing data can flow through both the UI and calculations, which is good.

### 3) The pricing editor is broad but still config-driven by code
- The Admin Pricing editor exposes many scalar/list fields and supports add/remove for list items.
- But field definitions are embedded in the React component rather than schema-driven from the backend.

**Implication:** Day-to-day value updates are easy, but adding brand-new configurable dimensions still requires code changes.

### 4) There are documented gaps where some admin-visible fields are not wired to calculations
- Existing internal docs already call out several values shown in admin that are not currently consumed by engines in all cases.

**Implication:** During a manufacturer switch, admins might update values that appear editable but do not actually affect proposal totals. This creates risk and trust issues.

### 5) Availability and permissions are mostly admin-oriented
- Admin/owner users have access to pricing management tooling.
- Franchise-level segregation exists (models load by franchise).

**Implication:** Access control is generally appropriate, but change governance (approval workflow, audit comparisons, staged rollout) appears limited.

## Overall assessment
The app is **better than average today** for a manufacturer transition because it already has:
- Franchise-scoped pricing models,
- Active model switching,
- UI catalogs and pricing logic fed from shared pricing data,
- Proposal-level model linkage for traceability.

The main improvement area is **operational safety + scalability** of change management rather than missing basic capability.

## Recommended improvements (prioritized)

### Priority 1 — Close accuracy/trust gaps before transition
1. **Add a “wiring coverage” check**
   - Build a validation utility that asserts every editable admin field is either:
     - consumed by at least one calculation path, or
     - explicitly marked “metadata-only / UI-only.”
   - Surface this report in CI and in an admin diagnostics panel.

2. **Add model diff preview before activation**
   - Show side-by-side old vs new model differences (prices, added/removed options, tax rates).
   - Include impact simulation on a sample proposal set (e.g., average delta, max delta).

3. **Add activation guardrails**
   - Require confirmation steps ("X options changed, Y major cost drivers changed").
   - Optional two-person approval for “Set as Active” in production franchises.

### Priority 2 — Make manufacturer swaps faster for non-developers
4. **Introduce manufacturer profiles within a pricing model**
   - Add first-class concept: `manufacturerProfile` (e.g., Pentair, Jandy, Hayward).
   - Map equipment option groups by profile and allow quick profile clone/import.

5. **CSV/Excel import template for equipment catalogs**
   - Admin uploads a standardized sheet of equipment options + prices.
   - Backend validates IDs, duplicates, required fields, and incompatible combinations.
   - Import results show created/updated/deprecated items before publish.

6. **Deprecation flags instead of hard removal**
   - Mark retired manufacturer items as unavailable for new proposals but preserved for old proposals.
   - Keep historical rendering intact for archived proposals/contracts.

### Priority 3 — Future-proof architecture
7. **Move editor config to backend schema metadata**
   - Convert hardcoded field/list definitions into server-delivered schema (with labels, types, tooltips, constraints).
   - Lets product/admin teams expand configurable areas without redeploying desktop code.

8. **Versioned pricing contracts + migration layer**
   - Maintain explicit schema versions and migration scripts for pricing JSON.
   - Validate model payloads on save/load with clear error surfacing.

9. **Policy engine for franchise overrides**
   - Support inheritance: corporate default -> region -> franchise override.
   - Track effective values and override source for each field.

## Practical rollout plan (30/60/90)

### Next 30 days
- Implement wiring coverage audit.
- Add model diff UI + activation confirmation.
- Prepare and test a manufacturer import template (pilot with one franchise).

### 60 days
- Add deprecation lifecycle and proposal compatibility guarantees.
- Add simulation report for sample proposal impact during activation.

### 90 days
- Start migrating editor definitions to backend schema metadata.
- Introduce hierarchical override policy where needed.

## Success criteria
- Time to deploy manufacturer price list update reduced to < 1 business day.
- Zero “edited but not applied” admin fields in production.
- 100% of activated models have diff + impact report attached.
- No historical proposal rendering regressions after option deprecations.
