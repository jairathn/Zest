import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './db';
import { normalizeToGeneric } from './drug-normalizer';
import {
  Patient,
  CurrentBiologic,
  PharmacyClaim,
  FormularyDrug,
  InsurancePlan,
  Contraindication,
  RecommendationType,
  DiagnosisType,
} from '@prisma/client';

// Lazy initialization to avoid build-time errors
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

/**
 * FDA-approved MAINTENANCE dosing for biologics
 * Used to detect if patient is on standard, reduced, or extended dosing
 */
const STANDARD_MAINTENANCE_DOSING: Record<string, { interval: number; unit: 'weeks' | 'days' }> = {
  // IL-23 Inhibitors
  'Skyrizi': { interval: 12, unit: 'weeks' },
  'Risankizumab': { interval: 12, unit: 'weeks' },
  'Tremfya': { interval: 8, unit: 'weeks' },
  'Guselkumab': { interval: 8, unit: 'weeks' },
  'Ilumya': { interval: 12, unit: 'weeks' },
  'Tildrakizumab': { interval: 12, unit: 'weeks' },

  // IL-17 Inhibitors
  'Cosentyx': { interval: 4, unit: 'weeks' },
  'Secukinumab': { interval: 4, unit: 'weeks' },
  'Taltz': { interval: 4, unit: 'weeks' },
  'Ixekizumab': { interval: 4, unit: 'weeks' },
  'Siliq': { interval: 1, unit: 'weeks' },
  'Brodalumab': { interval: 1, unit: 'weeks' },

  // TNF Inhibitors
  'Humira': { interval: 2, unit: 'weeks' },
  'Adalimumab': { interval: 2, unit: 'weeks' },
  'Adalimumab-adbm': { interval: 2, unit: 'weeks' },
  'Adalimumab-adaz': { interval: 2, unit: 'weeks' },
  'Adalimumab-aaty': { interval: 2, unit: 'weeks' },
  'Adalimumab-afzb': { interval: 2, unit: 'weeks' },
  'Cyltezo': { interval: 2, unit: 'weeks' },
  'Yusimry': { interval: 2, unit: 'weeks' },
  'Hyrimoz': { interval: 2, unit: 'weeks' },
  'Hadlima': { interval: 2, unit: 'weeks' },
  'Abrilada': { interval: 2, unit: 'weeks' },
  'Enbrel': { interval: 1, unit: 'weeks' },
  'Etanercept': { interval: 1, unit: 'weeks' },
  'Etanercept-szzs': { interval: 1, unit: 'weeks' },
  'Erelzi': { interval: 1, unit: 'weeks' },
  'Eticovo': { interval: 1, unit: 'weeks' },
  'Cimzia': { interval: 2, unit: 'weeks' },
  'Certolizumab': { interval: 2, unit: 'weeks' },
  'Simponi': { interval: 4, unit: 'weeks' },
  'Golimumab': { interval: 4, unit: 'weeks' },

  // IL-12/23 Inhibitors
  'Stelara': { interval: 12, unit: 'weeks' },
  'Ustekinumab': { interval: 12, unit: 'weeks' },

  // IL-4/13 Inhibitors
  'Dupixent': { interval: 2, unit: 'weeks' },
  'Dupilumab': { interval: 2, unit: 'weeks' },

  // JAK Inhibitors (oral - daily dosing)
  'Rinvoq': { interval: 1, unit: 'days' },
  'Upadacitinib': { interval: 1, unit: 'days' },
  'Sotyktu': { interval: 1, unit: 'days' },
  'Deucravacitinib': { interval: 1, unit: 'days' },
};

/**
 * Parse frequency string and detect dose reduction level
 * Returns 0 (standard), 25, or 50 (percent reduction from standard)
 */
function getDoseReductionLevel(drugName: string, currentFrequency: string): 0 | 25 | 50 {
  const standardDosing = STANDARD_MAINTENANCE_DOSING[drugName];
  if (!standardDosing) {
    return 0; // Unknown drug, assume standard dosing
  }

  const frequencyLower = currentFrequency.toLowerCase();
  const intervalMatch = frequencyLower.match(/every\s+(\d+)\s+(week|day)/);
  if (!intervalMatch) {
    return 0; // Can't parse, assume standard
  }

  const currentInterval = parseInt(intervalMatch[1]);
  const currentUnit = intervalMatch[2].includes('week') ? 'weeks' : 'days';

  if (currentUnit !== standardDosing.unit) {
    return 0; // Different units, assume standard
  }

  const standardInterval = standardDosing.interval;
  const extensionRatio = currentInterval / standardInterval;

  if (extensionRatio <= 1.15) {
    return 0; // Within 15% of standard
  } else if (extensionRatio <= 1.6) {
    return 25; // 16%-60% extension ≈ 25% dose reduction
  } else {
    return 50; // >60% extension ≈ 50% dose reduction
  }
}

export interface AssessmentInput {
  patientId: string;
  diagnosis: DiagnosisType;
  hasPsoriaticArthritis: boolean;
  dlqiScore: number;
  monthsStable: number;
  additionalNotes?: string;
}

interface TriageResult {
  canDoseReduce: boolean;
  shouldSwitch: boolean;
  needsInitiation: boolean;
  shouldContinueCurrent: boolean;
  quadrant: string;
  reasoning: string;
}

interface LLMRecommendation {
  type: RecommendationType;
  drugName?: string;
  newDose?: string;
  newFrequency?: string;
  rationale: string;
  monitoringPlan?: string;
  rank: number;
}

/**
 * Check if patient is stable but for insufficient duration
 * These patients should continue current therapy, not optimize yet
 */
function isStableShortDuration(dlqiScore: number, monthsStable: number): boolean {
  return dlqiScore <= 4 && monthsStable < 6;
}

/**
 * Convert string requiresPA value to boolean
 * FormularyDrug stores as String ("Yes", "No", "N/A", "Unknown")
 * Recommendation stores as Boolean
 */
function convertRequiresPAToBoolean(requiresPA: string | null | undefined): boolean {
  return requiresPA === 'Yes';
}

/**
 * Strip markdown code blocks from LLM response
 * Handles responses like ```json\n{...}\n```
 */
function stripMarkdownCodeBlock(text: string): string {
  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = text.trim().match(codeBlockRegex);
  return match ? match[1].trim() : text.trim();
}

/**
 * Determine formulary status and quadrant using hard-coded rules
 */
function determineQuadrantAndStatus(
  dlqiScore: number,
  monthsStable: number,
  currentFormularyDrug: FormularyDrug | null,
  hasCurrentBiologic: boolean
): { isStable: boolean; isFormularyOptimal: boolean; quadrant: string } {
  // Special case: Not on biologic yet (initiation pathway)
  if (!hasCurrentBiologic) {
    return {
      isStable: false, // N/A for initiation
      isFormularyOptimal: false, // N/A for initiation
      quadrant: 'not_on_biologic'
    };
  }

  // Check for stable but insufficient duration - special case
  if (isStableShortDuration(dlqiScore, monthsStable)) {
    const isFormularyOptimal = currentFormularyDrug
      ? currentFormularyDrug.tier === 1
      : false;
    return {
      isStable: true, // Patient IS stable, just not for long enough
      isFormularyOptimal,
      quadrant: 'stable_short_duration'
    };
  }

  // Stability: DLQI ≤4 (minimal to mild effect on life) and ≥6 months stable
  const isStable = dlqiScore <= 4 && monthsStable >= 6;

  // Formulary optimal: Tier 1 (regardless of PA requirement for CURRENT therapy)
  // Rationale: If patient is already on a Tier 1 drug with PA, they've cleared that hurdle.
  //            PA requirement is only relevant when evaluating NEW drug switches/starts.
  // Tier 2-5 = suboptimal
  const isFormularyOptimal = currentFormularyDrug
    ? currentFormularyDrug.tier === 1
    : false;

  // Determine quadrant
  let quadrant: string;
  if (isStable && isFormularyOptimal) {
    quadrant = 'stable_optimal'; // Tier 1, stable
  } else if (isStable && !isFormularyOptimal) {
    quadrant = 'stable_suboptimal'; // Tier 2-3, stable
  } else if (!isStable && isFormularyOptimal) {
    quadrant = 'unstable_optimal'; // Tier 1, unstable
  } else {
    quadrant = 'unstable_suboptimal'; // Tier 2-3, unstable
  }

  return { isStable, isFormularyOptimal, quadrant };
}

/**
 * Step 1: LLM Triage - Get clinical reasoning and recommendation strategy
 */
async function triagePatient(
  assessment: AssessmentInput,
  currentDrug: string | null,
  formularyDrug: FormularyDrug | null,
  quadrant: string,
  currentDoseReduction: 0 | 25 | 50,
  lowestTierInFormulary: number,
  currentTier: number,
  availableTiers: number[]
): Promise<TriageResult> {
  const prompt = `You are a clinical decision support AI for dermatology biologic optimization with comprehensive tier and dose reduction logic.

Patient Information:
- Diagnosis: ${assessment.diagnosis}
- Current medication: ${currentDrug || 'None (not on biologic)'}
- Current dose status: ${currentDoseReduction === 0 ? 'Standard dosing' : `${currentDoseReduction}% dose-reduced`}
- DLQI Score: ${assessment.dlqiScore} (0-30 scale, lower is better)
- Months stable: ${assessment.monthsStable}
- Has psoriatic arthritis: ${assessment.hasPsoriaticArthritis ? 'Yes' : 'No'}
- Additional notes: ${assessment.additionalNotes || 'None'}

Formulary Tier Structure (RELATIVE TIER LOGIC):
- Available tiers in formulary: [${availableTiers.join(', ')}]
- Lowest tier in formulary: Tier ${lowestTierInFormulary}
- Current tier: Tier ${currentTier}
- Requires PA: ${formularyDrug?.requiresPA || 'Unknown'}
- Classification: ${quadrant.replace(/_/g, ' ').toUpperCase()}

KEY PRINCIPLE: Cost savings is the priority. The lowest available tier in THIS formulary is the target, not necessarily Tier 1.

COMPREHENSIVE TIER CASCADE LOGIC:
- For stable patients ABOVE lowest tier: Recommend switches to ALL lower tiers (lowest first), then dose reduction when reaching current tier
- For stable patients ON lowest tier: Recommend dose reduction stepping (0% → 25% → 50% max)
- For unstable + dose-reduced patients: Return to standard dosing FIRST
- For stable <6 months: CAN switch tiers, CANNOT dose reduce yet

DOSE REDUCTION STEPPING:
- Maximum reduction: 50% from standard
- Step 1: Standard (0%) → 25% reduction
- Step 2: 25% → 50% reduction (maximum)
- Only for stable ≥6 months
- Clinical evidence should be retrieved

CONTINUE CURRENT only when:
- Stable <6 months (too early to optimize), OR
- Already dose-reduced + on lowest tier + stable

Based on quadrant "${quadrant}", current dose ${currentDoseReduction}%, tier ${currentTier} of ${lowestTierInFormulary}, determine:
1. Should dose reduction be considered?
2. Should formulary switch be recommended?
3. What is the recommendation priority order?
4. Provide clinical reasoning

Return ONLY a JSON object with this exact structure:
{
  "canDoseReduce": boolean,
  "shouldSwitch": boolean,
  "needsInitiation": boolean,
  "shouldContinueCurrent": boolean,
  "quadrant": "${quadrant}",
  "reasoning": "string"
}`;

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    temperature: 0.3,
    system: 'You are a clinical decision support AI. Always respond with valid JSON only, no other text.',
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  const rawText = content.type === 'text' ? content.text : '{}';
  const cleanJson = stripMarkdownCodeBlock(rawText);
  const result = JSON.parse(cleanJson);
  return result as TriageResult;
}

/**
 * Retrieve structured clinical findings from database
 *
 * Queries the ClinicalFinding table for human-reviewed findings
 * relevant to the patient's drug and diagnosis
 */
async function retrieveStructuredFindings(
  drugName: string | null,
  diagnosis: DiagnosisType,
  triage: TriageResult
): Promise<string[]> {
  // If dose reduction is needed, retrieve structured findings
  if ((triage.canDoseReduce || triage.shouldContinueCurrent) && drugName) {
    try {
      const findings = await prisma.clinicalFinding.findMany({
        where: {
          AND: [
            {
              OR: [
                { drug: { contains: drugName, mode: 'insensitive' } },
                { finding: { contains: drugName, mode: 'insensitive' } },
              ],
            },
            {
              OR: [
                { indication: { contains: diagnosis, mode: 'insensitive' } },
                { finding: { contains: diagnosis, mode: 'insensitive' } },
              ],
            },
            {
              findingType: {
                in: ['DOSE_REDUCTION', 'INTERVAL_EXTENSION', 'SAFETY', 'EFFICACY']
              },
            },
            // CRITICAL: Only use human-reviewed findings in decision engine
            // Unreviewed findings may contain errors or irrelevant information
            { reviewed: true },
          ],
        },
        orderBy: [
          { createdAt: 'desc' },  // Most recent first
        ],
        take: 15,  // More findings for comprehensive evidence
      });

      if (findings.length > 0) {
        // Format findings as clean, physician-ready text
        return findings.map(f =>
          `📄 ${f.paperTitle}\nCitation: ${f.citation}\nFinding: ${f.finding}`
        );
      }
    } catch (error) {
      console.error('Error retrieving structured findings:', error);
    }
  }

  // No findings found - return empty array (LLM will work without evidence context)
  return [];
}

/**
 * Filter drugs by FDA approved indications for the patient's diagnosis
 */
function filterByDiagnosis(
  drugs: FormularyDrug[],
  diagnosis: DiagnosisType
): FormularyDrug[] {
  return drugs.filter(drug => {
    // If no indications specified, include it (for backward compatibility)
    if (!drug.fdaIndications || drug.fdaIndications.length === 0) {
      return true;
    }
    // Check if the diagnosis matches any FDA indication (case-insensitive, partial match)
    // Handle both "PSORIASIS" (enum) and "Psoriasis" (data) formats
    // Also handle abbreviations like "PsA" for Psoriatic Arthritis
    const diagnosisLower = diagnosis.toLowerCase().replace(/_/g, ' ');

    return drug.fdaIndications.some(indication => {
      const indicationLower = indication.toLowerCase().replace(/_/g, ' ');
      // Exact match OR partial match (e.g., "psoriasis" matches "psoriatic arthritis")
      return indicationLower.includes(diagnosisLower) || diagnosisLower.includes(indicationLower);
    });
  });
}

interface ContraindicatedDrug {
  drug: FormularyDrug;
  reasons: Array<{
    type: string;
    severity: 'ABSOLUTE' | 'RELATIVE';
    reason: string;
    details?: string;
  }>;
}

/**
 * Comprehensive contraindication checking
 * Returns both safe and contraindicated drugs with reasons and severity
 */
function checkDrugContraindications(
  drugs: FormularyDrug[],
  contraindications: Contraindication[]
): { safe: FormularyDrug[]; contraindicated: ContraindicatedDrug[] } {
  if (contraindications.length === 0) {
    return { safe: drugs, contraindicated: [] };
  }

  const safe: FormularyDrug[] = [];
  const contraindicated: ContraindicatedDrug[] = [];

  for (const drug of drugs) {
    const normalizedDrugClass = drug.drugClass?.toUpperCase().replace(/\s+/g, '_') || '';
    const reasons: ContraindicatedDrug['reasons'] = [];

    // Check each contraindication against drug class
    for (const ci of contraindications) {
      const ciType = ci.type;

      // TNF INHIBITORS
      if (normalizedDrugClass.includes('TNF')) {
        if (ciType === 'HEART_FAILURE') {
          reasons.push({
            type: ciType,
            severity: 'ABSOLUTE',
            reason: 'TNF inhibitors can worsen heart failure and increase mortality',
            details: ci.details
          });
        }
        if (ciType === 'MULTIPLE_SCLEROSIS' || ciType === 'DEMYELINATING_DISEASE') {
          reasons.push({
            type: ciType,
            severity: 'ABSOLUTE',
            reason: 'TNF inhibitors can exacerbate demyelinating diseases',
            details: ci.details
          });
        }
        if (ciType === 'LYMPHOMA') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'History of lymphoma - TNF inhibitors may increase recurrence risk. Consider risk/benefit with oncology.',
            details: ci.details
          });
        }
        if (ciType === 'MALIGNANCY') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'Active or recent malignancy - TNF inhibitors may affect tumor surveillance. Discuss with oncology.',
            details: ci.details
          });
        }
        if (ciType === 'HEPATITIS_B') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'Hepatitis B can reactivate with TNF inhibitors. Requires antiviral prophylaxis and monitoring.',
            details: ci.details
          });
        }
        if (ciType === 'LATENT_TUBERCULOSIS') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'Latent TB requires prophylactic treatment before starting TNF inhibitor.',
            details: ci.details
          });
        }
        if (ciType === 'ACTIVE_TUBERCULOSIS') {
          reasons.push({
            type: ciType,
            severity: 'ABSOLUTE',
            reason: 'Active TB must be treated before starting any biologic, especially TNF inhibitors.',
            details: ci.details
          });
        }
      }

      // JAK INHIBITORS
      if (normalizedDrugClass.includes('JAK') || normalizedDrugClass.includes('TYK2')) {
        if (ciType === 'THROMBOSIS' || ciType === 'VENOUS_THROMBOEMBOLISM') {
          reasons.push({
            type: ciType,
            severity: 'ABSOLUTE',
            reason: 'JAK inhibitors significantly increase VTE risk. Contraindicated in patients with thrombosis history.',
            details: ci.details
          });
        }
        if (ciType === 'CARDIOVASCULAR_DISEASE') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'JAK inhibitors increase MACE risk. Consider in patients >50 with CV risk factors. Monitor closely.',
            details: ci.details
          });
        }
        if (ciType === 'MALIGNANCY') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'JAK inhibitors may increase cancer risk. Discuss risk/benefit in patients with cancer history.',
            details: ci.details
          });
        }
        if (ciType === 'CYTOPENIAS') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'JAK inhibitors can worsen cytopenias. Requires baseline labs and monitoring.',
            details: ci.details
          });
        }
      }

      // IL-17 INHIBITORS
      if (normalizedDrugClass.includes('IL17') || normalizedDrugClass.includes('IL-17')) {
        if (ciType === 'INFLAMMATORY_BOWEL_DISEASE') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'IL-17 inhibitors can worsen or trigger IBD. Use with caution and GI consultation.',
            details: ci.details
          });
        }
        if (ciType === 'DIVERTICULITIS') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'IL-17 inhibitors may increase intestinal perforation risk. Monitor for GI symptoms.',
            details: ci.details
          });
        }
      }

      // ALL BIOLOGICS
      if (ciType === 'ACTIVE_INFECTION') {
        reasons.push({
          type: ciType,
          severity: 'ABSOLUTE',
          reason: 'Active infection must be treated before starting any biologic therapy.',
          details: ci.details
        });
      }
      if (ciType === 'OPPORTUNISTIC_INFECTION') {
        reasons.push({
          type: ciType,
          severity: 'ABSOLUTE',
          reason: 'History of opportunistic infection requires ID consultation before biologics.',
          details: ci.details
        });
      }
      if (ciType === 'MALIGNANCY' && !reasons.some(r => r.type === 'MALIGNANCY')) {
        reasons.push({
          type: ciType,
          severity: 'RELATIVE',
          reason: 'Active or recent malignancy - biologics may affect tumor surveillance. Requires oncology clearance.',
          details: ci.details
        });
      }
      if (ciType === 'IMMUNOCOMPROMISED' && !reasons.some(r => r.type === 'IMMUNOCOMPROMISED')) {
        reasons.push({
          type: ciType,
          severity: 'RELATIVE',
          reason: 'Immunocompromised state increases infection risk with biologics. Monitor closely.',
          details: ci.details
        });
      }
      if (ciType === 'PREGNANCY') {
        reasons.push({
          type: ciType,
          severity: 'RELATIVE',
          reason: 'Pregnancy requires careful risk/benefit assessment. Some biologics are safer than others. Consult maternal-fetal medicine.',
          details: ci.details
        });
      }
      if (ciType === 'LIVE_VACCINE_RECENT') {
        reasons.push({
          type: ciType,
          severity: 'RELATIVE',
          reason: 'Wait 4+ weeks after live vaccine before starting biologics. No live vaccines while on therapy.',
          details: ci.details
        });
      }
      if (ciType === 'SURGERY_PLANNED') {
        reasons.push({
          type: ciType,
          severity: 'RELATIVE',
          reason: 'Hold biologics peri-operatively to reduce infection risk. Timing depends on drug half-life.',
          details: ci.details
        });
      }
    }

    // Categorize drug as safe or contraindicated
    // Exclude if ANY absolute contraindication, or if ONLY showing safe drugs
    const hasAbsoluteContraindication = reasons.some(r => r.severity === 'ABSOLUTE');

    if (reasons.length === 0) {
      safe.push(drug);
    } else if (hasAbsoluteContraindication) {
      // Absolute contraindications - exclude from main recommendations
      contraindicated.push({ drug, reasons });
      console.log(`  ⚠️  ABSOLUTE contraindication: ${drug.drugName} - ${reasons.filter(r => r.severity === 'ABSOLUTE').map(r => r.type).join(', ')}`);
    } else {
      // Only relative contraindications - still flag but could be considered with caution
      contraindicated.push({ drug, reasons });
      console.log(`  ⚠️  RELATIVE contraindication: ${drug.drugName} - ${reasons.map(r => r.type).join(', ')}`);
    }
  }

  console.log(`Contraindication filtering: ${drugs.length} total → ${safe.length} safe, ${contraindicated.length} contraindicated (${contraindicated.filter(c => c.reasons.some(r => r.severity === 'ABSOLUTE')).length} absolute, ${contraindicated.filter(c => c.reasons.every(r => r.severity === 'RELATIVE')).length} relative)`);

  return { safe, contraindicated };
}

/**
 * Legacy function for backward compatibility - filters out all contraindicated drugs
 * Use checkDrugContraindications() for full tracking
 */
function filterContraindicated(
  drugs: FormularyDrug[],
  contraindications: Contraindication[]
): FormularyDrug[] {
  return checkDrugContraindications(drugs, contraindications).safe;
}

/**
 * Step 4: LLM Decision-Making with retrieved context
 */
async function getLLMRecommendationSuggestions(
  assessment: AssessmentInput,
  currentDrug: string | null,
  currentBiologic: any | null,
  triage: TriageResult,
  evidence: string[],
  formularyOptions: FormularyDrug[],
  currentFormularyDrug: FormularyDrug | null,
  contraindications: Contraindication[],
  currentDoseReduction: 0 | 25 | 50,
  lowestTierInFormulary: number,
  currentTier: number,
  availableTiers: number[]
): Promise<LLMRecommendation[]> {
  const contraindicationText = contraindications.length > 0
    ? contraindications.map(c => c.type).join(', ')
    : 'None';

  // Get current brand name (not generic) to properly exclude from switch options
  const currentBrandName = currentFormularyDrug?.drugName || currentDrug;

  // Build current dosing information string
  const currentDosingInfo = currentBiologic
    ? `${currentBiologic.dose} ${currentBiologic.frequency} (${currentDoseReduction === 0 ? 'Standard' : `${currentDoseReduction}% reduced`})`
    : 'Not specified';

  // Filter and deduplicate formulary options
  // CRITICAL: Exclude the current brand drug AND deduplicate by generic name
  // to avoid showing multiple formulations of the same drug to the LLM
  const uniqueFormularyDrugs = new Map<string, FormularyDrug>();

  formularyOptions.forEach(drug => {
    // Exclude current brand drug
    if (currentBrandName && drug.drugName.toLowerCase() === currentBrandName.toLowerCase()) {
      return;
    }
    // Exclude by generic name match too (belt and suspenders)
    if (currentDrug && drug.drugName.toLowerCase() === currentDrug.toLowerCase()) {
      return;
    }

    // Deduplicate by generic name - keep first occurrence (usually most common formulation)
    const genericKey = drug.genericName.toLowerCase();
    if (!uniqueFormularyDrugs.has(genericKey)) {
      uniqueFormularyDrugs.set(genericKey, drug);
    }
  });

  // Show top 10 unique drugs, prioritizing lower tiers
  const formularyText = Array.from(uniqueFormularyDrugs.values())
    .slice(0, 10)
    .map(d => `${d.drugName} (${d.drugClass}, Tier ${d.tier}, PA: ${d.requiresPA ? 'Yes' : 'No'}, Annual Cost: $${d.annualCostWAC})`)
    .join('\n');

  const evidenceText = evidence.length > 0
    ? evidence.join('\n\n')
    : 'No specific evidence retrieved from knowledge base.';

  // Count unique Tier 1 options to help LLM decide whether to offer dose reduction
  const tier1Count = Array.from(uniqueFormularyDrugs.values())
    .filter(d => d.tier === 1)
    .length;

  const prompt = `You are a clinical decision support AI for dermatology biologic optimization.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Current medication: ${currentBrandName || 'None (not on biologic)'}${currentDrug && currentDrug !== currentBrandName ? ` (generic: ${currentDrug})` : ''}
- Current dosing: ${currentDosingInfo}
- Diagnosis: ${assessment.diagnosis}
- DLQI Score: ${assessment.dlqiScore}
- Months stable: ${assessment.monthsStable}
- Psoriatic arthritis: ${assessment.hasPsoriaticArthritis ? 'YES - prefer drugs with PsA indication' : 'NO'}
- Additional notes: ${assessment.additionalNotes || 'None'}
- Quadrant: ${triage.quadrant}
- Triage reasoning: ${triage.reasoning}
- Contraindications: ${contraindicationText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMULARY TIER STRUCTURE (RELATIVE LOGIC)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Available tiers in formulary (for indicated drugs): [${availableTiers.join(', ')}]
- Lowest tier in this formulary: ${lowestTierInFormulary}
- Patient's current tier: ${currentTier}
- Current dose reduction status: ${currentDoseReduction}%
- Current formulary status: ${currentFormularyDrug ? `Tier ${currentFormularyDrug.tier}, PA: ${currentFormularyDrug.requiresPA || 'Unknown'}, Annual Cost: $${currentFormularyDrug.annualCostWAC}` : 'Not on formulary'}

Available Formulary Options (deduplicated by generic name):
${formularyText}

⚠️ CRITICAL: Cost savings is THE priority. Always recommend the LOWEST tier available in this formulary first (Tier ${lowestTierInFormulary}), not necessarily Tier 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLINICAL EVIDENCE FROM KNOWLEDGE BASE (Use for dose reduction citations)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${evidenceText}

⚠️ When recommending DOSE_REDUCTION, cite ALL relevant papers from above by specific titles and authors. NEVER hallucinate citations. Accuracy > citation count.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIER CASCADE ALGORITHM (COST SAVINGS PRIORITY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PRIMARY PRINCIPLE: Recommend LOWEST tier first, cascade upward to current tier, THEN dose reduction**

For STABLE patients (DLQI ≤4) above the lowest tier:
1. **First Priority**: Recommend switches to Tier ${lowestTierInFormulary} (lowest available)
2. **Second Priority**: Recommend switches to next lowest tier (${availableTiers[1] || 'N/A'})
3. **Third Priority**: Continue cascade through available tiers up to patient's current tier
4. **Fourth Priority**: ONLY when reaching current tier (${currentTier}), offer dose reduction
5. **Last Resort**: CONTINUE_CURRENT only if already dose-reduced + on lowest tier + stable

For STABLE patients ON the lowest tier (Tier ${lowestTierInFormulary}):
1. **First Priority**: Dose reduction with 25% stepping (if current dose = 0% reduced → recommend 25% reduction)
2. **Second Priority**: Further dose reduction (if current dose = 25% reduced → recommend 50% reduction)
3. **Third Priority**: CONTINUE_CURRENT (if already 50% reduced, maximum optimization reached)
4. **Maximum**: 50% reduction from standard dosing (NEVER exceed 50%)

For UNSTABLE patients (DLQI >4):
1. **Never dose reduce** - patient needs better control
2. Recommend most efficacious drugs in best available tier
3. Prioritize mechanism switching (TNF → IL-17/IL-23 for better efficacy)

For patients stable <6 months:
1. **CONTINUE_CURRENT** - too early to optimize (need ${6 - assessment.monthsStable} more months)
2. Mention future options once 6 months stability achieved

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOSE REDUCTION STEPPING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Patient's current dose reduction: ${currentDoseReduction}%

**Stepping Logic:**
- Standard (0%) → First reduction: 25% extension (e.g., Q2W → Q3W, Q4W → Q6W, Q8W → Q10W, Q12W → Q16W)
- 25% reduced → Second reduction: 50% extension (e.g., Q2W → Q4W, Q4W → Q8W, Q8W → Q12W, Q12W → Q18W)
- 50% reduced → Maximum reached, CONTINUE_CURRENT only
- NEVER exceed 50% reduction from FDA standard maintenance dosing

**Examples of Proper Stepping:**
- Adalimumab (Q2W standard): 0% → Q3W (25%) → Q4W (50%) [STOP]
- Secukinumab (Q4W standard): 0% → Q6W (25%) → Q8W (50%) [STOP]
- Risankizumab (Q8W standard): 0% → Q10W (25%) → Q12W (50%) [STOP]
- Ustekinumab (Q12W standard): 0% → Q16W (25%) → Q18W (50%) [STOP]

⚠️ CRITICAL: A reduction MUST extend the interval beyond current. NEVER recommend same interval.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITHIN-TIER EFFICACY RANKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When multiple drugs exist in same tier, rank by clinical efficacy:

**Psoriasis Efficacy Hierarchy:**
1. IL-23 inhibitors (Risankizumab, Guselkumab, Tildrakizumab) - highest efficacy
2. IL-17 inhibitors (Secukinumab, Ixekizumab, Brodalumab) - excellent efficacy
3. TNF inhibitors (Adalimumab, Infliximab, Etanercept) - good efficacy
4. IL-4/13 inhibitors (Dupilumab) - moderate efficacy, excellent for AD
5. Oral agents (Apremilast, Deucravacitinib) - moderate efficacy

**Comorbidity Considerations (parse additionalNotes):**
- Asthma + Atopic Dermatitis → Dupilumab strongly preferred (multi-indication benefit)
- Psoriatic arthritis → IL-17 or TNF inhibitors preferred over IL-23
- Inflammatory bowel disease → AVOID IL-17 inhibitors, prefer TNF or IL-23
- Cardiovascular disease → Consider IL-23 (no heart failure concerns vs TNF)

⚠️ Parse the "Additional notes" field above for comorbidities and adjust ranking accordingly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRAINDICATION RULES (PRE-FILTERED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- TNF inhibitors: CONTRAINDICATED if HEART_FAILURE or MULTIPLE_SCLEROSIS
- IL-17 inhibitors: Can worsen INFLAMMATORY_BOWEL_DISEASE
- ALL biologics: CONTRAINDICATED if ACTIVE_INFECTION
- Contraindicated drugs have been PRE-FILTERED from formulary options shown above

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDATION TYPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use these types:
- **SWITCH_TO_BIOSIMILAR**: Switching to biosimilar version of current drug (e.g., Humira → Amjevita)
- **SWITCH_TO_PREFERRED**: Switching to different drug in lower tier (formulary optimization)
- **THERAPEUTIC_SWITCH**: Switching mechanism for efficacy (e.g., TNF → IL-23 for better control)
- **DOSE_REDUCTION**: Extending interval of current drug (must cite RAG evidence)
- **CONTINUE_CURRENT**: Continue current therapy unchanged (only when truly no optimization possible)
- **OPTIMIZE_CURRENT**: Minor adjustments to current therapy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVIDENCE REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**DOSE_REDUCTION ONLY** - Must cite RAG evidence:
- Cite ALL relevant papers from Clinical Evidence section above
- Reference by actual titles/authors (e.g., "CONDOR trial (Atalay et al.)")
- Include specific findings from studies
- If 5 papers relevant, cite all 5. If only 2 relevant, cite those 2 accurately
- NEVER hallucinate citations. Accuracy > citation count.
- Example: "Multiple studies support adalimumab dose reduction in stable psoriasis. The CONDOR trial (Atalay et al.) demonstrated that extending dosing intervals to every 4 weeks was noninferior to usual care based on DLQI. Additional studies by Piaserico et al. showed successful down-titration with maintenance of clearance."

**FORMULARY SWITCHES** - NO RAG needed:
- Cost optimization is self-evident business case
- Provide clear clinical reasoning but no citations needed

**THERAPEUTIC SWITCHES** - NO RAG needed:
- Standard clinical practice for efficacy escalation
- Provide rationale but no citations needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate EXACTLY 3 specific recommendations ranked by cost savings and clinical benefit.

For EACH recommendation provide:
1. **Type**: One of the types listed above
2. **Drug name**:
   - CONTINUE_CURRENT/OPTIMIZE_CURRENT/DOSE_REDUCTION: "${currentBrandName}"
   - SWITCH recommendations: From formulary options above
   - NEVER recommend same drug twice
3. **New dose**:
   - DOSE_REDUCTION: Specific reduced dose (e.g., "40 mg")
   - SWITCHES: FDA-approved specific dose (e.g., "300 mg", "80 mg initial then 40 mg")
   - NEVER use "Per label" - always specify actual dose
4. **New frequency**:
   - DOSE_REDUCTION: Specific reduced interval (e.g., "every 4 weeks")
   - SWITCHES: FDA-approved specific frequency (e.g., "every 2 weeks after initial dose")
   - NEVER use "Per label" - always specify actual interval
5. **Rationale**:
   - DOSE_REDUCTION: Cite all relevant papers from Clinical Evidence section
   - SWITCHES: Clear clinical reasoning (cost savings, efficacy, formulary optimization)
   - Parse additionalNotes for comorbidities to justify drug selection
6. **Monitoring plan**: Specific follow-up plan (e.g., "Reassess DLQI at 3 and 6 months")

⚠️ NEVER output placeholder text like "No options available" as a drug name.
⚠️ NEVER recommend the current drug as a "switch" - it's excluded from formulary options.
⚠️ NEVER recommend same drug twice.

Return ONLY valid JSON with this exact structure:
{
  "recommendations": [
    {
      "type": "DOSE_REDUCTION",
      "drugName": "string or null",
      "newDose": "string or null",
      "newFrequency": "string or null",
      "rationale": "string",
      "monitoringPlan": "string",
      "rank": number
    }
  ]
}`;

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      temperature: 0.4,
      system: 'You are a clinical decision support AI for dermatology biologic optimization. Always respond with valid JSON only, no other text.',
      messages: [{ role: 'user', content: prompt }],
    });

    const responseContent = response.content[0];
    const rawContent = responseContent.type === 'text' ? responseContent.text : '{}';
    console.log('LLM Response:', rawContent); // Debug logging
    const cleanJson = stripMarkdownCodeBlock(rawContent);
    const parsed = JSON.parse(cleanJson);

    // Handle both array and object responses
    const recommendations = Array.isArray(parsed) ? parsed : (parsed.recommendations || []);

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      console.error('LLM returned no recommendations, response was:', content);
      throw new Error('LLM returned no recommendations');
    }

    return recommendations as LLMRecommendation[];
  } catch (error) {
    console.error('Error getting LLM recommendations:', error);
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * Step 5: Calculate cost savings
 */
function calculateCostSavings(
  recommendation: LLMRecommendation,
  currentDrug: FormularyDrug | null,
  targetDrug: FormularyDrug | null
) {
  let currentAnnualCost = currentDrug?.annualCostWAC?.toNumber();
  let recommendedAnnualCost: number | undefined;
  let annualSavings: number | undefined;
  let savingsPercent: number | undefined;

  if (recommendation.type === 'DOSE_REDUCTION' && currentAnnualCost) {
    // Estimate based on frequency reduction
    // If extending from every 4 weeks to every 8 weeks, that's 50% reduction
    // For now, estimate 25% reduction as conservative
    recommendedAnnualCost = currentAnnualCost * 0.75;
    annualSavings = currentAnnualCost * 0.25;
    savingsPercent = 25;
  } else if (targetDrug && currentAnnualCost) {
    recommendedAnnualCost = targetDrug.annualCostWAC?.toNumber();
    if (recommendedAnnualCost) {
      annualSavings = currentAnnualCost - recommendedAnnualCost;
      savingsPercent = (annualSavings / currentAnnualCost) * 100;
    }
  }

  return {
    currentAnnualCost,
    recommendedAnnualCost,
    annualSavings,
    savingsPercent,
    currentMonthlyOOP: currentDrug?.memberCopayT1?.div(12).toNumber(),
    recommendedMonthlyOOP: targetDrug?.memberCopayT1?.div(12).toNumber() ||
      (currentDrug?.memberCopayT1?.div(12).mul(0.75).toNumber()),
  };
}

/**
 * Main function: Generate recommendations using LLM-enhanced workflow
 */
export async function generateLLMRecommendations(
  assessment: AssessmentInput
): Promise<{
  isStable: boolean;
  isFormularyOptimal: boolean;
  quadrant: string;
  recommendations: any[];
  formularyReference?: any[];
  contraindicatedDrugs?: Array<{
    drugName: string;
    drugClass: string;
    tier: number;
    requiresPA: string | null;
    annualCost: number | null;
    reasons: Array<{
      type: string;
      severity: 'ABSOLUTE' | 'RELATIVE';
      reason: string;
      details?: string;
    }>;
  }>;
}> {
  // Fetch patient data
  const patient = await prisma.patient.findUnique({
    where: { id: assessment.patientId },
    include: {
      currentBiologics: true,
      claims: {
        orderBy: { fillDate: 'desc' },
        take: 12,
      },
      contraindications: true,
      plan: true,
    },
  });

  if (!patient || !patient.plan) {
    throw new Error('Patient or plan not found');
  }

  // Determine the effective plan ID (either direct planId or resolved from formularyPlanName)
  let effectivePlanId = patient.planId;

  if (!effectivePlanId && patient.formularyPlanName) {
    // If no planId but has formularyPlanName, try to find the plan by name
    const planByName = await prisma.insurancePlan.findFirst({
      where: { planName: patient.formularyPlanName },
    });
    if (planByName) {
      effectivePlanId = planByName.id;
      console.log(`  ℹ️ Resolved formularyPlanName "${patient.formularyPlanName}" to planId: ${effectivePlanId}`);
    } else {
      console.warn(`  ⚠️ Patient has formularyPlanName "${patient.formularyPlanName}" but no matching InsurancePlan found`);
    }
  }

  // Get the most recent formulary upload for this plan
  const mostRecentUpload = effectivePlanId
    ? await prisma.uploadLog.findFirst({
        where: {
          uploadType: 'FORMULARY',
          planId: effectivePlanId,
        },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true },
      })
    : null;

  // Fetch formulary drugs from the most recent upload only
  const formularyDrugs = mostRecentUpload && effectivePlanId
    ? await prisma.formularyDrug.findMany({
        where: {
          planId: effectivePlanId,
          uploadLogId: mostRecentUpload.id,
        },
      })
    : [];

  // Add formularyDrugs to patient.plan for compatibility with existing code
  const patientWithFormulary = {
    ...patient,
    plan: {
      ...patient.plan,
      formularyDrugs,
    },
  };

  const currentBiologic = patient.currentBiologics[0];
  const hasCurrentBiologic = !!currentBiologic;

  console.log(`\n━━━ FORMULARY MATCHING DEBUG ━━━`);
  console.log(`Total formulary drugs available: ${patientWithFormulary.plan.formularyDrugs.length}`);
  console.log(`Formulary drugs:`, patientWithFormulary.plan.formularyDrugs.map(d => `${d.drugName} (generic: ${d.genericName}, tier: ${d.tier})`));

  // Normalize drug name to generic (or null if not on biologic)
  const genericDrugName = currentBiologic
    ? await normalizeToGeneric(currentBiologic.drugName)
    : null;

  console.log(`\nLooking for current biologic: "${currentBiologic?.drugName}"`);
  console.log(`Normalized to generic: "${genericDrugName}"`);

  // Find current drug in formulary (BRAND NAME FIRST, then generic fallback)
  // CRITICAL: Must prioritize exact brand match to avoid Humira matching to Amjevita
  const currentFormularyDrug = currentBiologic
    ? (() => {
        // Step 1: Try exact brand name match first
        const brandMatch = patientWithFormulary.plan.formularyDrugs.find(drug =>
          drug.drugName.toLowerCase() === currentBiologic.drugName.toLowerCase()
        );

        if (brandMatch) {
          console.log(`  ✓ Found EXACT brand match: ${brandMatch.drugName}`);
          return brandMatch;
        }

        // Step 2: Fall back to generic name match (for biosimilars)
        if (genericDrugName) {
          const genericMatch = patientWithFormulary.plan.formularyDrugs.find(drug =>
            drug.genericName.toLowerCase() === genericDrugName.toLowerCase() ||
            drug.genericName.toLowerCase().startsWith(genericDrugName.toLowerCase() + '-')
          );

          if (genericMatch) {
            console.log(`  ✓ Found generic match: ${genericMatch.drugName} (generic: ${genericMatch.genericName})`);
            return genericMatch;
          }
        }

        console.log(`  ✗ No match found for ${currentBiologic.drugName}`);
        return null;
      })()
    : null;

  console.log(`Found current drug in formulary:`, currentFormularyDrug ? `YES - ${currentFormularyDrug.drugName} Tier ${currentFormularyDrug.tier}` : 'NO');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Detect current dose reduction level (0%, 25%, or 50%)
  const currentDoseReduction = currentBiologic
    ? getDoseReductionLevel(currentBiologic.drugName, currentBiologic.frequency)
    : 0;
  console.log(`Current dose reduction level: ${currentDoseReduction}%`);

  // Find lowest tier available in formulary (relative tier detection)
  const indicatedDrugs = formularyDrugs.filter(drug =>
    filterByDiagnosis([drug], assessment.diagnosis).length > 0
  );
  const availableTiers = [...new Set(indicatedDrugs.map(d => d.tier))].sort((a, b) => a - b);
  const lowestTierInFormulary = availableTiers[0] || 999;
  const currentTier = currentFormularyDrug?.tier || 999;
  console.log(`Formulary tier structure: Available tiers = [${availableTiers.join(', ')}], Lowest = ${lowestTierInFormulary}, Current = ${currentTier}`);

  // Step 1: Determine quadrant using hard-coded rules (don't trust LLM for this)
  const { isStable, isFormularyOptimal, quadrant} = determineQuadrantAndStatus(
    assessment.dlqiScore,
    assessment.monthsStable,
    currentFormularyDrug || null,
    hasCurrentBiologic
  );
  console.log(`━━━━━━ QUADRANT DETERMINATION DEBUG ━━━━━━`);
  console.log(`Current biologic:`, currentBiologic?.drugName, currentBiologic?.dose, currentBiologic?.frequency);
  console.log(`Generic drug name:`, genericDrugName);
  console.log(`Current formulary drug found:`, currentFormularyDrug ? {
    drugName: currentFormularyDrug.drugName,
    genericName: currentFormularyDrug.genericName,
    tier: currentFormularyDrug.tier,
    requiresPA: currentFormularyDrug.requiresPA
  } : 'NULL - NOT FOUND IN FORMULARY');
  console.log(`Quadrant: ${quadrant}`);
  console.log(`isStable: ${isStable} (DLQI: ${assessment.dlqiScore}, months: ${assessment.monthsStable})`);
  console.log(`isFormularyOptimal: ${isFormularyOptimal} (Tier ${currentFormularyDrug?.tier}, PA: ${currentFormularyDrug?.requiresPA})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Step 2: Get LLM clinical reasoning
  const triage = await triagePatient(
    assessment,
    genericDrugName || 'None',
    currentFormularyDrug || null,
    quadrant,
    currentDoseReduction,
    lowestTierInFormulary,
    currentTier,
    availableTiers
  );
  console.log('Triage result:', JSON.stringify(triage));

  // Step 3: Retrieve structured clinical findings from database
  // Uses human-reviewed findings from ClinicalFinding table
  const evidence = await retrieveStructuredFindings(genericDrugName, assessment.diagnosis, triage);
  console.log(`Retrieved ${evidence.length} structured clinical findings for LLM context`);

  // Step 4: Filter drugs by diagnosis, then by contraindications
  const diagnosisAppropriateDrugs = filterByDiagnosis(patientWithFormulary.plan.formularyDrugs, assessment.diagnosis);
  const { safe: safeFormularyDrugs, contraindicated: contraindicatedDrugs } = checkDrugContraindications(
    diagnosisAppropriateDrugs,
    patient.contraindications
  );
  console.log(`Filtered formulary: ${patientWithFormulary.plan.formularyDrugs.length} total → ${diagnosisAppropriateDrugs.length} for ${assessment.diagnosis} → ${safeFormularyDrugs.length} safe, ${contraindicatedDrugs.length} contraindicated`);

  // Sort safe formulary drugs to prioritize lower tiers
  const sortedFormularyDrugs = [...safeFormularyDrugs].sort((a, b) => {
    // Sort by tier first (lower is better)
    if (a.tier !== b.tier) return a.tier - b.tier;
    // Then by PA requirement (no PA is better)
    if (a.requiresPA !== b.requiresPA) return a.requiresPA ? 1 : -1;
    // Then by cost (lower is better)
    const costA = a.annualCostWAC?.toNumber() || 0;
    const costB = b.annualCostWAC?.toNumber() || 0;
    return costA - costB;
  });

  // Step 4: LLM Recommendations
  const rawLlmRecs = await getLLMRecommendationSuggestions(
    assessment,
    genericDrugName,
    currentBiologic,
    triage,
    evidence,
    sortedFormularyDrugs,
    currentFormularyDrug || null,
    patient.contraindications,
    currentDoseReduction,
    lowestTierInFormulary,
    currentTier,
    availableTiers
  );

  // Deduplicate and validate recommendations
  // Filter out: duplicates, invalid drug names, unstable + dose reduction
  const seenDrugs = new Set<string>();
  const llmRecs = rawLlmRecs.filter(rec => {
    // Filter out placeholder/invalid drug names
    const invalidDrugNames = ['no tier 1', 'no tier 2', 'no tier', 'not available', 'none available'];
    if (rec.drugName && invalidDrugNames.some(invalid => rec.drugName!.toLowerCase().includes(invalid))) {
      console.log(`  ⚠️  Removing invalid placeholder recommendation: ${rec.drugName}`);
      return false;
    }

    // Filter out dose reduction for unstable patients (DLQI > 4)
    if (rec.type === 'DOSE_REDUCTION' && assessment.dlqiScore > 4) {
      console.log(`  ⚠️  Removing dose reduction for unstable patient (DLQI: ${assessment.dlqiScore})`);
      return false;
    }

    // Always include dose reduction and continue current (if valid)
    if (rec.type === 'DOSE_REDUCTION' || rec.type === 'CONTINUE_CURRENT') {
      return true;
    }

    // Check for duplicates
    const drugKey = rec.drugName?.toLowerCase();
    if (!drugKey || seenDrugs.has(drugKey)) {
      console.log(`  ℹ️  Removing duplicate recommendation for: ${rec.drugName}`);
      return false;
    }
    seenDrugs.add(drugKey);
    return true;
  });

  console.log(`LLM generated ${rawLlmRecs.length} recommendations, kept ${llmRecs.length} after validation`);

  // Step 5: Add cost calculations and attach structured evidence
  // Evidence comes from ClinicalFinding database table (human-reviewed findings)
  const recommendations = await Promise.all(llmRecs.map(async rec => {
    const targetDrug = rec.drugName
      ? patientWithFormulary.plan.formularyDrugs.find(d => d.drugName.toLowerCase() === rec.drugName?.toLowerCase()) ?? null
      : null;

    const costData = calculateCostSavings(rec, currentFormularyDrug, targetDrug);

    // For dose reduction and continue current, display the BRAND name (Humira) not generic (adalimumab)
    // since Amjevita, Hyrimoz, and Humira are all adalimumab but different products
    const displayDrugName = (rec.type === 'DOSE_REDUCTION' || rec.type === 'CONTINUE_CURRENT' || rec.type === 'OPTIMIZE_CURRENT') && currentBiologic
      ? currentBiologic.drugName  // Brand name: "Humira"
      : rec.drugName || genericDrugName;  // For switches, use target drug

    // Get FDA-approved dosing if LLM didn't provide specific dosing or used "Per label"
    let finalDose = rec.newDose || '';
    let finalFrequency = rec.newFrequency || '';

    // If LLM returned generic "Per label" or empty, use our reference
    const needsDosingReference = !finalDose || !finalFrequency ||
                                  finalDose.toLowerCase().includes('per label') ||
                                  finalFrequency.toLowerCase().includes('per label');

    if (needsDosingReference && rec.type !== 'DOSE_REDUCTION' && displayDrugName) {
      // For switches, use FDA-approved dosing reference
      const standardDosing = getSpecificDrugDosing(displayDrugName);
      finalDose = standardDosing.dose;
      finalFrequency = standardDosing.frequency;
    }

    return {
      rank: rec.rank,
      type: rec.type,
      drugName: displayDrugName,
      newDose: finalDose,
      newFrequency: finalFrequency,
      ...costData,
      rationale: rec.rationale,
      evidenceSources: evidence, // Use structured clinical findings from database
      monitoringPlan: rec.monitoringPlan,
      // For DOSE_REDUCTION, use current drug's tier (no target drug, staying on same medication)
      // For switches, use target drug's tier
      tier: rec.type === 'DOSE_REDUCTION'
        ? currentFormularyDrug?.tier
        : (targetDrug?.tier || currentFormularyDrug?.tier),
      // Convert string requiresPA to boolean (FormularyDrug uses String, Recommendation uses Boolean)
      requiresPA: rec.type === 'DOSE_REDUCTION'
        ? convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA)
        : convertRequiresPAToBoolean(targetDrug?.requiresPA || currentFormularyDrug?.requiresPA),
      contraindicated: false, // LLM should handle contraindications in rationale
      contraindicationReason: undefined,
    };
  }));

  // Create complete formulary reference (all safe drugs sorted by tier)
  const formularyReference = sortedFormularyDrugs.map(drug => ({
    drugName: drug.drugName,
    genericName: drug.genericName || drug.drugName,
    drugClass: drug.drugClass,
    tier: drug.tier,
    requiresPA: drug.requiresPA,
    standardDosing: getDrugStandardDosing(drug.drugClass),
    annualCost: drug.annualCostWAC?.toNumber(),
  }));

  // Format contraindicated drugs for UI
  const contraindicatedDrugsFormatted = contraindicatedDrugs.map(ci => ({
    drugName: ci.drug.drugName,
    drugClass: ci.drug.drugClass,
    tier: ci.drug.tier,
    requiresPA: ci.drug.requiresPA,
    annualCost: ci.drug.annualCostWAC?.toNumber() || null,
    reasons: ci.reasons,
  }));

  return {
    isStable,
    isFormularyOptimal,
    quadrant,
    recommendations: recommendations.slice(0, 3),
    formularyReference,
    contraindicatedDrugs: contraindicatedDrugsFormatted,
  };
}

/**
 * Helper: Get standard FDA-approved dosing for specific biologics
 */
function getSpecificDrugDosing(drugName: string): { dose: string; frequency: string } {
  const normalizedName = drugName.toLowerCase();

  // TNF Inhibitors (Adalimumab biosimilars and originator)
  if (normalizedName.includes('humira') || normalizedName.includes('adalimumab') ||
      normalizedName.includes('amjevita') || normalizedName.includes('hyrimoz') ||
      normalizedName.includes('cyltezo') || normalizedName.includes('hadlima') ||
      normalizedName.includes('abrilada') || normalizedName.includes('yusimry')) {
    return {
      dose: '80 mg initial dose, then 40 mg',
      frequency: 'every 2 weeks starting 1 week after initial dose'
    };
  }

  if (normalizedName.includes('enbrel') || normalizedName.includes('etanercept')) {
    return {
      dose: '50 mg',
      frequency: 'twice weekly for 3 months, then once weekly (or 50 mg twice weekly may continue)'
    };
  }

  if (normalizedName.includes('cimzia') || normalizedName.includes('certolizumab')) {
    return {
      dose: '400 mg (given as two 200 mg injections)',
      frequency: 'every 2 weeks, or 400 mg at weeks 0, 2, 4, then every 4 weeks'
    };
  }

  // IL-17 Inhibitors
  if (normalizedName.includes('cosentyx') || normalizedName.includes('secukinumab')) {
    return {
      dose: '300 mg',
      frequency: 'at weeks 0, 1, 2, 3, 4, then every 4 weeks'
    };
  }

  if (normalizedName.includes('taltz') || normalizedName.includes('ixekizumab')) {
    return {
      dose: '160 mg initial dose (two 80 mg injections), then 80 mg',
      frequency: 'every 2 weeks for weeks 2, 4, 6, 8, 10, 12, then every 4 weeks'
    };
  }

  if (normalizedName.includes('siliq') || normalizedName.includes('brodalumab')) {
    return {
      dose: '210 mg',
      frequency: 'at weeks 0, 1, 2, then every 2 weeks'
    };
  }

  // IL-23 Inhibitors
  if (normalizedName.includes('tremfya') || normalizedName.includes('guselkumab')) {
    return {
      dose: '100 mg',
      frequency: 'at weeks 0, 4, then every 8 weeks'
    };
  }

  if (normalizedName.includes('skyrizi') || normalizedName.includes('risankizumab')) {
    return {
      dose: '150 mg (two 75 mg injections)',
      frequency: 'at weeks 0, 4, then every 12 weeks'
    };
  }

  if (normalizedName.includes('ilumya') || normalizedName.includes('tildrakizumab')) {
    return {
      dose: '100 mg',
      frequency: 'at weeks 0, 4, then every 12 weeks'
    };
  }

  // IL-12/23 Inhibitor
  if (normalizedName.includes('stelara') || normalizedName.includes('ustekinumab')) {
    return {
      dose: '45 mg (for patients ≤100 kg) or 90 mg (for patients >100 kg)',
      frequency: 'at weeks 0, 4, then every 12 weeks'
    };
  }

  // IL-4/13 Inhibitor (Atopic Dermatitis)
  if (normalizedName.includes('dupixent') || normalizedName.includes('dupilumab')) {
    return {
      dose: '600 mg loading dose (two 300 mg injections), then 300 mg',
      frequency: 'every 2 weeks'
    };
  }

  // JAK Inhibitors
  if (normalizedName.includes('rinvoq') || normalizedName.includes('upadacitinib')) {
    return {
      dose: '15 mg orally once daily',
      frequency: 'daily (may increase to 30 mg for inadequate response)'
    };
  }

  if (normalizedName.includes('cibinqo') || normalizedName.includes('abrocitinib')) {
    return {
      dose: '100 mg orally once daily',
      frequency: 'daily (may adjust to 200 mg or 50 mg based on response)'
    };
  }

  if (normalizedName.includes('sotyktu') || normalizedName.includes('deucravacitinib')) {
    return {
      dose: '6 mg orally once daily',
      frequency: 'daily'
    };
  }

  // IL-13 Inhibitor
  if (normalizedName.includes('adbry') || normalizedName.includes('tralokinumab')) {
    return {
      dose: '600 mg loading dose (four 150 mg injections), then 300 mg',
      frequency: 'every 2 weeks (may extend to every 4 weeks after 16 weeks if clear/almost clear)'
    };
  }

  // Default fallback
  return {
    dose: 'Per FDA label',
    frequency: 'Per FDA label'
  };
}

/**
 * Helper: Get standard dosing for drug classes (deprecated, use getSpecificDrugDosing)
 */
function getDrugStandardDosing(drugClass: string): string {
  const dosingMap: Record<string, string> = {
    'TNF_INHIBITOR': 'Per label (varies by drug)',
    'IL17_INHIBITOR': 'Per label (varies by drug)',
    'IL23_INHIBITOR': 'Per label (varies by drug)',
    'IL12_23_INHIBITOR': 'Per label (varies by drug)',
    'JAK_INHIBITOR': 'Per label (varies by drug)',
    'OTHER': 'Per label',
  };
  return dosingMap[drugClass] || 'Per label';
}
