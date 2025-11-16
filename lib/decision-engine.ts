import { prisma } from './db';
import { searchKnowledge } from './rag/embeddings';
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
  requiresPA?: string | boolean;
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
 * DLQI 0-1 = no effect on patient's life (truly stable)
 * Patient must be stable for >= 6 months before considering therapy optimization
 */
export function determineStability(dlqiScore: number, monthsStable: number): boolean {
  // Stable if DLQI <= 1 (no effect on life) and stable for >= 6 months
  return dlqiScore <= 1 && monthsStable >= 6;
}

/**
 * Check if patient is stable but for insufficient duration
 * These patients should continue current therapy, not optimize yet
 */
export function isStableShortDuration(dlqiScore: number, monthsStable: number): boolean {
  return dlqiScore <= 1 && monthsStable < 6;
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
  // Tier 2-3 are always suboptimal (cost optimization opportunities exist)
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

/**
 * Check if a drug is contraindicated for a patient
 */
export function checkContraindications(
  drug: FormularyDrug,
  contraindications: Contraindication[]
): { contraindicated: boolean; reason?: string } {
  // Check for specific drug class contraindications
  const contraindicationTypes = contraindications.map(c => c.type);

  // TNF inhibitors contraindicated in heart failure and MS
  if (drug.drugClass && drug.drugClass.includes('TNF')) {
    if (contraindicationTypes.includes('HEART_FAILURE')) {
      return { contraindicated: true, reason: 'TNF inhibitors contraindicated in heart failure' };
    }
    if (contraindicationTypes.includes('MULTIPLE_SCLEROSIS')) {
      return { contraindicated: true, reason: 'TNF inhibitors contraindicated in multiple sclerosis' };
    }
  }

  // All biologics contraindicated in active infection
  if (contraindicationTypes.includes('ACTIVE_INFECTION')) {
    return { contraindicated: true, reason: 'Biologics contraindicated during active infection' };
  }

  // Check pregnancy
  if (contraindicationTypes.includes('PREGNANCY')) {
    // Most biologics have pregnancy warnings
    return { contraindicated: true, reason: 'Use caution in pregnancy - discuss risk/benefit' };
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
  const mostRecentUpload = await prisma.uploadLog.findFirst({
    where: {
      uploadType: 'FORMULARY',
      planId: patient.planId,
    },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true },
  });

  // Fetch formulary drugs from the most recent upload only
  const formularyDrugs = mostRecentUpload
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

  // Check for stable but insufficient duration - special case
  if (isStableShortDuration(assessment.dlqiScore, assessment.monthsStable)) {
    const monthsNeeded = 6 - assessment.monthsStable;
    const recommendations: RecommendationOutput[] = [{
      rank: 1,
      type: 'CONTINUE_CURRENT',
      drugName: currentBiologic.drugName,
      newDose: currentBiologic.dose,
      newFrequency: currentBiologic.frequency,
      rationale: `Patient has excellent disease control (DLQI ${assessment.dlqiScore}) but has only been stable for ${assessment.monthsStable} months. Continue current therapy for ${monthsNeeded} more months to establish sustained stability, then re-evaluate for potential dose optimization or formulary alignment.`,
      evidenceSources: [],
      monitoringPlan: `Monitor DLQI monthly. Re-assess at ${assessment.monthsStable + monthsNeeded} months for therapy optimization opportunities if stability is maintained.`,
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    }];

    // Add 2 more options for what to consider after sufficient stability duration
    const isFormularyOptimal = determineFormularyStatus(currentFormularyDrug || null);

    if (!isFormularyOptimal && currentFormularyDrug) {
      // If not formulary optimal, mention switch option for future
      const currentTier = currentFormularyDrug.tier;
      const alternatives = patientWithFormulary.plan.formularyDrugs
        .filter(drug =>
          isDrugIndicatedForDiagnosis(drug, assessment.diagnosis) &&
          (drug.biosimilarOf?.toLowerCase() === currentBiologic.drugName.toLowerCase() ||
           drug.drugClass === currentFormularyDrug.drugClass) &&
          drug.tier < currentTier
        )
        .sort((a, b) => a.tier - b.tier);

      if (alternatives.length > 0) {
        const alt = alternatives[0];
        const tierSavings = calculateAssumedCosts(currentFormularyDrug.tier, alt.tier);
        recommendations.push({
          rank: 2,
          type: alt.biosimilarOf ? 'SWITCH_TO_BIOSIMILAR' : 'SWITCH_TO_PREFERRED',
          drugName: alt.drugName,
          newDose: currentBiologic.dose,
          newFrequency: currentBiologic.frequency,
          ...tierSavings,
          rationale: `Future consideration after ${monthsNeeded} more months of stability: Switch to ${alt.biosimilarOf ? 'biosimilar' : `Tier ${alt.tier} preferred agent`} to improve formulary alignment and reduce costs.`,
          evidenceSources: [],
          monitoringPlan: 'Consider this option once 6 months of sustained stability is achieved.',
          tier: alt.tier,
          requiresPA: alt.requiresPA,
          contraindicated: false,
        });
      }
    }

    // Add dose reduction as a future option
    const doseReductionEvidence = await searchKnowledge(`${currentBiologic.drugName} dose reduction ${assessment.diagnosis}`, {
      minSimilarity: 0.65,
      maxResults: 5
    });

    const doseSavings = calculateAssumedCosts(currentFormularyDrug?.tier, currentFormularyDrug?.tier, 25);
    recommendations.push({
      rank: 3,
      type: 'DOSE_REDUCTION',
      drugName: currentBiologic.drugName,
      newDose: currentBiologic.dose,
      newFrequency: 'Extended interval (consider after sustained stability)',
      ...doseSavings,
      rationale: `Future consideration after ${monthsNeeded} more months of stability: Extended dosing intervals may maintain disease control while reducing costs once sustained stability (≥6 months) is confirmed.`,
      evidenceSources: doseReductionEvidence.map(e => e.title),
      monitoringPlan: 'Consider this option once 6 months of sustained stability is achieved.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });

    return {
      isStable: true, // Patient IS stable, just not for long enough
      isFormularyOptimal,
      quadrant: 'stable_short_duration',
      recommendations: recommendations.slice(0, 3),
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
    // Tier 2 vs Tier 3 strategy differs:
    // Tier 2: Offer switch (preferred) AND dose reduction (alternative)
    // Tier 3: Offer switch ONLY (never dose reduce high-cost drugs)
    const currentTier = currentFormularyDrug?.tier || 999;

    // Option 1: Switch to lower-tier alternatives (always recommended for Tier 2-3)
    const alternatives = patientWithFormulary.plan.formularyDrugs
      .filter(drug =>
        isDrugIndicatedForDiagnosis(drug, assessment.diagnosis) &&
        (drug.biosimilarOf?.toLowerCase() === currentBiologic.drugName.toLowerCase() ||
         drug.drugClass === currentFormularyDrug?.drugClass) &&
        drug.tier < currentTier
      )
      .sort((a, b) => a.tier - b.tier); // Sort by tier (lower tier = better)

    // Add switch recommendations (up to 2)
    for (const alt of alternatives.slice(0, 2)) {
      const contraCheck = checkContraindications(alt, patientWithFormulary.contraindications);
      const tierSavings = calculateAssumedCosts(currentFormularyDrug?.tier, alt.tier);

      recommendations.push({
        rank: recommendations.length + 1,
        type: alt.biosimilarOf ? 'SWITCH_TO_BIOSIMILAR' : 'SWITCH_TO_PREFERRED',
        drugName: alt.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        ...tierSavings,
        rationale: alt.biosimilarOf
          ? `Patient is stable (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months. Switch to biosimilar maintains efficacy while reducing costs and improving formulary alignment.`
          : `Switch to Tier ${alt.tier} preferred agent maintains disease control while reducing costs and PA requirements.`,
        evidenceSources: [], // No RAG needed for formulary switches - business case is self-evident
        monitoringPlan: 'Assess DLQI at 3 and 6 months post-switch. Monitor for any disease flare or adverse events.',
        tier: alt.tier,
        requiresPA: alt.requiresPA,
        ...contraCheck,
      });
    }

    // Option 2: For Tier 2 ONLY, also offer dose reduction as alternative
    // Tier 3 is too expensive - must switch, cannot dose reduce
    if (currentTier === 2) {
      // Retrieve dose reduction evidence for Tier 2
      const doseReductionEvidence = await searchKnowledge(`${currentBiologic.drugName} dose reduction ${assessment.diagnosis}`, {
        minSimilarity: 0.65,
        maxResults: 10
      });

      const doseSavings = calculateAssumedCosts(currentFormularyDrug?.tier, currentFormularyDrug?.tier, 25);
      recommendations.push({
        rank: recommendations.length + 1,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Extended interval (discuss with provider)',
        ...doseSavings,
        rationale: `Alternative to switching: Patient stable (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months. Extended dosing may maintain control while reducing costs, though formulary switch offers greater savings.`,
        evidenceSources: doseReductionEvidence.map(e => e.title),
        monitoringPlan: 'Close monitoring required. Assess DLQI monthly for first 3 months. Be prepared to resume standard dosing if disease activity increases.',
        tier: currentFormularyDrug?.tier,
        requiresPA: currentFormularyDrug?.requiresPA,
        contraindicated: false,
      });
    }

    // Ensure we always have at least 3 recommendations
    if (recommendations.length < 3) {
      recommendations.push({
        rank: recommendations.length + 1,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `Conservative option: Continue current therapy without changes. Patient has stable disease, and formulary switches carry some risk of disease flare that may be unacceptable to patient.`,
        evidenceSources: [],
        monitoringPlan: 'Monitor DLQI quarterly. Patient may prefer to maintain current stable regimen.',
        tier: currentFormularyDrug?.tier,
        requiresPA: currentFormularyDrug?.requiresPA,
        contraindicated: false,
      });
    }
  } else if (quadrant === 'stable_formulary_aligned') {
    // Tier 1 optimal: Primary strategy is dose reduction
    // Retrieve specific dose reduction evidence (RAG needed to convince clinicians)
    const doseReductionEvidence = await searchKnowledge(
      `${currentBiologic.drugName} dose reduction interval extension ${assessment.diagnosis} stable patients`,
      {
        minSimilarity: 0.65,
        maxResults: 10
      }
    );

    // Option 1: Dose reduction (primary recommendation)
    const doseSavings25 = calculateAssumedCosts(currentFormularyDrug?.tier, currentFormularyDrug?.tier, 25);
    recommendations.push({
      rank: 1,
      type: 'DOSE_REDUCTION',
      drugName: currentBiologic.drugName,
      newDose: currentBiologic.dose,
      newFrequency: 'Extended interval (discuss with provider)',
      ...doseSavings25,
      rationale: `Patient has stable disease (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months on Tier 1 optimal medication. Extended dosing intervals may maintain disease control while reducing costs.`,
      evidenceSources: doseReductionEvidence.map(e => e.title),
      monitoringPlan: 'Close monitoring required. Assess DLQI monthly for first 3 months, then quarterly. Be prepared to resume standard dosing if disease activity increases.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });

    // Option 2: Continue current therapy (conservative option)
    recommendations.push({
      rank: 2,
      type: 'OPTIMIZE_CURRENT',
      drugName: currentBiologic.drugName,
      newDose: currentBiologic.dose,
      newFrequency: currentBiologic.frequency,
      rationale: `Conservative approach: Continue current Tier 1 therapy at standard dosing. Patient has excellent control and therapy is already formulary-optimal, minimizing risk of disease flare.`,
      evidenceSources: [],
      monitoringPlan: 'Monitor DLQI quarterly. Continue current therapy if patient and provider prefer maintaining status quo.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });

    // Option 3: Check for biosimilar options (if available)
    const biosimilarAlternatives = patientWithFormulary.plan.formularyDrugs.filter(drug =>
      isDrugIndicatedForDiagnosis(drug, assessment.diagnosis) &&
      drug.biosimilarOf?.toLowerCase() === currentBiologic.drugName.toLowerCase() &&
      drug.tier === 1
    );

    if (biosimilarAlternatives.length > 0) {
      const biosim = biosimilarAlternatives[0];
      // Since both are Tier 1, savings come from potential cost differences within the tier
      recommendations.push({
        rank: 3,
        type: 'SWITCH_TO_BIOSIMILAR',
        drugName: biosim.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        rationale: `Alternative option: Switch to Tier 1 biosimilar maintains disease control with equivalent efficacy while potentially reducing costs.`,
        evidenceSources: [],
        monitoringPlan: 'Assess DLQI at 3 and 6 months post-switch to ensure maintained control.',
        tier: biosim.tier,
        requiresPA: biosim.requiresPA,
        contraindicated: false,
      });
    } else {
      // If no biosimilar, offer more aggressive dose reduction
      const doseSavings50 = calculateAssumedCosts(currentFormularyDrug?.tier, currentFormularyDrug?.tier, 50);
      recommendations.push({
        rank: 3,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'More aggressive interval extension',
        ...doseSavings50,
        rationale: `Alternative option: More aggressive dose reduction for sustained stable patients. Higher savings potential but requires closer monitoring and patient should be informed of increased flare risk.`,
        evidenceSources: doseReductionEvidence.map(e => e.title),
        monitoringPlan: 'Very close monitoring required. Assess DLQI every 2-4 weeks initially. Higher risk strategy - only for highly motivated, compliant patients.',
        tier: currentFormularyDrug?.tier,
        requiresPA: currentFormularyDrug?.requiresPA,
        contraindicated: false,
      });
    }
  } else if (quadrant === 'unstable_formulary_aligned') {
    // Optimize current therapy - standard clinical practice, no RAG needed

    // Option 1: Optimize adherence (primary recommendation)
    recommendations.push({
      rank: 1,
      type: 'OPTIMIZE_CURRENT',
      drugName: currentBiologic.drugName,
      newDose: 'Verify adherence and optimize per label',
      newFrequency: currentBiologic.frequency,
      rationale: `Disease is not adequately controlled (DLQI ${assessment.dlqiScore}). Focus on adherence optimization and ensure proper dosing before considering therapy change.`,
      evidenceSources: [],
      monitoringPlan: 'Reassess adherence barriers. Consider patient education, auto-injector training. Re-evaluate in 12 weeks.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });

    // Option 2: Continue current and monitor closely
    recommendations.push({
      rank: 2,
      type: 'OPTIMIZE_CURRENT',
      drugName: currentBiologic.drugName,
      newDose: currentBiologic.dose,
      newFrequency: currentBiologic.frequency,
      rationale: `Continue current Tier 1 therapy with close monitoring. Disease may be in temporary flare or control may not yet be established if recently started. Therapy is already formulary-optimal.`,
      evidenceSources: [],
      monitoringPlan: 'Monitor DLQI every 4 weeks. Allow adequate time for therapy to demonstrate full efficacy before considering switch.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });

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
        requiresPA: alt.requiresPA,
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
        requiresPA: currentFormularyDrug?.requiresPA,
        contraindicated: false,
      });
    }
  } else {
    // unstable_non_formulary: Switch to preferred with different mechanism
    const alternatives = patientWithFormulary.plan.formularyDrugs
      .filter(drug =>
        isDrugIndicatedForDiagnosis(drug, assessment.diagnosis) &&
        drug.tier <= 2 &&
        drug.drugName !== currentBiologic.drugName
      )
      .sort((a, b) => a.tier - b.tier);

    // Add up to 3 alternatives
    for (const alt of alternatives.slice(0, 3)) {
      const contraCheck = checkContraindications(alt, patientWithFormulary.contraindications);
      const tierSavings = calculateAssumedCosts(currentFormularyDrug?.tier, alt.tier);

      recommendations.push({
        rank: recommendations.length + 1,
        type: 'THERAPEUTIC_SWITCH',
        drugName: alt.drugName,
        newDose: 'Per label',
        newFrequency: 'Per label',
        ...tierSavings,
        rationale: `Disease inadequately controlled on current non-preferred agent. Switch to formulary-preferred ${alt.drugClass.replace('_', ' ')} may improve outcomes and reduce costs.`,
        evidenceSources: [],
        monitoringPlan: 'Baseline labs if indicated. Assess response at 12-16 weeks based on drug pharmacokinetics.',
        tier: alt.tier,
        requiresPA: alt.requiresPA,
        ...contraCheck,
      });
    }

    // If we have fewer than 3 recommendations, add optimization of current therapy as fallback
    if (recommendations.length < 3) {
      recommendations.push({
        rank: recommendations.length + 1,
        type: 'OPTIMIZE_CURRENT',
        drugName: currentBiologic.drugName,
        newDose: 'Optimize adherence before switching',
        newFrequency: currentBiologic.frequency,
        rationale: `Conservative option: Before switching medications, ensure adherence is optimized and adequate time given for current therapy to work.`,
        evidenceSources: [],
        monitoringPlan: 'Address adherence barriers. Re-evaluate in 8-12 weeks before pursuing medication switch.',
        tier: currentFormularyDrug?.tier,
        requiresPA: currentFormularyDrug?.requiresPA,
        contraindicated: false,
      });
    }
  }

  return {
    isStable,
    isFormularyOptimal,
    quadrant,
    recommendations: recommendations.slice(0, 3), // Max 3 recommendations
  };
}
