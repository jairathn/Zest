# Real-World Data Integration Guide

## Overview

This document explains how the application handles real-world eligibility and claims data, what data is available, what's missing, and production considerations.

## Data Structure

### Eligibility Data Format
**Exact Column Names from Test Data:**
```
First Name
Last Name
Date of Birth
Personal Street Address
Personal Address City
State
Pharmacy Insurance ID
Employer
Personal Email
Mobile Phone
Eligibility Start Date
Eligibility End Date
Cost Designation
Benchmark Cost
```

**Key Fields:**
- **Pharmacy Insurance ID**: Primary linking field between eligibility and claims
- **Cost Designation**:
  - `Low Cost` = Not currently on a biologic
  - `High Cost` = Currently on a biologic
- **Benchmark Cost**: The baseline cost we're measured against for success (need to reduce total cost below this over the partnership term)
- **Employer**: Used to infer insurance plan (e.g., "API Heat Transfer" → "Aetna December 2024")

### Claims Data Format
**Exact Column Names from Test Data:**
```
Pharmacy Insurance ID
Fill Date
NDC
Cost (Member Paid)
Cost (Plan Paid)
Cost (True Drug Cost)
Diagnosis Code
```

**Key Fields:**
- **Pharmacy Insurance ID**: Links to eligibility data
- **NDC**: Drug identifier (converted to drug name via NDC mapping table)
- **Cost (Member Paid)**: Member's out-of-pocket liability
- **Cost (Plan Paid)**: Gross amount plan paid
- **Cost (True Drug Cost)**: Net-of-rebate actual cost (most accurate for ROI calculations)
- **Diagnosis Code**: ICD-10 code (e.g., L40.0 for psoriasis, L20.9 for atopic dermatitis)

## NDC to Drug Name Conversion

The application includes a comprehensive NDC mapping file at `/lib/ndc-mappings.ts` that covers:
- All major psoriasis biologics (Humira, Cosentyx, Skyrizi, Taltz, Tremfya, Stelara, etc.)
- Atopic dermatitis biologics (Dupixent, Adbry)
- JAK inhibitors (Rinvoq, Cibinqo)
- **All biosimilars** (Amjevita, Cyltezo, Hadlima, Hyrimoz, Hulio, Yuflyma, Yusimry, Erelzi, Eticovo, Wezlana)

### Seeding NDC Mappings

On first deployment, run:
```bash
npx tsx scripts/seed-ndc-mappings.ts
```

This populates the `NdcMapping` table with ~200+ NDC codes for biologics.

### Auto-Conversion in Claims Upload

When uploading claims with NDC codes but no drug names, the system:
1. Looks up the NDC in the `NdcMapping` table
2. If found, automatically populates `drugName` field
3. Preserves original NDC code for reference

## Employer-to-Plan Mapping

**Current Implementation (Placeholder):**
```typescript
// In app/api/upload/route.ts
const employerToPlanMapping = {
  'API Heat Transfer': 'Aetna December 2024',
  // Add more mappings as needed
};
```

**How It Works:**
1. When eligibility data has no `Plan Name` but has `Employer`
2. System looks up employer in mapping
3. Auto-assigns the mapped plan to the patient

**Production Enhancement:**
Consider creating an `EmployerPlanMapping` table for configurability:
```sql
CREATE TABLE EmployerPlanMapping (
  employer TEXT,
  planId TEXT,
  effectiveDate DATE,
  terminationDate DATE
);
```

## What Data We Have vs. What We Need

### ✅ Data We HAVE
| Field | Source | Use Case |
|-------|--------|----------|
| Pharmacy Insurance ID | Eligibility | Primary patient identifier |
| Cost Designation | Eligibility | HIGH_COST (on biologic) / LOW_COST (not on biologic) |
| Benchmark Cost | Eligibility | Success metric - need to reduce cost below this |
| Member Liability (OOP) | Claims | Out-of-pocket costs (wallet friction indicator) |
| True Drug Cost | Claims | Net-of-rebate actual cost (ROI calculations) |
| Plan Paid | Claims | Gross cost before rebates |
| Diagnosis Codes | Claims | Clinical context (L40.x = psoriasis, L20.x = AD) |
| Fill Date | Claims | Adherence and utilization patterns |
| Address/Geography | Eligibility | Regional analysis of program success |
| Employer | Eligibility | Group/plan inference |
| Eligibility Dates | Eligibility | Active coverage tracking |

### ❌ Data We're MISSING (for Ideal Functionality)

#### 1. **Plan-Level Details**
**Missing:**
- Plan type (HDHP, PPO, HMO, etc.)
- Annual deductible amount
- Out-of-pocket maximum
- Coinsurance percentage
- Current deductible accumulation

**Impact:**
- Cannot definitively identify HDHP members for targeting
- Cannot predict member liability beyond raw OOP amounts
- Cannot calculate if member has met deductible

**Workaround:**
- Use January high OOP costs as proxy for HDHP/deductible reset
- Use `Cost (Member Paid)` as indicator of wallet friction
- Track patterns: if OOP consistently high = likely HDHP

**Example Query for HDHP Proxy:**
```sql
SELECT p.*, SUM(c.outOfPocket) as jan_oop
FROM Patient p
JOIN PharmacyClaim c ON c.patientId = p.id
WHERE EXTRACT(MONTH FROM c.fillDate) = 1
  AND p.costDesignation = 'HIGH_COST'
GROUP BY p.id
HAVING SUM(c.outOfPocket) > 1000  -- High Jan OOP = likely HDHP
```

#### 2. **Formulary Details by Patient Plan**
**Missing:**
- Patient-specific formulary tier for each drug
- Patient-specific PA requirements
- Patient-specific step therapy status
- Actual member copay amounts by tier

**Impact:**
- Cannot show patient-specific cost comparison
- Must use generic formulary data

**Workaround:**
- Link employer to plan to formulary (API Heat Transfer → Aetna Dec 2024 → formulary drugs)
- Use generic tier/PA info from formulary uploads
- Calculate estimated costs, not guaranteed costs

#### 3. **Prior Authorization Status**
**Missing:**
- Current PA approvals
- PA rejection history
- PA expiration dates

**Impact:**
- Cannot identify if recommended drug has existing PA
- Cannot show historical PA struggles

**Workaround:**
- Assume no PA unless documented in notes/contraindications
- Track recommendations requiring PA separately

#### 4. **Claims Rejection Data**
**Missing:**
- Denied claims
- Rejection reasons
- Appeal status

**Impact:**
- Missing signal for formulary non-compliance
- Cannot identify coverage issues

**Workaround:**
- Only seeing successful fills (claim = dispensed)
- Assume compliance if drug is being filled

#### 5. **Pharmacy Type**
**Missing:**
- Retail vs. specialty pharmacy
- Mail order vs. in-person

**Impact:**
- Cannot analyze channel preference/optimization

#### 6. **Days Supply / Quantity**
**Status:** OPTIONAL in real data

**Impact:**
- Cannot calculate precise adherence (PDC, MPR)
- Cannot identify early refills or gaps

**Workaround:**
- Use fill frequency as proxy
- Assume standard dosing intervals by drug

## Understanding Cost Designations

### Cost Designation Logic

```typescript
// From eligibility data:
costDesignation: 'High Cost' | 'Low Cost'

// Mapped to enum:
CostDesignation: 'HIGH_COST' | 'LOW_COST'
```

**What It Means:**
- **HIGH_COST**: Patient is currently on a biologic therapy (expensive)
- **LOW_COST**: Patient is NOT on a biologic (lower cost care)

**NOT THE SAME AS:**
- Plan type (HDHP vs PPO)
- Member cost sharing level
- Formulary tier

**Use Cases:**
1. **Target List**: Filter HIGH_COST patients for switch opportunities
2. **ROI Tracking**: Measure cost reduction from HIGH → LOW or HIGH → lower-cost biologic
3. **Risk Stratification**: HIGH_COST = higher spend, higher intervention priority

## Wallet Friction Analysis (Without Plan Details)

### What "Cost (Member Paid)" Tells Us

Even without knowing if someone has an HDHP, we can identify wallet friction:

**High Wallet Friction Indicators:**
```sql
-- Members with high member liability
SELECT p.*, AVG(c.outOfPocket) as avg_member_paid
FROM Patient p
JOIN PharmacyClaim c ON c.patientId = p.id
WHERE p.costDesignation = 'HIGH_COST'
GROUP BY p.id
HAVING AVG(c.outOfPocket) > 500  -- Paying $500+ per fill
```

**January Spike Analysis (HDHP Proxy):**
```sql
-- Members with January spike in OOP (likely deductible reset)
SELECT p.*,
       AVG(CASE WHEN EXTRACT(MONTH FROM c.fillDate) = 1
           THEN c.outOfPocket END) as jan_oop,
       AVG(CASE WHEN EXTRACT(MONTH FROM c.fillDate) > 1
           THEN c.outOfPocket END) as rest_oop
FROM Patient p
JOIN PharmacyClaim c ON c.patientId = p.id
GROUP BY p.id
HAVING jan_oop > (rest_oop * 2)  -- Jan costs 2x higher = deductible
```

**Pharma Assistance Detection:**
```sql
-- Low OOP despite HIGH_COST = likely using copay card
SELECT p.*, AVG(c.outOfPocket) as avg_oop
FROM Patient p
JOIN PharmacyClaim c ON c.patientId = p.id
WHERE p.costDesignation = 'HIGH_COST'
GROUP BY p.id
HAVING AVG(c.outOfPocket) < 50  -- <$50 OOP on biologic = assistance
```

## Success Metrics

### Primary Success Metric: Benchmark Cost

**From Eligibility Data:**
```typescript
patient.benchmarkCost: number  // e.g., $44,000
```

**How Success is Measured:**
1. Calculate total annual drug cost per patient
2. Compare to benchmark cost
3. Goal: Total cost < benchmark cost

**Calculation:**
```sql
SELECT
  p.id,
  p.benchmarkCost,
  SUM(c.trueDrugCost) as actual_annual_cost,
  (p.benchmarkCost - SUM(c.trueDrugCost)) as savings,
  ((p.benchmarkCost - SUM(c.trueDrugCost)) / p.benchmarkCost * 100) as savings_percent
FROM Patient p
JOIN PharmacyClaim c ON c.patientId = p.id
WHERE c.fillDate BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY p.id, p.benchmarkCost
HAVING SUM(c.trueDrugCost) < p.benchmarkCost
```

**Use `trueDrugCost`, not `planPaid`:**
- `trueDrugCost` = net-of-rebate actual cost (what plan truly paid)
- `planPaid` = gross cost before manufacturer rebates
- `trueDrugCost` is the real economic impact

## Production Readiness Checklist

### 1. Database Setup
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Seed NDC mappings: `npx tsx scripts/seed-ndc-mappings.ts`
- [ ] Create "Aetna December 2024" plan or import formulary

### 2. Data Upload
- [ ] Upload formulary for "Aetna December 2024"
- [ ] Upload eligibility data (will auto-create patients with employer mapping)
- [ ] Upload claims data (will auto-link via Pharmacy Insurance ID and convert NDC codes)

### 3. Employer Mapping Configuration
- [ ] Update `employerToPlanMapping` in `/app/api/upload/route.ts`
- [ ] Add all relevant employers and their corresponding plans

### 4. Missing Data Handling
- [ ] Accept that we don't have HDHP flags - use January OOP spikes as proxy
- [ ] Accept that we don't have PA status - document assumptions in recommendations
- [ ] Accept that formulary is generic, not patient-specific

### 5. UI Updates
- [x] Patient list shows location and cost tier
- [x] Geographic analytics dashboard
- [ ] Add note in recommendation UI: "Estimated costs based on plan formulary, actual member cost may vary"

### 6. Analytics Setup
- [ ] Create views/queries for:
  - Benchmark cost tracking
  - Geographic success rates
  - HIGH_COST → LOW_COST conversions
  - Wallet friction identification

## Future Enhancements

### Data We Should Request (if possible):

1. **Plan Type Indicator**
   - Even just "HDHP" vs "Non-HDHP" flag
   - Enables better targeting

2. **Current Deductible Accumulation**
   - Amount applied to deductible YTD
   - Enables precise liability predictions

3. **Formulary Tier by Patient**
   - Patient-specific tier for each drug
   - Enables accurate cost comparisons

4. **PA Status by Patient**
   - Active PAs and their expiration dates
   - Enables better recommendation timing

5. **Days Supply Consistently**
   - Should be in all claims for adherence calculations

6. **Rejection/Reversal Claims**
   - See denied claims, not just successful fills
   - Understand formulary barriers

## Summary

**What This Means in Practice:**

✅ **We CAN:**
- Link patients across eligibility and claims via Pharmacy Insurance ID
- Track total drug costs vs. benchmark costs (success metric)
- Identify HIGH_COST patients for intervention
- Identify wallet friction via member liability amounts
- Analyze geographic patterns
- Convert NDC codes to drug names automatically
- Make evidence-based recommendations

❌ **We CANNOT (perfectly):**
- Identify HDHP members definitively (use January OOP spikes as proxy)
- Predict exact member cost (use formulary tiers + average OOP as estimate)
- Know if PA is already approved (assume not unless documented)
- Calculate precise adherence without days supply (use fill frequency)
- See denied claims (only successful fills)

**The App Still Works:**
The application is designed to work with incomplete data. It makes reasonable assumptions, provides estimates where exact data isn't available, and focuses on the data we DO have (benchmark costs, true drug costs, member liability, diagnosis codes) to drive recommendations.

**Key Principle:**
Better to make evidence-based recommendations with caveats than to wait for perfect data that may never come.
