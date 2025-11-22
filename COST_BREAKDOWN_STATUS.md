# Cost Breakdown Implementation Status

## Overview
This document tracks the implementation of the Cost Breakdown feature to achieve 1:1 parity with the Excel "COST-NEW" tab.

---

## ✅ COMPLETED IMPLEMENTATIONS

### 1. UI/UX Restructuring
- **Cost Breakdown Button**: Added to top-left Proposal navigation tab
- **Category/Subcategory Structure**:
  - Shotcrete → Labor & Material subcategories
  - Tile → Labor & Material subcategories
  - Coping/Decking → Labor & Material subcategories
  - Stone/Rockwork → Labor & Material subcategories
- **Tax Display**: Shows total only (no quantity/unit price columns)
- **Responsive Modal**: Full-screen cost breakdown with collapsible categories

### 2. Calculation Fixes
- ✅ **Plans & Engineering**: Waterfall cost from water features ($15 each)
- ✅ **Plumbing**: Removed "Spa Plumbing" line item from COST-NEW (commented out)
- ✅ **Steel - Muck Out**: Fixed to $100 × 2 = $200
- ✅ **Equipment Set - Heater**: Fixed to $200 (not variable)
- ✅ **Equipment Set - Pool Bonding**: Fixed to $125 (was $300)
- ✅ **Equipment Tax**: Restructured as separate line item at bottom
- ✅ **Interior Finish**: Waterproofing already implemented (requires `hasWaterproofing` flag)

---

## ⚠️ PENDING IMPLEMENTATIONS

### Excel Formula Analysis Completed
The following formulas have been extracted from "Master Excel Pricing.xlsx" and need implementation:

### 3. Plumbing Calculations
**Current Issue**: Pipe quantities don't match Excel

**Excel Formulas (from PLUM sheet)**:
```
2.0" Pipe Qty = ROUNDUP((perimeter + mainDrainRun + cleanerRun + infloorCalc) × 1.25, 0)
  where infloorCalc = infloorValveToEQ + (infloorValveToPool × 6 × 1.15)

2.5" Pipe Qty = ROUNDUP(skimmerRun + spaPerimeter, 0)

Conduit Qty = ROUNDUP((electricRun + gasRun × 1.25), 0)
```

**Ashley Drennen Expected**:
- 2.0": 274 ft (app currently calculates ~380)
- 2.5": 74 ft (app currently calculates ~148)
- Conduit: 292 ft

### 4. Electrical Calculations
**Current Issue**: Multiple discrepancies

**Excel Formulas (from ELEC sheet)**:
```
Base: $1,650 × 1
Homerun (overrun): $18 × (electricRun - 65) if > 65 ft
Lights: $100 × (lightBondingCount - 1) if > 1  [Note: This is light RUN footage, not light count]
Heater (spa): $255 × hasSpa
Automation: $250 × hasAutomation
Bonding: $300 × 1
Outlet: $85 × 1
```

**Ashley Drennen Expected**:
- Homerun: 18 ft × $20 = $360 (not $18)
- Lights: 100 ft × $2 = $200 (formula shows $100 base rate, possibly doubled)

### 5. Shotcrete Labor
**Current Issue**: Should use two-tier pricing

**Excel Formula (from SHOT sheet)**:
```
Minimum Labor: $90 × 32 yards (always charged)
Additional Labor: $90 × (totalYards - 32) if totalYards > 32

Total Yardage = ROUNDUP(complex formula based on surface area, perimeter, spa, RBB, etc.)
```

**Ashley Drennen Expected**:
- Minimum Labor: $90 × 32 = $2,880
- Additional Labor: $90 × 15 = $1,350
- Total: 47 yards at $4,230 labor

### 6. Shotcrete Material & Tax
**Excel Formulas**:
```
Material = $228 × totalYards
Clean-Out = $125 × 1
Environ/Fuel = $25 × totalYards
Misc = $150 × 1 (but displays as $125 in some cases)

Tax depends on location:
  MECK County: 2.5% (0.025)
  NC: 4.75% (0.0475)

Material Tax = materialSubtotal × taxRate
```

### 7. Stone/Rockwork
**Needed Additions**:
- Bullnose Labor: $8 × 28 = $224 (Ashley Drennen)
- Panel Ledge Labor: $12.50 × 47 = $587.50
- Panel Ledge Material: $13 × 54.05 = $702.65
- Remove "Raised Spa Ledgestone Facing" if present in some calculations

### 8. Excavation Fine-Tuning
**Issues**:
- Gravel display shows qty 1 but calculates correctly (surfaceArea × $2.75)
- Dirt Haul formula needs verification

**Excel Formula (from EXC sheet)**:
```
Gravel: qty = 1, unit price = surfaceArea × 2.75, total = qty × unit price × surfaceArea
Dirt Haul: $18 × (hasGravelInstall × yardageRemoved)
  where yardageRemoved = complex calculation
```

### 9. Tile Calculations
**Needed**: Verification of material and labor rates match Excel exactly

---

## 📊 Test Case: Ashley Drennen Pool

### Excel COST-NEW Totals:
- EXCAVATION: $7,518.38
- PLUMBING: $7,328.00
- STEEL: $4,355.00
- ELECTRICAL: $3,100.00
- SHOTCRETE LABOR: $4,480.00
- SHOTCRETE MATERIAL: $13,021.22
- EQUIPMENT SET: $1,075.00

### Key Pool Specs:
- Perimeter: 93 ft
- Surface Area: 541 sqft
- Shallow Depth: 3.5 ft
- End Depth: 6 ft
- Has Spa: Yes (raised)
- Spa Perimeter: 28 ft

---

## 🔧 Implementation Priority

1. **HIGH**: Plumbing pipe calculations (biggest discrepancy)
2. **HIGH**: Electrical formulas
3. **HIGH**: Shotcrete two-tier labor
4. **MEDIUM**: Stone/Rockwork additions
5. **LOW**: Minor calculation alignments

---

## 🔗 Cross-Module Dependencies

Several calculations require data from other modules. These dependencies need to be addressed for complete 1:1 parity:

### 1. Plumbing → Electrical Data
**Issue**: Conduit calculation (in Plumbing) requires `electricalRun` from Electrical module

**Excel Reference**: PLUM!Row26
```
Conduit Qty = ROUNDUP(electricRun + (gasRun × 1.25), 0)
```

**Current Implementation**: ✅ Partially implemented - accesses `(poolSpecs as any).electricalRun`

**Required**: Ensure `electricalRun` is properly passed through proposal data structure

---

### 2. Electrical → Steel Data
**Issue**: Electrical lights calculation may reference steel bonding count

**Excel Reference**: ELEC!Row6
```
Lights: $100 × (lightBondingCount - 1) if > 1
```

**Current Status**: ⚠️ Needs investigation - unclear if this is light count or light run footage

**Required**: Verify exact formula and data source from Excel ELEC sheet

---

### 3. Plumbing → Pool Geometry
**Issue**: Pipe calculations need accurate perimeter, main drain run, cleaner run, and in-floor valve distances

**Excel Reference**: PLUM!Row18-20
```
2.0" Pipe = ROUNDUP((perimeter + mainDrainRun + cleanerRun + infloorCalc) × 1.25, 0)
  where infloorCalc = infloorValveToEQ + (infloorValveToPool × 6 × 1.15)

2.5" Pipe = ROUNDUP(skimmerRun + spaPerimeter, 0)
```

**Current Status**: ⚠️ Not fully implemented - pipe quantities don't match Excel

**Required**:
- Verify all input values are accurately calculated/available in proposal data
- Implement exact Excel formulas with proper rounding
- Add in-floor valve distance calculations if missing

---

### 4. Shotcrete → Tax Location
**Issue**: Shotcrete material tax rate depends on county location

**Excel Reference**: SHOT sheet tax calculation
```
Tax Rate:
  - MECK County: 2.5% (0.025)
  - NC (other): 4.75% (0.0475)
```

**Current Status**: ⚠️ Needs implementation

**Required**: Add location/county field to proposal data and apply correct tax rate

---

## 📝 Notes

- All Excel formula references documented in extraction scripts
- Python scripts created for ongoing testing:
  - `extract_formulas.py`: Extracts formulas from Master Excel
  - `extract_cost_new_details.py`: Detailed line item extraction
  - `extract_ashley_comparison.py`: Test case comparison

- Master Excel Pricing.xlsx contains all source formulas in individual sheets:
  - PLUM (Plumbing)
  - ELEC (Electrical)
  - STEEL (Steel)
  - SHOT (Shotcrete)
  - EXC (Excavation)
  - etc.

---

Last Updated: 2025-11-22
