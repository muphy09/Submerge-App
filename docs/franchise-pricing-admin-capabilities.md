# Franchise pricing: administrator capabilities

This supplements the October 28 editor review and supersedes the assumption in the first two mockups that the existing fields define the future product. This is a design proposal, not implemented functionality. No production changes are authorized by this document.

## Product objective

An administrator should be able to maintain a franchise's pricing catalog, cost structure, organization, and designer-facing choices without asking a developer to add another ordinary cost field. The interface should expose these capabilities consistently and explain their financial effects.

## Constraints verified in the current code

- `src/utils/equipmentCost.ts` enumerates basePrice and addCost1/2/3. It also performs name-based catalog matching and special percentage/overhead handling.
- `src/types/proposal-new.ts` repeats fixed additional-cost properties across equipment types.
- `src/utils/equipmentPackages.ts` explicitly copies known cost properties into equipment selections and finds catalog entries by name.
- `src/services/pricingDataStore.ts` enumerates fields that trigger package-cost propagation.
- `src/services/pricingRevisionReview.ts` enumerates catalog price fields for comparison.
- `src/utils/waterFeatureCost.ts` separately sums the same fixed cost fields. It infers some behavior from normalized category/name strings, including gas requirements.
- `src/services/pricingFieldLabels.ts` saves label overrides by franchise in localStorage, outside revision publication.
- `src/components/PricingDataModal.tsx` defines category/group organization and field lists in code.

Consequently, another visible column alone is insufficient. Dynamic costs must reach calculations, proposal selections, package dependency updates, revision comparisons, and historical snapshots. Editable organization must not accidentally alter functional classification.

The existing manufacturer-transition assessment in docs/Notes identified related catalog/import/schema needs. It is useful background, not evidence that those capabilities currently exist. This proposal also avoids adopting its suggested cross-franchise inheritance without an explicit business decision.

## Core administrator jobs and acceptance examples

| Job | Required capability | Concrete acceptance example |
|---|---|---|
| Add a new expense | Add named cost components with no fixed two/three-slot limit | Add Freight to Pumps, set different amounts by pump, see the total and affected packages change |
| Price a one-off item | Item-specific cost components | Add Special adapter to one pump without forcing a populated field on every other pump |
| Maintain a product family | Reusable cost-component definitions | New heaters inherit the family's chosen cost columns and units |
| Organize the catalog | Create, rename, reorder, move, archive categories/subcategories | Move an item between admin groups while preserving package links and pricing behavior |
| Understand total cost | Transparent cost composition | View base, additional costs, overhead, tax, and effective cost with calculation order explained |
| Update a vendor price sheet | Import, map, validate, preview, apply to draft | Match products by stable ID/SKU, identify duplicates and missing values, then review changes |
| Change many values | Bulk operations scoped to a cost component | Increase supplier cost by 4% for selected pumps without raising freight or installation |
| Replace discontinued equipment | Retire, duplicate, substitute, inspect usage | Retire a pump for new proposals; identify packages requiring a replacement; keep historical proposals readable |
| Control designer choices | Availability, default choice, labels, compatibility | Hide an item from new selection while preserving old selections and define its valid proposal types |
| Explain a change | Before/after and dependency review | Review directly edited items separately from automatically recalculated package costs |

## Dynamic cost components

The data concept is a collection of named cost components, not additional numbered properties. A component definition has stable identity, label, scope, unit, and calculation behavior; each item supplies its value or an explicit not-applicable state. A component may be shared by a family or unique to an item.

The administrator adds a component through Add cost column. They select an existing definition or create a new one, give it a meaningful name, choose its scope, and choose supported calculation behavior. Show its contribution immediately. Do not imply that displaying a column applies that charge to every item.

For the first implementation, support fixed amounts per item and explicitly defined percentage adjustments. Percentages require a named basis: base price only, selected components, or a defined subtotal. Arbitrary formulas, circular dependencies, and spreadsheet-style references should not be the default editing model. Per-project freight is a different rule from per-unit freight and must not be multiplied by equipment quantity unintentionally.

Costs and metadata are separate column types. Manufacturer, SKU, supplier, internal notes, and last price update are useful but do not participate in pricing. A calculated total is read-only. Hiding a column does not remove its costs. Deleting a cost definition requires a preview of its usage and financial impact; archive where history references it.

Tax and overhead applicability should be represented explicitly, but introducing component-level treatment is a pricing behavior change. Migration must preserve the current order and eligibility first; new rules require approved definitions. Do not label the existing percentIncrease field as ordinary markup: its current implementation divides by a percentage.

## Organization and navigation

Separate three concepts:

1. Admin organization: editable categories, subcategories, ordering, labels, and saved views.
2. Functional product type: pump, filter, heater, automation, etc., used for compatibility and proposal behavior.
3. Cost reporting category: the category receiving the calculated cost.

Moving or renaming an admin group should change the first concept only. Changing functional type or reporting destination should be an explicit operation with dependency review. Existing name-based rules should be replaced by stable IDs and explicit capabilities before broad free-form renaming is enabled.

Suggested starting equipment families: Circulation (pumps and auxiliary pumps), Filtration, Cleaning, Heating & Cooling, Lighting, Automation, Sanitation, and Water Supply. These are proposed defaults administrators can organize further, not another permanent hardcoded hierarchy.

Inside Equipment, show a compact family navigator and the selected family's table. Allow grouping by manufacturer or supplier, filtering by availability or package usage, and saved column views. Do not combine all equipment into one long form or make every family use identical fields.

## Consistent interaction model

All catalog editors share: Add item, Duplicate, Add cost column, Manage columns, Organize groups, bulk selection, Undo, draft status, and Review changes. Core actions occupy the same location throughout the editor.

The main table supports routine edits and comparisons. Expanded item details hold uncommon specifications, compatibility, documentation, and item-specific costs. The administrator should not need to open a different panel for every cell change.

Common columns remain fixed or easy to find: item name, effective cost, availability, and modification state. Cost-component columns can be shown, hidden, resized, and reordered. Wide catalogs need pinned name/total columns and deliberate horizontal scrolling; adding more fields must not shrink everything into unreadable cells. Personal display preferences should be distinct from shared financial configuration.

Consistency means common behavior, spacing, units, and actions. Excavation ranges, equipment component sums, labor/material matrices, and payment schedules still need different table structures suited to their work.

## Further capabilities to evaluate

- Price-source metadata, supplier quote references, effective dates, and stale-price reminders.
- Import/export templates that preserve stable identity and distinguish blank, zero, unchanged, and not applicable.
- Bulk changes by amount or percentage, with rounding and clearly scoped target fields.
- Reusable item/category templates and duplication across models within the authorized franchise.
- Normal/Bronze comparison and explicit inheritance, overrides, and locked rules.
- Package composition showing included quantities, upgrades, fixed-price versus calculated-price behavior, and dependent cost changes.
- Related-cost inspection: equipment purchase, installation, plumbing, electrical, startup, and optional accessories, avoiding duplicate charging.
- Availability states such as active, temporarily unavailable, and retired; substitution is an explicit choice.
- Editable explanatory help and internal notes, with separate designer-visible naming.
- Conflict detection, undoable drafts, publication notes, and restore-as-new-revision.

These are proposed requirements to prioritize, not claims that every one belongs in the first release. Scheduling, two-person approvals, and corporate inheritance should remain optional until the operating workflow warrants them.

## Implementation foundation

Use stable identities for items, groups, cost definitions, and package references. Version the cost schema. Put the new dynamic-cost resolver behind the existing calculation interface, preserving construction formulas. Update package materialization, dependency propagation, proposal snapshots, and revision comparison to consume the same resolved components.

Keep compatibility readers for historical basePrice/addCost fields and their calculation semantics. Do not calculate both legacy adders and migrated components. A rename must preserve identity; reordering must preserve tier overrides. Older clients must not silently ignore newly introduced cost components: enforce a compatible client/schema version before publishing such a model.

Local source currently includes unrelated uncommitted collaboration/equipment work. This review did not alter those changes. Implementation planning must integrate with the eventual branch state rather than treating the earlier audit commit as permanently current.

## Next design gate

The next prototype should prove these end-to-end tasks before further visual polish:

1. Create a named additional cost for a product family; enter values for multiple products.
2. Add an item-only cost; show it in the item's composition and optionally as a table column.
3. Rename/reorder a group and move an item while preserving functional type and package references.
4. Duplicate an item, configure availability, and choose a designer-facing label.
5. Apply a bulk supplier-price increase and inspect affected packages.
6. Review the complete draft, including structural changes, and compare representative pricing.

The prototype must use realistic labels and expose these controls. It should not imply approval of financial rules merely by displaying them. No production or application implementation should follow until this capability direction and its concrete workflow are accepted.
