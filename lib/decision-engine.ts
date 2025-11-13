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
  requiresPA?: boolean;
  contraindicated: boolean;
  contraindicationReason?: string;
}

/**
 * Determine if patient is stable based on DLQI and duration
 */
export function determineStability(dlqiScore: number, monthsStable: number): boolean {
  // Stable if DLQI <= 5 and stable for >= 6 months
  return dlqiScore <= 5 && monthsStable >= 6;
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
  return currentDrug.tier === 1 && !currentDrug.requiresPA;
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
  if (!drug.approvedIndications || drug.approvedIndications.length === 0) {
    return true;
  }

  // Check if the diagnosis is in the approved indications list
  return drug.approvedIndications.includes(diagnosis);
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
  if (drug.drugClass === 'TNF_INHIBITOR') {
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
      .sort((a, b) => {
        // Sort by tier first, then by cost savings
        if (a.tier !== b.tier) return a.tier - b.tier;
        const savingsA = currentFormularyDrug?.annualCostWAC && a.annualCostWAC
          ? currentFormularyDrug.annualCostWAC.minus(a.annualCostWAC).toNumber()
          : 0;
        const savingsB = currentFormularyDrug?.annualCostWAC && b.annualCostWAC
          ? currentFormularyDrug.annualCostWAC.minus(b.annualCostWAC).toNumber()
          : 0;
        return savingsB - savingsA; // Higher savings first
      });

    // Add switch recommendations (up to 2)
    for (const alt of alternatives.slice(0, 2)) {
      const contraCheck = checkContraindications(alt, patientWithFormulary.contraindications);

      recommendations.push({
        rank: recommendations.length + 1,
        type: alt.biosimilarOf ? 'SWITCH_TO_BIOSIMILAR' : 'SWITCH_TO_PREFERRED',
        drugName: alt.drugName,
        newDose: currentBiologic.dose,
        newFrequency: currentBiologic.frequency,
        currentAnnualCost: currentFormularyDrug?.annualCostWAC?.toNumber(),
        recommendedAnnualCost: alt.annualCostWAC?.toNumber(),
        annualSavings: currentFormularyDrug?.annualCostWAC && alt.annualCostWAC
          ? currentFormularyDrug.annualCostWAC.minus(alt.annualCostWAC).toNumber()
          : undefined,
        savingsPercent: currentFormularyDrug?.annualCostWAC && alt.annualCostWAC
          ? currentFormularyDrug.annualCostWAC.minus(alt.annualCostWAC).div(currentFormularyDrug.annualCostWAC).mul(100).toNumber()
          : undefined,
        currentMonthlyOOP: currentFormularyDrug?.memberCopayT1?.div(12).toNumber(),
        recommendedMonthlyOOP: alt.memberCopayT1?.div(12).toNumber(),
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
    if (currentTier === 2 && recommendations.length < 3) {
      // Retrieve dose reduction evidence for Tier 2
      const doseReductionEvidence = await searchKnowledge(`${currentBiologic.drugName} dose reduction ${assessment.diagnosis}`, {
        minSimilarity: 0.65,
        maxResults: 10
      });

      recommendations.push({
        rank: recommendations.length + 1,
        type: 'DOSE_REDUCTION',
        drugName: currentBiologic.drugName,
        newDose: currentBiologic.dose,
        newFrequency: 'Extended interval (discuss with provider)',
        currentAnnualCost: currentFormularyDrug?.annualCostWAC?.toNumber(),
        recommendedAnnualCost: currentFormularyDrug?.annualCostWAC?.mul(0.75).toNumber(),
        annualSavings: currentFormularyDrug?.annualCostWAC?.mul(0.25).toNumber(),
        savingsPercent: 25,
        currentMonthlyOOP: currentFormularyDrug?.memberCopayT1?.div(12).toNumber(),
        recommendedMonthlyOOP: currentFormularyDrug?.memberCopayT1?.div(12).mul(0.75).toNumber(),
        rationale: `Alternative to switching: Patient stable (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months. Extended dosing may maintain control while reducing costs, though formulary switch offers greater savings.`,
        evidenceSources: doseReductionEvidence.map(e => e.title),
        monitoringPlan: 'Close monitoring required. Assess DLQI monthly for first 3 months. Be prepared to resume standard dosing if disease activity increases.',
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

    recommendations.push({
      rank: 1,
      type: 'DOSE_REDUCTION',
      drugName: currentBiologic.drugName,
      newDose: currentBiologic.dose,
      newFrequency: 'Extended interval (discuss with provider)',
      currentAnnualCost: currentFormularyDrug?.annualCostWAC?.toNumber(),
      recommendedAnnualCost: currentFormularyDrug?.annualCostWAC?.mul(0.75).toNumber(), // Estimate 25% reduction
      annualSavings: currentFormularyDrug?.annualCostWAC?.mul(0.25).toNumber(),
      savingsPercent: 25,
      currentMonthlyOOP: currentFormularyDrug?.memberCopayT1?.div(12).toNumber(),
      recommendedMonthlyOOP: currentFormularyDrug?.memberCopayT1?.div(12).mul(0.75).toNumber(),
      rationale: `Patient has stable disease (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months on Tier 1 optimal medication. Extended dosing intervals may maintain disease control while reducing costs.`,
      evidenceSources: doseReductionEvidence.map(e => e.title),
      monitoringPlan: 'Close monitoring required. Assess DLQI monthly for first 3 months, then quarterly. Be prepared to resume standard dosing if disease activity increases.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });
  } else if (quadrant === 'unstable_formulary_aligned') {
    // Optimize current therapy - standard clinical practice, no RAG needed
    recommendations.push({
      rank: 1,
      type: 'OPTIMIZE_CURRENT',
      drugName: currentBiologic.drugName,
      newDose: 'Verify adherence and optimize per label',
      newFrequency: currentBiologic.frequency,
      currentAnnualCost: currentFormularyDrug?.annualCostWAC?.toNumber(),
      rationale: `Disease is not adequately controlled (DLQI ${assessment.dlqiScore}). Focus on adherence optimization and ensure proper dosing before considering therapy change.`,
      evidenceSources: [], // No RAG needed - standard clinical practice
      monitoringPlan: 'Reassess adherence barriers. Consider patient education, auto-injector training. Re-evaluate in 12 weeks.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });
  } else {
    // unstable_non_formulary: Switch to preferred with different mechanism
    const alternatives = patientWithFormulary.plan.formularyDrugs
      .filter(drug =>
        isDrugIndicatedForDiagnosis(drug, assessment.diagnosis) &&
        drug.tier <= 2 &&
        drug.drugName !== currentBiologic.drugName
      )
      .sort((a, b) => a.tier - b.tier);

    for (const alt of alternatives.slice(0, 2)) {
      const contraCheck = checkContraindications(alt, patientWithFormulary.contraindications);

      recommendations.push({
        rank: recommendations.length + 1,
        type: 'THERAPEUTIC_SWITCH',
        drugName: alt.drugName,
        newDose: 'Per label',
        newFrequency: 'Per label',
        currentAnnualCost: currentFormularyDrug?.annualCostWAC?.toNumber(),
        recommendedAnnualCost: alt.annualCostWAC?.toNumber(),
        annualSavings: currentFormularyDrug?.annualCostWAC && alt.annualCostWAC
          ? currentFormularyDrug.annualCostWAC.minus(alt.annualCostWAC).toNumber()
          : undefined,
        savingsPercent: currentFormularyDrug?.annualCostWAC && alt.annualCostWAC
          ? currentFormularyDrug.annualCostWAC.minus(alt.annualCostWAC).div(currentFormularyDrug.annualCostWAC).mul(100).toNumber()
          : undefined,
        currentMonthlyOOP: currentFormularyDrug?.memberCopayT1?.div(12).toNumber(),
        recommendedMonthlyOOP: alt.memberCopayT1?.div(12).toNumber(),
        rationale: `Disease inadequately controlled on current non-preferred agent. Switch to formulary-preferred ${alt.drugClass.replace('_', ' ')} may improve outcomes and reduce costs.`,
        evidenceSources: [], // No RAG needed - therapeutic escalation is standard clinical practice
        monitoringPlan: 'Baseline labs if indicated. Assess response at 12-16 weeks based on drug pharmacokinetics.',
        tier: alt.tier,
        requiresPA: alt.requiresPA,
        ...contraCheck,
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
