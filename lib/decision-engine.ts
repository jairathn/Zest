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
 */
export function determineFormularyStatus(
  currentDrug: FormularyDrug | null
): boolean {
  if (!currentDrug) return false;
  // Optimal if Tier 1-2 and no PA required
  return currentDrug.tier <= 2 && !currentDrug.requiresPA;
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
      plan: {
        include: {
          formularyDrugs: true,
        },
      },
    },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  const currentBiologic = patient.currentBiologics[0]; // For MVP, assume one biologic
  if (!currentBiologic) {
    throw new Error('No current biologic found for patient');
  }

  // Find current drug in formulary
  const currentFormularyDrug = patient.plan.formularyDrugs.find(
    drug => drug.drugName.toLowerCase() === currentBiologic.drugName.toLowerCase()
  );

  // Determine stability and formulary status
  const isStable = determineStability(assessment.dlqiScore, assessment.monthsStable);
  const isFormularyOptimal = determineFormularyStatus(currentFormularyDrug || null);
  const quadrant = getQuadrant(isStable, isFormularyOptimal);

  // Search knowledge base for relevant evidence
  const knowledgeQuery = `${assessment.diagnosis} ${currentBiologic.drugName} ${quadrant}`;
  const evidence = await searchKnowledge(knowledgeQuery, 3);

  // Generate recommendations based on quadrant
  const recommendations: RecommendationOutput[] = [];

  if (quadrant === 'stable_non_formulary') {
    // Switch to biosimilar or formulary-preferred
    const alternatives = patient.plan.formularyDrugs
      .filter(drug =>
        (drug.biosimilarOf?.toLowerCase() === currentBiologic.drugName.toLowerCase() ||
         drug.drugClass === currentFormularyDrug?.drugClass) &&
        drug.tier < (currentFormularyDrug?.tier || 999)
      )
      .sort((a, b) => a.tier - b.tier);

    for (const alt of alternatives.slice(0, 2)) {
      const contraCheck = checkContraindications(alt, patient.contraindications);

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
          : `Switch to preferred formulary agent maintains disease control while reducing costs and PA requirements.`,
        evidenceSources: evidence.map(e => e.title),
        monitoringPlan: 'Assess DLQI at 3 and 6 months post-switch. Monitor for any disease flare or adverse events.',
        tier: alt.tier,
        requiresPA: alt.requiresPA,
        ...contraCheck,
      });
    }
  } else if (quadrant === 'stable_formulary_aligned') {
    // Consider dose reduction
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
      rationale: `Patient has stable disease (DLQI ${assessment.dlqiScore}) for ${assessment.monthsStable} months. Extended dosing intervals may maintain disease control while reducing costs.`,
      evidenceSources: evidence.map(e => e.title),
      monitoringPlan: 'Close monitoring required. Assess DLQI monthly for first 3 months, then quarterly. Be prepared to resume standard dosing if disease activity increases.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });
  } else if (quadrant === 'unstable_formulary_aligned') {
    // Optimize current therapy
    recommendations.push({
      rank: 1,
      type: 'OPTIMIZE_CURRENT',
      drugName: currentBiologic.drugName,
      newDose: 'Verify adherence and optimize per label',
      newFrequency: currentBiologic.frequency,
      currentAnnualCost: currentFormularyDrug?.annualCostWAC?.toNumber(),
      rationale: `Disease is not adequately controlled (DLQI ${assessment.dlqiScore}). Focus on adherence optimization and ensure proper dosing before considering therapy change.`,
      evidenceSources: evidence.map(e => e.title),
      monitoringPlan: 'Reassess adherence barriers. Consider patient education, auto-injector training. Re-evaluate in 12 weeks.',
      tier: currentFormularyDrug?.tier,
      requiresPA: currentFormularyDrug?.requiresPA,
      contraindicated: false,
    });
  } else {
    // unstable_non_formulary: Switch to preferred with different mechanism
    const alternatives = patient.plan.formularyDrugs
      .filter(drug =>
        drug.tier <= 2 &&
        drug.drugName !== currentBiologic.drugName
      )
      .sort((a, b) => a.tier - b.tier);

    for (const alt of alternatives.slice(0, 2)) {
      const contraCheck = checkContraindications(alt, patient.contraindications);

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
        evidenceSources: evidence.map(e => e.title),
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
