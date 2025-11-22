import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './db';
import {
  Patient,
  CurrentBiologic,
  PharmacyClaim,
  FormularyDrug,
  InsurancePlan,
  Contraindication,
  ContraindicationType,
  RecommendationType,
  DiagnosisType,
} from '@prisma/client';
import { searchKnowledge } from './rag/embeddings';

// Lazy initialization for Anthropic client
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
 * Convert string requiresPA value to boolean
 * FormularyDrug stores as String ("Yes", "No", "N/A", "Unknown")
 * Recommendation stores as Boolean
 */
function convertRequiresPAToBoolean(requiresPA: string | null | undefined): boolean {
  return requiresPA === 'Yes';
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
    // Unknown drug, assume standard dosing
    return 0;
  }

  // Parse current frequency to extract interval
  const frequencyLower = currentFrequency.toLowerCase();

  // Extract number from frequency string (e.g., "Every 12 weeks" -> 12)
  const intervalMatch = frequencyLower.match(/every\s+(\d+)\s+(week|day)/);
  if (!intervalMatch) {
    // Can't parse, assume standard
    return 0;
  }

  const currentInterval = parseInt(intervalMatch[1]);
  const currentUnit = intervalMatch[2].includes('week') ? 'weeks' : 'days';

  // Must match units
  if (currentUnit !== standardDosing.unit) {
    return 0;
  }

  const standardInterval = standardDosing.interval;

  // Calculate extension ratio
  // If standard is 12 weeks and current is 16 weeks: 16/12 = 1.33 = ~25% reduction
  // If standard is 12 weeks and current is 24 weeks: 24/12 = 2.0 = 50% reduction
  const extensionRatio = currentInterval / standardInterval;

  if (extensionRatio <= 1.15) {
    // Within 15% of standard, consider it standard dosing
    return 0;
  } else if (extensionRatio <= 1.6) {
    // 16%-60% extension ≈ 25% dose reduction
    return 25;
  } else {
    // >60% extension ≈ 50% dose reduction
    return 50;
  }
}

/**
 * Rank drugs within same tier by clinical efficacy for specific patient
 * Uses LLM to intelligently prioritize based on comorbidities, literature, and patient factors
 */
async function rankDrugsByEfficacyLLM(
  drugs: FormularyDrug[],
  patient: {
    diagnosis: DiagnosisType;
    hasPsoriaticArthritis: boolean;
    contraindications: Contraindication[];
    currentDrug: string;
    dlqiScore: number;
    monthsStable: number;
    additionalNotes?: string;
  }
): Promise<Array<FormularyDrug & { llmRanking: { rank: number; reasoning: string; keyFactors: string[] } }>> {

  // If ANTHROPIC_API_KEY not available, return drugs in original order
  if (!process.env.ANTHROPIC_API_KEY) {
    return drugs.map((drug, index) => ({
      ...drug,
      llmRanking: {
        rank: index + 1,
        reasoning: 'LLM ranking unavailable - using formulary order',
        keyFactors: []
      }
    }));
  }

  try {
    const anthropic = getAnthropic();

    const drugsDescription = drugs.map(d =>
      `- ${d.drugName} (${d.genericName || d.drugName}): ${d.drugClass.replace(/_/g, ' ')}, Tier ${d.tier}`
    ).join('\n');

    const contraindicationsText = patient.contraindications.length > 0
      ? patient.contraindications.map(c => c.type).join(', ')
      : 'None documented';

    const prompt = `You are a clinical expert in dermatology and rheumatology, specializing in psoriasis and psoriatic arthritis treatment.

PATIENT PROFILE:
- Primary Diagnosis: ${patient.diagnosis}
- Psoriatic Arthritis: ${patient.hasPsoriaticArthritis ? 'Yes' : 'No'}
- Current Treatment: ${patient.currentDrug}
- Disease Control: DLQI ${patient.dlqiScore}, stable for ${patient.monthsStable} months
- Documented Contraindications: ${contraindicationsText}
- Additional Clinical Notes: ${patient.additionalNotes || 'None'}

TASK: Rank these SAME-TIER biologics by expected clinical efficacy for THIS specific patient:

${drugsDescription}

CONSIDERATIONS:
1. **Comorbidities from clinical notes**: Parse the additional notes for conditions like:
   - Atopic dermatitis + asthma → Dupixent preferred (dual indication)
   - Atopic dermatitis + psoriasis → JAK inhibitor may be preferred
   - Inflammatory bowel disease → Avoid IL-17 inhibitors
   - Psoriatic arthritis → Prefer agents with dual indication (TNF, IL-17, IL-23)

2. **Literature-based efficacy**: Consider comparative effectiveness data for ${patient.diagnosis}
   - PASI 90/100 response rates
   - Speed of response
   - Durability of response

3. **Mechanism of action**: Which class is most appropriate for this patient's profile?

4. **Safety and tolerability**: Given patient's history and contraindications

Return ONLY valid JSON (no markdown, no code blocks):
{
  "rankings": [
    {
      "drugName": "exact drug name from list",
      "rank": 1,
      "reasoning": "concise clinical rationale for why this is optimal",
      "keyFactors": ["factor1", "factor2"]
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse JSON response
    const jsonText = content.text.trim();
    const parsed = JSON.parse(jsonText);

    // Map rankings back to drugs
    const rankedDrugs = drugs.map(drug => {
      const ranking = parsed.rankings.find((r: any) =>
        r.drugName === drug.drugName ||
        r.drugName === drug.genericName
      );

      return {
        ...drug,
        llmRanking: ranking || {
          rank: 999,
          reasoning: 'No ranking provided',
          keyFactors: []
        }
      };
    });

    // Sort by LLM rank
    return rankedDrugs.sort((a, b) => a.llmRanking.rank - b.llmRanking.rank);

  } catch (error) {
    console.error('Error in LLM drug ranking:', error);
    // Fallback to original order
    return drugs.map((drug, index) => ({
      ...drug,
      llmRanking: {
        rank: index + 1,
        reasoning: 'LLM ranking failed - using formulary order',
        keyFactors: []
      }
    }));
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

export interface PatientWithData extends Patient {
  currentBiologics: CurrentBiologic[];
  claims: PharmacyClaim[];
  contraindications: Contraindication[];
  plan: InsurancePlan & {
    formularyDrugs: FormularyDrug[];
  };
}

export interface RecommendationOutput {
  rank: number;
  type: RecommendationType;
  drugName: string;
  newDose?: string;
  newFrequency?: string;
  currentAnnualCost?: number;
  recommendedAnnualCost?: number;
  annualSavings?: number;
  savingsPercent?: number;
  currentMonthlyOOP?: number;
  recommendedMonthlyOOP?: number;
  rationale: string;
  evidenceSources: string[];
  monitoringPlan?: string;
  tier?: number;
  requiresPA?: boolean;
  contraindicated: boolean;
  contraindicationReason?: string;
}

/**
 * Calculate assumed costs based on tier (since we don't have actual cost data)
 * Returns null if we cannot make assumptions
 */
export function calculateAssumedCosts(
  currentTier: number | undefined,
  recommendedTier: number | undefined,
  doseReductionPercent?: number
): {
  currentAnnualCost?: number;
  recommendedAnnualCost?: number;
  annualSavings?: number;
  savingsPercent?: number;
} | null {
  // For tier-based switching
  if (currentTier && recommendedTier && currentTier > recommendedTier) {
    // Assume significant savings for tier reduction
    // Tier 1 = ~$50k, Tier 2 = ~$70k, Tier 3 = ~$90k, Tier 4 = ~$100k (rough estimates)
    const tierCosts = { 1: 50000, 2: 70000, 3: 90000, 4: 100000, 5: 0 };
    const currentCost = tierCosts[currentTier as keyof typeof tierCosts] || 80000;
    const recommendedCost = tierCosts[recommendedTier as keyof typeof tierCosts] || 50000;
    const savings = currentCost - recommendedCost;
    const savingsPercent = (savings / currentCost) * 100;

    return {
      currentAnnualCost: currentCost,
      recommendedAnnualCost: recommendedCost,
      annualSavings: savings,
      savingsPercent: savingsPercent,
    };
  }

  // For dose reduction
  if (doseReductionPercent && currentTier) {
    const tierCosts = { 1: 50000, 2: 70000, 3: 90000, 4: 100000, 5: 0 };
    const currentCost = tierCosts[currentTier as keyof typeof tierCosts] || 80000;
    const recommendedCost = currentCost * (1 - doseReductionPercent / 100);
    const savings = currentCost - recommendedCost;

    return {
      currentAnnualCost: currentCost,
      recommendedAnnualCost: recommendedCost,
      annualSavings: savings,
      savingsPercent: doseReductionPercent,
    };
  }

  return null;
}

/**
 * Determine if patient is stable based on DLQI and duration
 * DLQI 0-4 = minimal to mild effect on patient's life (stable)
 * Patient must be stable for >= 6 months before considering therapy optimization
 */
export function determineStability(dlqiScore: number, monthsStable: number): boolean {
  // Stable if DLQI <= 4 (minimal to mild effect on life) and stable for >= 6 months
  return dlqiScore <= 4 && monthsStable >= 6;
}

/**
 * Check if patient is stable but for insufficient duration
 * These patients should continue current therapy, not optimize yet
 */
export function isStableShortDuration(dlqiScore: number, monthsStable: number): boolean {
  return dlqiScore <= 4 && monthsStable < 6;
}

/**
 * Determine if current medication is formulary-optimal
 * ONLY Tier 1 without PA is truly optimal
 * Tier 2 = acceptable but room for improvement
 * Tier 3+ = always suboptimal, requires switch
 */
export function determineFormularyStatus(
  currentDrug: FormularyDrug | null
): boolean {
  if (!currentDrug) return false;
  // Optimal ONLY if Tier 1 and no PA required
  // Tier 2-5 are always suboptimal (cost optimization opportunities exist)
  const paRequired = currentDrug.requiresPA && currentDrug.requiresPA !== 'No' && currentDrug.requiresPA !== 'N/A';
  return currentDrug.tier === 1 && !paRequired;
}

/**
 * Get quadrant classification
 */
export function getQuadrant(isStable: boolean, isFormularyOptimal: boolean): string {
  if (isStable && isFormularyOptimal) return 'stable_formulary_aligned';
  if (isStable && !isFormularyOptimal) return 'stable_non_formulary';
  if (!isStable && isFormularyOptimal) return 'unstable_formulary_aligned';
  return 'unstable_non_formulary';
}

/**
 * Check if a drug is approved for a patient's diagnosis
 */
export function isDrugIndicatedForDiagnosis(
  drug: FormularyDrug,
  diagnosis: DiagnosisType
): boolean {
  // If no indications specified, assume it's available for all (for backward compatibility)
  if (!drug.fdaIndications || drug.fdaIndications.length === 0) {
    return true;
  }

  // Check if the diagnosis is in the FDA indications list
  return drug.fdaIndications.includes(diagnosis);
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
 * Comprehensive contraindication checking for decision-engine-fallback
 * Returns both safe and contraindicated drugs with reasons and severity
 * Duplicated from llm-decision-engine.ts for consistency
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
    const hasAbsoluteContraindication = reasons.some(r => r.severity === 'ABSOLUTE');

    if (reasons.length === 0) {
      safe.push(drug);
    } else if (hasAbsoluteContraindication) {
      contraindicated.push({ drug, reasons });
      console.log(`  ⚠️  ABSOLUTE contraindication: ${drug.drugName} - ${reasons.filter(r => r.severity === 'ABSOLUTE').map(r => r.type).join(', ')}`);
    } else {
      contraindicated.push({ drug, reasons });
      console.log(`  ⚠️  RELATIVE contraindication: ${drug.drugName} - ${reasons.map(r => r.type).join(', ')}`);
    }
  }

  console.log(`Contraindication filtering: ${drugs.length} total → ${safe.length} safe, ${contraindicated.length} contraindicated`);

  return { safe, contraindicated };
}

/**
 * Legacy simple contraindication check - for backward compatibility
 * Use checkDrugContraindications() for comprehensive tracking
 */
export function checkContraindications(
  drug: FormularyDrug,
  contraindications: Contraindication[]
): { contraindicated: boolean; reason?: string } {
  const result = checkDrugContraindications([drug], contraindications);
  if (result.contraindicated.length > 0) {
    const absoluteReasons = result.contraindicated[0].reasons.filter(r => r.severity === 'ABSOLUTE');
    if (absoluteReasons.length > 0) {
      return { contraindicated: true, reason: absoluteReasons[0].reason };
    }
    return { contraindicated: true, reason: result.contraindicated[0].reasons[0].reason };
  }
  return { contraindicated: false };
}

/**
 * Generate recommendations based on quadrant
 */
export async function generateRecommendations(
  assessment: AssessmentInput
): Promise<{
  isStable: boolean;
  isFormularyOptimal: boolean;
  quadrant: string;
  recommendations: RecommendationOutput[];
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

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Get the most recent formulary upload for this plan
  const mostRecentUpload = patient.planId ? await prisma.uploadLog.findFirst({
    where: {
      uploadType: 'FORMULARY',
      planId: patient.planId,
    },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true },
  }) : null;

  // Fetch formulary drugs from the most recent upload only
  const formularyDrugs = mostRecentUpload && patient.planId
    ? await prisma.formularyDrug.findMany({
        where: {
          planId: patient.planId,
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
  } as PatientWithData;

  const currentBiologic = patientWithFormulary.currentBiologics[0]; // For MVP, assume one biologic
  if (!currentBiologic) {
    throw new Error('No current biologic found for patient');
  }

  // Find current drug in formulary (match by brand name OR generic name for biosimilars)
  const currentFormularyDrug = patientWithFormulary.plan.formularyDrugs.find(drug => {
    const brandMatch = drug.drugName.toLowerCase() === currentBiologic.drugName.toLowerCase();
    // Also check generic name to catch biosimilars (e.g., Amjevita = adalimumab-atto)
    const genericMatch = drug.genericName.toLowerCase() === currentBiologic.drugName.toLowerCase() ||
                        drug.genericName.toLowerCase().startsWith(currentBiologic.drugName.toLowerCase() + '-');
    return brandMatch || genericMatch;
  });

  // Detect current dose reduction level (0%, 25%, or 50%)
  const currentDoseReduction = getDoseReductionLevel(
    currentBiologic.drugName,
    currentBiologic.frequency
  );

  // Find drugs indicated for diagnosis
  const diagnosisAppropriateDrugs = patientWithFormulary.plan.formularyDrugs.filter(drug =>
    isDrugIndicatedForDiagnosis(drug, assessment.diagnosis)
  );

  // Check contraindications and track both safe and contraindicated drugs
  const { safe: indicatedDrugs, contraindicated: contraindicatedDrugs } = checkDrugContraindications(
    diagnosisAppropriateDrugs,
    patientWithFormulary.contraindications
  );
  console.log(`Diagnosis-appropriate drugs: ${diagnosisAppropriateDrugs.length} total → ${indicatedDrugs.length} safe, ${contraindicatedDrugs.length} contraindicated`);

  // Use safe drugs for tier analysis (contraindicated drugs will be available in UI toggle)
  const availableTiers = [...new Set(indicatedDrugs.map(d => d.tier))].sort((a, b) => a - b);
  const lowestTierInFormulary = availableTiers[0] || 999;
  const currentTier = currentFormularyDrug?.tier || 999;

  // Check for stable but insufficient duration - special case
  // CAN switch tiers, but CANNOT dose reduce yet (need 6 months)
  if (isStableShortDuration(assessment.dlqiScore, assessment.monthsStable)) {
    const monthsNeeded = 6 - assessment.monthsStable;
    const recommendations: RecommendationOutput[] = [];

    // Priority: Switch to lower tiers first (cost savings without dose reduction risk)
    if (currentTier > lowestTierInFormulary) {
      // Get all lower-tier alternatives, use LLM to rank within each tier
      for (const tier of availableTiers) {
        if (tier < currentTier && recommendations.length < 2) {
          const drugsInTier = indicatedDrugs.filter(d =>
            d.tier === tier &&
            !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
          );

          if (drugsInTier.length > 0) {
            // Use LLM ranking for within-tier selection
            const rankedDrugs = await rankDrugsByEfficacyLLM(drugsInTier, {
              diagnosis: assessment.diagnosis,
              hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
              contraindications: patientWithFormulary.contraindications,
              currentDrug: currentBiologic.drugName,
              dlqiScore: assessment.dlqiScore,
              monthsStable: assessment.monthsStable,
              additionalNotes: assessment.additionalNotes
            });

            for (const drug of rankedDrugs.slice(0, 2 - recommendations.length)) {
              const tierSavings = calculateAssumedCosts(currentTier, drug.tier);
              recommendations.push({
                rank: recommendations.length + 1,
                type: 'SWITCH_TO_PREFERRED',
                drugName: drug.drugName,
                newDose: currentBiologic.dose,
                newFrequency: currentBiologic.frequency,
                ...tierSavings,
                rationale: `Switch to Tier ${drug.tier} ${drug.drugClass.replace(/_/g, ' ')}. Patient stable (DLQI ${assessment.dlqiScore}, ${assessment.monthsStable} months). ${drug.llmRanking.reasoning}`,
                evidenceSources: [],
                monitoringPlan: `Assess DLQI at 12-16 weeks post-switch. Patient stable for ${assessment.monthsStable} months - not yet at 6-month threshold for dose reduction consideration.`,
                tier: drug.tier,
                requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
                contraindicated: false,
              });
            }
          }
        }
      }
    }

    // Fill remaining slots with Continue Current
    if (recommendations.length < 3) {
      recommendations.push({
        rank: recommendations.length + 1,
        type: 'CONTINUE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `${recommendations.length === 0 ? 'Patient on lowest formulary tier. ' : ''}Continue current therapy for ${monthsNeeded} more months to reach 6-month stability threshold. Dose reduction will be considered after sustained stability is confirmed.`,
        evidenceSources: [],
        monitoringPlan: `Monitor DLQI monthly. Re-assess at ${assessment.monthsStable + monthsNeeded} months for dose reduction opportunities once 6-month threshold is met.`,
        tier: currentFormularyDrug?.tier,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    }

    // Fill to 3 recommendations if needed
    if (recommendations.length < 3 && currentTier > lowestTierInFormulary) {
      const sameTierDrugs = indicatedDrugs.filter(d =>
        d.tier === currentTier &&
        d.drugName !== currentBiologic.drugName &&
        !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
      );

      if (sameTierDrugs.length > 0) {
        const rankedDrugs = await rankDrugsByEfficacyLLM(sameTierDrugs, {
          diagnosis: assessment.diagnosis,
          hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
          contraindications: patientWithFormulary.contraindications,
          currentDrug: currentBiologic.drugName,
          dlqiScore: assessment.dlqiScore,
          monthsStable: assessment.monthsStable,
          additionalNotes: assessment.additionalNotes
        });

        const drug = rankedDrugs[0];
        recommendations.push({
          rank: recommendations.length + 1,
          type: 'SWITCH_TO_PREFERRED',
          drugName: drug.drugName,
          newDose: currentBiologic.dose,
          newFrequency: currentBiologic.frequency,
          rationale: `Alternative in same tier: ${drug.llmRanking.reasoning}`,
          evidenceSources: [],
          monitoringPlan: 'Assess DLQI at 12-16 weeks post-switch.',
          tier: drug.tier,
          requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
          contraindicated: false,
        });
      }
    }

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
      isStable: true, // Patient IS stable, just not for long enough
      isFormularyOptimal: currentTier === lowestTierInFormulary,
      quadrant: 'stable_short_duration',
      recommendations: recommendations.slice(0, 3),
      contraindicatedDrugs: contraindicatedDrugsFormatted,
    };
  }

  // Determine stability and formulary status
  const isStable = determineStability(assessment.dlqiScore, assessment.monthsStable);
  const isFormularyOptimal = determineFormularyStatus(currentFormularyDrug || null);
  const quadrant = getQuadrant(isStable, isFormularyOptimal);

  // NOTE: RAG evidence retrieval happens ONLY for dose reduction recommendations
  // Switches (formulary or therapeutic) don't need RAG - business case or standard practice

  // Generate recommendations based on quadrant
  const recommendations: RecommendationOutput[] = [];

  if (quadrant === 'stable_non_formulary') {
    // COMPREHENSIVE TIER CASCADE with LLM ranking
    // Priority: Lowest tier → Next tier → ... → Current tier (dose reduce) → Higher tiers (last resort)

    // Cascade through tiers from lowest to current
    for (const tier of availableTiers) {
      if (recommendations.length >= 3) break;

      if (tier < currentTier) {
        // Lower tier: Add switch recommendations with LLM ranking
        const drugsInTier = indicatedDrugs.filter(d =>
          d.tier === tier &&
          !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
        );

        if (drugsInTier.length > 0) {
          const rankedDrugs = await rankDrugsByEfficacyLLM(drugsInTier, {
            diagnosis: assessment.diagnosis,
            hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
            contraindications: patientWithFormulary.contraindications,
            currentDrug: currentBiologic.drugName,
            dlqiScore: assessment.dlqiScore,
            monthsStable: assessment.monthsStable,
            additionalNotes: assessment.additionalNotes
          });

          for (const drug of rankedDrugs.slice(0, Math.min(2, 3 - recommendations.length))) {
            const tierSavings = calculateAssumedCosts(currentTier, drug.tier);
            recommendations.push({
              rank: recommendations.length + 1,
              type: 'SWITCH_TO_PREFERRED',
              drugName: drug.drugName,
              newDose: currentBiologic.dose,
              newFrequency: currentBiologic.frequency,
              ...tierSavings,
              rationale: `Switch to Tier ${drug.tier} ${drug.drugClass.replace(/_/g, ' ')}. ${drug.llmRanking.reasoning} Patient stable (DLQI=${assessment.dlqiScore}) for ${assessment.monthsStable} months - excellent likelihood of successful transition.`,
              evidenceSources: [],
              monitoringPlan: 'Assess DLQI at 12-16 weeks post-switch to confirm maintenance of disease control. Monitor for injection site reactions, infections, and any signs of disease flare. If DLQI remains ≤4 at 6 months on standard dosing, consider future dose reduction strategies.',
              tier: drug.tier,
              requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
              contraindicated: false,
            });
          }
        }
      } else if (tier === currentTier && recommendations.length < 3) {
        // Current tier: Offer dose reduction if on standard dosing
        if (currentDoseReduction < 50) {
          const nextReduction = currentDoseReduction + 25;
          const doseReductionEvidence = await searchKnowledge(
            `${currentBiologic.drugName} dose reduction interval extension ${assessment.diagnosis} stable patients`,
            { minSimilarity: 0.65, maxResults: 10 }
          );

          const doseSavings = calculateAssumedCosts(currentTier, currentTier, 25);
          const evidenceNote = doseReductionEvidence.length === 0
            ? ' Limited clinical evidence available for dose reduction.'
            : '';

          recommendations.push({
            rank: recommendations.length + 1,
            type: 'DOSE_REDUCTION',
            drugName: currentBiologic.drugName,
            newDose: currentBiologic.dose,
            newFrequency: `Extended interval to achieve ${nextReduction}% dose reduction`,
            ...doseSavings,
            rationale: `Dose reduction of current ${currentBiologic.drugName} from ${currentDoseReduction}% to ${nextReduction}% reduction. Patient stable (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months.${evidenceNote}`,
            evidenceSources: doseReductionEvidence.map((e: any) => e.title),
            monitoringPlan: 'Close monitoring required. Assess DLQI monthly for first 3 months, then quarterly. Be prepared to resume previous dosing if disease activity increases.',
            tier: currentTier,
            requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
            contraindicated: false,
          });
        }
      }
    }

    // If still need recommendations, cascade to higher tiers (last resort)
    if (recommendations.length < 3) {
      for (const tier of availableTiers.filter(t => t > currentTier)) {
        if (recommendations.length >= 3) break;

        const drugsInTier = indicatedDrugs.filter(d =>
          d.tier === tier &&
          !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
        );

        if (drugsInTier.length > 0) {
          const rankedDrugs = await rankDrugsByEfficacyLLM(drugsInTier, {
            diagnosis: assessment.diagnosis,
            hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
            contraindications: patientWithFormulary.contraindications,
            currentDrug: currentBiologic.drugName,
            dlqiScore: assessment.dlqiScore,
            monthsStable: assessment.monthsStable,
            additionalNotes: assessment.additionalNotes
          });

          for (const drug of rankedDrugs.slice(0, 3 - recommendations.length)) {
            const tierSavings = calculateAssumedCosts(currentTier, drug.tier);
            recommendations.push({
              rank: recommendations.length + 1,
              type: 'SWITCH_TO_PREFERRED',
              drugName: drug.drugName,
              newDose: currentBiologic.dose,
              newFrequency: currentBiologic.frequency,
              ...tierSavings,
              rationale: `Tier ${drug.tier} option (less preferred): ${drug.llmRanking.reasoning}`,
              evidenceSources: [],
              monitoringPlan: 'Assess DLQI at 12-16 weeks post-switch. Monitor closely for efficacy and safety.',
              tier: drug.tier,
              requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
              contraindicated: false,
            });
          }
        }
      }
    }
  } else if (quadrant === 'stable_formulary_aligned') {
    // On lowest tier + stable: 3 scenarios based on current dose reduction level
    const doseReductionEvidence = await searchKnowledge(
      `${currentBiologic.drugName} dose reduction interval extension ${assessment.diagnosis} stable patients`,
      { minSimilarity: 0.65, maxResults: 10 }
    );
    const evidenceNote = doseReductionEvidence.length === 0 ? 'Limited clinical evidence available.' : '';

    if (currentDoseReduction === 0) {
      // SCENARIO 1: On standard dosing
      // 1. Dose reduce to 25%
      const doseSavings25 = calculateAssumedCosts(lowestTierInFormulary, lowestTierInFormulary, 25);
      recommendations.push({
        rank: 1,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Extended interval (25% dose reduction)',
        ...doseSavings25,
        rationale: `Dose reduction to 25%. Patient stable (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months on lowest tier. ${evidenceNote}`,
        evidenceSources: doseReductionEvidence.map((e: any) => e.title),
        monitoringPlan: 'Close monitoring. Assess DLQI monthly for 3 months, then quarterly. Resume standard if disease activity increases.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // 2. Continue current standard
      recommendations.push({
        rank: 2,
        type: 'CONTINUE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `Continue standard dosing. Patient stable and on lowest tier - dose reduction offers cost savings but continuing provides certainty.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // 3. Alternative in same tier OR next tier
      const sameTierAlternatives = indicatedDrugs.filter(d =>
        d.tier === lowestTierInFormulary &&
        d.drugName !== currentBiologic.drugName &&
        !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
      );

      if (sameTierAlternatives.length > 0) {
        const rankedDrugs = await rankDrugsByEfficacyLLM(sameTierAlternatives, {
          diagnosis: assessment.diagnosis,
          hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
          contraindications: patientWithFormulary.contraindications,
          currentDrug: currentBiologic.drugName,
          dlqiScore: assessment.dlqiScore,
          monthsStable: assessment.monthsStable,
          additionalNotes: assessment.additionalNotes
        });

        const drug = rankedDrugs[0];
        recommendations.push({
          rank: 3,
          type: 'SWITCH_TO_PREFERRED',
          drugName: drug.drugName,
          newDose: currentBiologic.dose,
          newFrequency: currentBiologic.frequency,
          rationale: `Alternative in same tier: ${drug.llmRanking.reasoning}`,
          evidenceSources: [],
          monitoringPlan: 'Assess DLQI at 12-16 weeks post-switch.',
          tier: lowestTierInFormulary,
          requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
          contraindicated: false,
        });
      } else if (availableTiers.length > 1) {
        // Next tier up
        const nextTier = availableTiers[1];
        const nextTierDrugs = indicatedDrugs.filter(d =>
          d.tier === nextTier &&
          !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
        );

        if (nextTierDrugs.length > 0) {
          const rankedDrugs = await rankDrugsByEfficacyLLM(nextTierDrugs.slice(0, 1), {
            diagnosis: assessment.diagnosis,
            hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
            contraindications: patientWithFormulary.contraindications,
            currentDrug: currentBiologic.drugName,
            dlqiScore: assessment.dlqiScore,
            monthsStable: assessment.monthsStable,
            additionalNotes: assessment.additionalNotes
          });

          const drug = rankedDrugs[0];
          const tierSavings = calculateAssumedCosts(lowestTierInFormulary, nextTier);
          recommendations.push({
            rank: 3,
            type: 'SWITCH_TO_PREFERRED',
            drugName: drug.drugName,
            newDose: currentBiologic.dose,
            newFrequency: currentBiologic.frequency,
            ...tierSavings,
            rationale: `Tier ${nextTier} option: ${drug.llmRanking.reasoning}`,
            evidenceSources: [],
            monitoringPlan: 'Assess DLQI at 12-16 weeks.',
            tier: nextTier,
            requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
            contraindicated: false,
          });
        }
      }
    } else if (currentDoseReduction === 25) {
      // SCENARIO 2: On 25% dose reduction
      // 1. Dose reduce to 50% (max)
      const doseSavings50 = calculateAssumedCosts(lowestTierInFormulary, lowestTierInFormulary, 50);
      recommendations.push({
        rank: 1,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Extended interval (50% dose reduction - maximum)',
        ...doseSavings50,
        rationale: `Further dose reduction to 50% (maximum). Patient stable (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months on 25% reduced dose. ${evidenceNote}`,
        evidenceSources: doseReductionEvidence.map((e: any) => e.title),
        monitoringPlan: 'Very close monitoring. Assess DLQI every 2-4 weeks initially.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // 2. Continue current 25% reduced
      recommendations.push({
        rank: 2,
        type: 'CONTINUE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `Continue 25% dose-reduced regimen. Good balance of cost savings and clinical stability.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // 3. Return to standard dosing
      recommendations.push({
        rank: 3,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Return to standard dosing',
        rationale: `Return to standard dosing if patient/provider prefer maximum certainty of disease control.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    } else {
      // SCENARIO 3: On 50% dose reduction (maximum)
      // 1. Continue current 50% reduced (OPTIMAL)
      recommendations.push({
        rank: 1,
        type: 'CONTINUE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `Continue maximum dose reduction (50%). Optimal cost-effectiveness achieved - lowest tier + maximum dose reduction + stable disease (DLQI ${assessment.dlqiScore}).`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // 2. Return to 25% dose reduction
      recommendations.push({
        rank: 2,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Increase to 25% dose reduction',
        rationale: `Return to 25% dose reduction if disease activity increases or patient prefers more conservative dosing.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // 3. Return to standard dosing
      recommendations.push({
        rank: 3,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Return to standard dosing',
        rationale: `Return to standard dosing if needed for disease control.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    }
  } else if (quadrant === 'unstable_formulary_aligned') {
    // Unstable on lowest tier: Check if dose-reduced first

    if (currentDoseReduction > 0) {
      // Patient is dose-reduced and unstable → Return to standard dosing
      recommendations.push({
        rank: 1,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Return to standard dosing',
        rationale: `Disease not adequately controlled (DLQI ${assessment.dlqiScore}) on ${currentDoseReduction}% dose-reduced regimen. Return to standard dosing to restore full therapeutic effect.`,
        evidenceSources: [],
        monitoringPlan: 'Assess DLQI at 4, 8, and 12 weeks after returning to standard dosing.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // Option 2: Verify adherence at current reduced dose
      recommendations.push({
        rank: 2,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: 'Verify adherence',
        newFrequency: currentBiologic.frequency,
        rationale: `Before returning to standard dosing, verify adherence to current ${currentDoseReduction}% reduced regimen. Poor adherence may explain inadequate control.`,
        evidenceSources: [],
        monitoringPlan: 'Reassess adherence barriers. Patient education. Re-evaluate in 4 weeks.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    } else {
      // Patient on standard dosing and unstable
      // Option 1: Optimize adherence
      recommendations.push({
        rank: 1,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: 'Verify adherence and optimize per label',
        newFrequency: currentBiologic.frequency,
        rationale: `Disease not adequately controlled (DLQI ${assessment.dlqiScore}). Focus on adherence optimization and ensure proper dosing before considering therapy change.`,
        evidenceSources: [],
        monitoringPlan: 'Reassess adherence barriers. Consider patient education, auto-injector training. Re-evaluate in 12 weeks.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });

      // Option 2: Continue current and monitor
      recommendations.push({
        rank: 2,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `Continue current lowest tier therapy with close monitoring. Disease may be in temporary flare or control may not yet be established if recently started.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI every 4 weeks. Allow adequate time for therapy to demonstrate full efficacy before considering switch.',
        tier: lowestTierInFormulary,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    }

    // Option 3: Consider therapeutic switch if optimization fails
    const alternativeMechanisms = patientWithFormulary.plan.formularyDrugs
      .filter(drug =>
        isDrugIndicatedForDiagnosis(drug, assessment.diagnosis) &&
        drug.tier <= 2 &&
        drug.drugName !== currentBiologic.drugName &&
        drug.drugClass !== currentFormularyDrug?.drugClass // Different mechanism
      )
      .sort((a, b) => a.tier - b.tier);

    if (alternativeMechanisms.length > 0) {
      const alt = alternativeMechanisms[0];
      const tierSavings = calculateAssumedCosts(currentFormularyDrug?.tier, alt.tier);
      recommendations.push({
        rank: 3,
        type: 'THERAPEUTIC_SWITCH',
        drugName: alt.drugName,
        newDose: 'Per label',
        newFrequency: 'Per label',
        ...tierSavings,
        rationale: `If adherence optimization fails: Consider switch to ${alt.drugClass.replace('_', ' ')} with different mechanism of action. May improve outcomes if current therapy is truly inadequate.`,
        evidenceSources: [],
        monitoringPlan: 'Only pursue if optimization attempts fail. Baseline labs if indicated. Assess response at 12-16 weeks.',
        tier: alt.tier,
        requiresPA: convertRequiresPAToBoolean(alt.requiresPA),
        contraindicated: false,
      });
    } else {
      // If no alternatives, suggest adjunctive therapy consideration
      recommendations.push({
        rank: 3,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: 'Consider adjunctive topical therapy',
        newFrequency: currentBiologic.frequency,
        rationale: `Consider adding adjunctive topical therapy or addressing comorbidities that may be impacting disease control while maintaining optimal biologic.`,
        evidenceSources: [],
        monitoringPlan: 'Re-evaluate need for systemic therapy change after optimizing adjunctive treatments.',
        tier: currentFormularyDrug?.tier,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    }
  } else {
    // unstable_non_formulary: NOT on lowest tier AND unstable
    // Priority: Return to standard if dose-reduced, then switch to lower tiers

    if (currentDoseReduction > 0) {
      // If dose-reduced, offer return to standard dosing first
      recommendations.push({
        rank: 1,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Return to standard dosing',
        rationale: `Disease not adequately controlled (DLQI ${assessment.dlqiScore}) on ${currentDoseReduction}% dose-reduced regimen. Return to standard dosing before considering medication switch.`,
        evidenceSources: [],
        monitoringPlan: 'Assess DLQI at 4, 8, and 12 weeks. If control not achieved at standard dosing, consider therapeutic switch.',
        tier: currentTier,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    }

    // Switch to lower-tier alternatives (with LLM ranking within tiers)
    for (const tier of availableTiers) {
      if (tier < currentTier && recommendations.length < 3) {
        const drugsInTier = indicatedDrugs.filter(d =>
          d.tier === tier &&
          !checkContraindications(d, patientWithFormulary.contraindications).contraindicated
        );

        if (drugsInTier.length > 0) {
          const rankedDrugs = await rankDrugsByEfficacyLLM(drugsInTier, {
            diagnosis: assessment.diagnosis,
            hasPsoriaticArthritis: assessment.hasPsoriaticArthritis,
            contraindications: patientWithFormulary.contraindications,
            currentDrug: currentBiologic.drugName,
            dlqiScore: assessment.dlqiScore,
            monthsStable: assessment.monthsStable,
            additionalNotes: assessment.additionalNotes
          });

          for (const drug of rankedDrugs.slice(0, 3 - recommendations.length)) {
            const tierSavings = calculateAssumedCosts(currentTier, drug.tier);
            recommendations.push({
              rank: recommendations.length + 1,
              type: 'THERAPEUTIC_SWITCH',
              drugName: drug.drugName,
              newDose: 'Per label',
              newFrequency: 'Per label',
              ...tierSavings,
              rationale: `Disease inadequately controlled. Switch to Tier ${drug.tier} ${drug.drugClass.replace(/_/g, ' ')}. ${drug.llmRanking.reasoning}`,
              evidenceSources: [],
              monitoringPlan: 'Baseline labs if indicated. Assess response at 12-16 weeks.',
              tier: drug.tier,
              requiresPA: convertRequiresPAToBoolean(drug.requiresPA),
              contraindicated: false,
            });
          }
        }
      }
    }

    // Fallback: Optimize adherence if needed
    if (recommendations.length < 3) {
      recommendations.push({
        rank: recommendations.length + 1,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: 'Optimize adherence',
        newFrequency: currentBiologic.frequency,
        rationale: `Before switching, ensure adherence is optimized and adequate time given for current therapy.`,
        evidenceSources: [],
        monitoringPlan: 'Address adherence barriers. Re-evaluate in 8-12 weeks.',
        tier: currentTier,
        requiresPA: convertRequiresPAToBoolean(currentFormularyDrug?.requiresPA),
        contraindicated: false,
      });
    }
  }

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
    recommendations: recommendations.slice(0, 3), // Max 3 recommendations
    contraindicatedDrugs: contraindicatedDrugsFormatted,
  };
}
