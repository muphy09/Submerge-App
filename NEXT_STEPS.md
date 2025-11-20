# Next Steps for PPAS Implementation

## Current Status ✅
- **Phase 1 (Foundation)**: COMPLETE
- **Phase 2 (UI Components)**: COMPLETE
- **Phase 3 (Integration)**: READY TO START

## What's Been Built

### Calculation Engine
All pricing logic from Excel spreadsheet implemented:
- Auto-calculations (gallons, spa perimeter, RBB totals)
- Overrun charges (plumbing >33ft, electrical >100ft)
- Material tier pricing (Level 1/2/3)
- Equipment add-ons and zones
- Fiberglass PAP discount (10%)
- Cross-section dependencies

### UI Components (All 10 Sections)
1. `PoolSpecsSectionNew.tsx` - Pool/spa specs with auto-gallons
2. `ExcavationSectionNew.tsx` - RBB levels, columns, site work
3. `PlumbingSectionNew.tsx` - Runs with overrun warnings
4. `ElectricalSectionNew.tsx` - Electrical runs with cost preview
5. `TileCopingDeckingSectionNew.tsx` - 3-tier tile system
6. `DrainageSectionNew.tsx` - 4 drainage types
7. `EquipmentSectionNew.tsx` - Full configurator (pumps, filters, etc.)
8. `WaterFeaturesSectionNew.tsx` - Jets, bubblers, wok pots, infinity edge
9. `InteriorFinishSectionNew.tsx` - 9 finish types with auto area
10. `CustomFeaturesSectionNew.tsx` - Up to 7 custom items

## Immediate Next Steps

### 1. Create Cost Breakdown View Component
**File**: `src/components/CostBreakdownView.tsx`

**Purpose**: Display detailed cost breakdown matching Excel's "COST - NEW" sheet

**What it needs**:
```typescript
interface Props {
  costBreakdown: CostBreakdown;
}
```

**Features**:
- Collapsible sections by category
- Line-item details (description, qty, unit price, total)
- Category subtotals
- Grand total
- Export to PDF button
- Professional formatting

**Reference**: Look at Excel's "COST - NEW" and "SUMMARY - NEW" sheets for layout

### 2. Create Integrated Proposal Form
**File**: `src/pages/ProposalFormNew.tsx`

**Key Changes from Old Form**:
- Use new type `Proposal` from `proposal-new.ts`
- Import all 10 new section components
- Call `MasterPricingEngine.calculateCompleteProposal()` on save
- Show live cost preview in sidebar
- Add cost breakdown modal/tab

**Pattern**:
```typescript
import { getDefaultProposal } from '../utils/proposalDefaults';
import MasterPricingEngine from '../services/masterPricingEngine';

const [proposal, setProposal] = useState(getDefaultProposal());

// On save:
const result = MasterPricingEngine.calculateCompleteProposal(proposal);
const finalProposal = {
  ...proposal,
  costBreakdown: result.costBreakdown,
  subtotal: result.subtotal,
  totalCost: result.totalCost,
};
```

### 3. Update Database Service (if needed)
**File**: `src/services/database.ts`

The database already stores proposals as JSON blobs, so it should work with the new structure. Just verify the `saveProposal()` and `getProposal()` methods handle the larger data structure.

### 4. Create Validation Utilities
**File**: `src/utils/validation.ts`

**Business Rules to Validate**:
- Spa requires heater capable of spa heating
- If raised spa, facing must be selected
- Equipment: automation zones require automation system
- Plumbing: spa requires spa run > 0
- Material tier upgrades only for gunite pools
- Surface area matches pool dimensions
- All required fields filled before submit

### 5. Update ProposalView
**File**: `src/pages/ProposalView.tsx`

**Add**:
- Cost breakdown tab/section
- Detailed line items
- Category totals
- PDF export with breakdown

## File Organization

```
src/
├── types/
│   ├── proposal.ts          # OLD (keep for migration)
│   └── proposal-new.ts      # NEW (use this) ✅
├── services/
│   ├── pricingData.ts       # Pricing from Excel ✅
│   ├── pricingEngine.ts     # Core calculations ✅
│   ├── pricingEngineComplete.ts  # Extended calcs ✅
│   ├── masterPricingEngine.ts    # Integration ✅
│   └── database.ts          # DB service (verify)
├── utils/
│   ├── proposalDefaults.ts  # Defaults ✅
│   ├── validation.ts        # TODO: Create
│   └── financials.ts        # OLD (keep for migration)
├── components/
│   ├── *SectionNew.tsx      # All 10 sections ✅
│   ├── CostBreakdownView.tsx # TODO: Create
│   └── [old sections]       # Keep for migration
└── pages/
    ├── ProposalForm.tsx     # OLD (keep)
    ├── ProposalFormNew.tsx  # TODO: Create
    ├── ProposalView.tsx     # TODO: Update
    └── HomePage.tsx         # May need update
```

## Migration Strategy

### Phase 3A: Create New Form (Parallel)
1. Create `ProposalFormNew.tsx` alongside old form
2. Create `CostBreakdownView.tsx`
3. Test thoroughly with new proposals

### Phase 3B: Migration Path
1. Add "Use New Form" toggle in HomePage
2. Both forms save to same database (JSON structure)
3. Old form can still open old proposals
4. New form can open both old and new proposals (with migration)

### Phase 3C: Complete Switchover
1. When confident, make new form default
2. Remove old form components
3. Update all imports

## Testing Plan

### Unit Tests
- [ ] Pool gallons calculation matches Excel
- [ ] Spa perimeter calculation (round vs square)
- [ ] Overrun charges trigger correctly
- [ ] Material tier pricing matches
- [ ] Equipment add-ons calculate correctly

### Integration Tests
- [ ] Create new gunite pool proposal
- [ ] Create new fiberglass pool proposal
- [ ] Create proposal with spa
- [ ] Create proposal with all features
- [ ] Verify cost breakdown matches Excel

### Comparison Tests
Using "Regular pricing.xlsx" data:
- [ ] Input same values as Excel
- [ ] Compare calculated totals
- [ ] Verify all line items match
- [ ] Check category subtotals

## Quick Start for New Thread

If continuing in a new thread, provide:

```
I'm implementing Excel functionality into PPAS app.

Status from IMPLEMENTATION_STATUS.md:
- ✅ Phase 1: All calculation engines complete
- ✅ Phase 2: All 10 UI components built
- 🚧 Phase 3: Ready to integrate

Next tasks from NEXT_STEPS.md:
1. Create CostBreakdownView.tsx
2. Create ProposalFormNew.tsx
3. Add validation utilities
4. Update ProposalView
5. Test end-to-end

All foundation files are in place. Please start with creating the CostBreakdownView component.
```

## Key Files Reference

**Type Definitions**: `src/types/proposal-new.ts`
**Pricing Engine**: `src/services/masterPricingEngine.ts`
**Defaults**: `src/utils/proposalDefaults.ts`
**Components**: `src/components/*SectionNew.tsx`

## Common Patterns

### Auto-Calculation Pattern
```typescript
useEffect(() => {
  const calculated = CalculationModule.calculateValue(data);
  if (calculated !== data.field) {
    onChange({ ...data, field: calculated });
  }
}, [dependencies]);
```

### Cost Calculation Pattern
```typescript
const result = MasterPricingEngine.calculateCompleteProposal(proposal);
// result.costBreakdown has all line items
// result.subtotal, result.totalCost
```

### Section Component Pattern
```typescript
interface Props {
  data: SectionType;
  onChange: (data: SectionType) => void;
  // Optional context:
  hasSpa?: boolean;
  poolPerimeter?: number;
}
```

## Success Criteria

✅ All calculations match Excel spreadsheet
✅ Auto-calculations work in real-time
✅ Overrun warnings display correctly
✅ Cost breakdown shows all line items
✅ Can create and save complete proposal
✅ Can view detailed cost breakdown
✅ PDF export includes breakdown
✅ Validation prevents invalid data
✅ Works for gunite and fiberglass pools
✅ Handles all edge cases (no spa, no features, etc.)
