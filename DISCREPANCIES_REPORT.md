# Pool Proposal App vs Excel Discrepancy Report

## Executive Summary

**Excel Retail Price:** $144,150.00
**App Grand Total:** $75,340.96
**Difference:** $68,809.04 (91.5% higher in Excel!)

---

## Critical Issue #1: COPING/DECKING CALCULATIONS

### Excel Values:
- **Coping Labor:** $1,956.00 (Travertine Coping: 163 LNFT × $12)
- **Decking Labor:** $7,282.80 (Travertine Decking: 910.35 SQFT × $8)
- **Coping Material:** $1,793.00 (Travertine Coping: 163 LNFT × $11)
- **Decking Material:** $6,827.63 (Travertine Decking: 910.35 SQFT × $7.50)
- **Drainage:** $1,087.50
- **Coping/Decking Subtotal (before tax):** $17,159.43
- **Material Tax (7.25%):** $624.49
- **Total:** $19,571.92

### App Values:
- **Coping Labor:** $1,956.00 ✓
- **Decking Labor:** MISSING! Should be $7,282.80
- **Coping Material:** ~$189.00 ❌ Should be $1,793.00
- **Decking Material:** MISSING! Should be $6,827.63
- **Drainage:** $1,087.50 ✓
- **Total:** $3,232.50

### Root Cause:
The app is NOT calculating decking area correctly. Excel formula:
```
Decking Area = 'NEW POOL'!E9 * 1.05 * ('NEW POOL'!B91 + 'NEW POOL'!B94)
Decking Area = 867 * 1.05 * (1 + 0) = 910.35 SQFT
```

The app appears to be using a much smaller decking area or not applying the decking calculations at all.

**Missing Cost:** $16,339.42

---

## Critical Issue #2: SHOTCRETE CALCULATIONS

### Excel Values:
- **Labor Total:** $4,480.00
  - Minimum Labor: $2,880.00 (32 hours × $90)
  - Additional Labor: $1,350.00 (15 hours × $90)
  - Spa: $250.00
- **Material Total:** $13,021.22
  - Material: $10,716.00 (47 CY × $228)
  - Clean-Out: $125.00
  - Environ/Fuel: $1,175.00 (47 CY × $25)
  - Miscellaneous: $125.00
  - Sales Tax (NC 4.75%): $576.70
- **Shotcrete Total:** $17,501.22

### App Values:
- **Shotcrete Labor:** $3,350.00 ❌ Should be $4,480.00
- **Shotcrete Material:** $9,520.58 ❌ Should be $13,021.22

**Missing Cost:** $4,630.64

### Root Cause:
1. Labor hours calculation may be incorrect
2. Material tax not properly applied (should be 4.75% for NC based on Excel formula)
3. Missing environmental/fuel surcharge calculation

---

## Critical Issue #3: CUSTOM FEATURES

### Excel Values:
- **16x16:** $736.56
- **Turf and travertine in lay:** $6,240.00
- **Custom Feature Total:** $6,976.56

### App Values:
- **NOT SHOWN IN SCREENSHOT!**

**Missing Cost:** $6,976.56

### Root Cause:
Custom features are not being displayed in the cost breakdown or not being calculated at all.

---

## Critical Issue #4: INTERIOR FINISH

### Excel Values:
- **Interior Finish Total:** $11,548.73

### App Values:
- **Interior Finish:** $9,293.56

**Missing Cost:** $2,255.17

### Possible Causes:
- Waterproofing calculations
- Fittings calculations
- Material adjustments

---

## Critical Issue #5: RETAIL PRICE CALCULATION ⚠️ MOST CRITICAL ⚠️

### Excel Formula (NEW POOL!C191):
```
RETAIL PRICE = CEILING(COGS / TARGET_MARGIN, 10) + G3_COST + DISCOUNTS
```

**Detailed Breakdown:**
```
NEW POOL C181 = CEILING('COST - NEW'!D344 / 'COST - NEW'!E344, 10) + 'COST - NEW'!E309
              = CEILING($105,628.67 / 0.70, 10) + $1,250
              = CEILING($150,898.10, 10) + $1,250
              = $150,900 + $1,250
              = $152,150

NEW POOL C183 = -$8,000 (discount)

NEW POOL C191 = SUM(C181:D190) = $152,150 - $8,000 = $144,150
```

### Key Formula Components:
1. **TOTAL COGS** ('COST - NEW'!D344): $105,628.67
   - This is `(sum of all costs) × 1.01` (1% overhead)

2. **TARGET MARGIN** ('COST - NEW'!E344): 70.0%
   - This means COGS should be 70% of retail price
   - Therefore: `Retail Price = COGS / 0.70`
   - This gives a **30% gross profit margin**

3. **G3 UPGRADE** ('COST - NEW'!E309): $1,250 if selected, $0 otherwise
   - Additional retail price for Crystite G3 finish upgrade
   - In Ashley Drennan's case: Added $1,250

4. **CEILING(..., 10)**: Rounds up to nearest $10

5. **DISCOUNTS** (NEW POOL C183): -$8,000
   - Manual discount applied to this specific proposal

### Actual Excel Calculation Flow:
1. **Sum all section costs:** $104,582.85
2. **Apply 1% overhead:** × 1.01 = **$105,628.67** (TOTAL COGS)
3. **Calculate base retail:** $105,628.67 / 0.70 = $150,898.10
4. **Round to nearest $10:** CEILING(..., 10) = $150,900
5. **Add G3 upgrade cost:** $150,900 + $1,250 = $152,150
6. **Apply discount:** $152,150 - $8,000 = **$144,150** (RETAIL PRICE)

### Commissions & Fees (shown in COST - NEW sheet):
After calculating retail price, the Excel shows profitability:
- **RETAIL PRICE:** $144,150.00
- **TOTAL COGS:** $(105,628.67)
- **Dig Commission:** $(3,964.13) [2.75% of retail]
- **Admin Fee:** $(4,180.35) [2.9% of retail]
- **Closeout Commission:** $(3,964.13) [2.75% of retail]
- **NET PROFIT:** $26,412.73 (18.3% of retail)

### App Calculation:
The app is ONLY summing costs with NO markup:
- ❌ No 1.01 overhead multiplier
- ❌ No 70% target margin calculation (÷ 0.70)
- ❌ No retail price markup
- ❌ No G3 upgrade pricing
- ❌ No discount field
- ❌ No commission/fee calculations
- ❌ Shows $75,340.96 (incomplete sum of costs)
- ✅ Should show $144,150.00 (retail price)

**This is the BIGGEST issue - the app is showing INCOMPLETE COST instead of RETAIL PRICE!**
**Even if we just fix the cost calculations, the app would show ~$105,629 COGS, but the user NEEDS to see the $144,150 retail price!**

---

## Minor Discrepancies

### Plans & Engineering
- Excel: $505.00 (includes $15 for waterfall)
- App: $490.00
- **Difference:** $15.00

### Excavation
- Excel: $7,518.38
- App: $8,113.00
- **Difference:** -$594.62 (app is HIGHER)

### Steel
- Excel: $4,355.00
- App: $4,155.00
- **Difference:** $200.00

### Electrical
- Excel: $3,100.00
- App: $2,832.18
- **Difference:** $267.82

### Equipment Ordered
- Excel: $13,855.04 (includes 7.2% tax)
- App: $12,841.01
- **Difference:** $1,014.03

### Equipment Set
- Excel: $1,075.00
- App: $850.00
- **Difference:** $225.00

---

## Summary of All Missing Costs

| Category | Excel | App | Missing |
|----------|-------|-----|---------|
| Coping/Decking | $19,571.92 | $3,232.50 | $16,339.42 |
| Shotcrete | $17,501.22 | $12,870.58 | $4,630.64 |
| Custom Features | $6,976.56 | $0.00 | $6,976.56 |
| Interior Finish | $11,548.73 | $9,293.56 | $2,255.17 |
| Equipment | $13,855.04 | $12,841.01 | $1,014.03 |
| Other Minor | Multiple | Multiple | ~$1,500 |
| **Subtotal (COGS)** | **$105,628.67** | **$75,340.96** | **$30,287.71** |
| **RETAIL MARKUP** | **$38,521.33** | **$0.00** | **$38,521.33** |
| **TOTAL** | **$144,150.00** | **$75,340.96** | **$68,809.04** |

---

## Required Fixes (Priority Order)

### 1. Fix Coping/Decking Calculations (CRITICAL)
- Correctly calculate decking area: `deckingArea * 1.05` (5% waste factor)
- Ensure decking labor is calculated
- Ensure decking material is calculated
- Apply material tax (7.25%)

### 2. Add Custom Features Display (CRITICAL)
- Custom features exist in the data but aren't shown
- Need to add to cost breakdown display
- Total: $6,976.56 missing

### 3. Fix Shotcrete Calculations (HIGH)
- Fix labor hour calculations
- Add environmental/fuel surcharge ($25 per CY)
- Apply correct sales tax (NC: 4.75%, MECK: 2.5%)

### 4. Implement Retail Price Calculation (CRITICAL)
- Add 1.01 multiplier to TOTAL COGS
- Implement markup formula from NEW POOL!C191
- Add commission and fee calculations
- Display RETAIL PRICE instead of just cost sum

### 5. Fix Minor Calculation Errors (MEDIUM)
- Interior finish waterproofing
- Equipment tax (7.2%)
- Plans & engineering waterfall fee
- Equipment set pricing

---

## Next Steps

1. Extract the NEW POOL!C191 formula to understand retail price markup
2. Review all material tax applications
3. Review all waste factor multipliers (1.05, 1.1, etc.)
4. Implement missing calculations
5. Add UI elements for all cost categories
6. Validate against Excel with multiple proposals
