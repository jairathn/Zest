import { z } from 'zod';
import { ClinicalAssessment, CurrentMedication, FormularyDrug, Patient, PharmacyClaim, ClaimsHistory } from '@prisma/client';
import { getOpenAIClient } from './openai-client';
import { retrieveRelevantContext } from '@/lib/rag/retrieve';
import { formatCurrency } from '@/lib/utils';

export type PatientData = Patient & {
  currentMedication: CurrentMedication | null;
  claimsHistory: ClaimsHistory[];
  pharmacyClaims: PharmacyClaim[];
  insurancePlan: {
    formularyDrugs: FormularyDrug[];
    planName: string;
  };
};

const recommendationSchema = z.object({
  rank: z.number().int(),
  drug_name: z.string(),
  dose: z.string(),
  frequency: z.string(),
  recommendation_type: z.enum(['dose_reduction', 'biosimilar_switch', 'therapeutic_switch', 'optimize_current']),
  clinical_rationale: z.string(),
  evidence: z.array(z.string()).default([]),
  cost_current_annual: z.number().nullable().optional(),
  cost_recommended_annual: z.number().nullable().optional(),
  savings_annual: z.number().nullable().optional(),
  savings_percent: z.number().nullable().optional(),
  formulary_tier: z.number().nullable().optional(),
  requires_pa: z.boolean().nullable().optional(),
  patient_oop_current_monthly: z.number().nullable().optional(),
  patient_oop_recommended_monthly: z.number().nullable().optional(),
  monitoring_plan: z.string().optional().default('')
});

const decisionResponseSchema = z.object({
  quadrant: z.string(),
  stability_rationale: z.string(),
  formulary_rationale: z.string(),
  recommendations: z.array(recommendationSchema).min(1)
});

type DecisionResponse = z.infer<typeof decisionResponseSchema>;

type StabilityLabel = 'STABLE' | 'UNSTABLE';
type FormularyLabel = 'OPTIMAL' | 'SUBOPTIMAL' | 'NON_FORMULARY';

export function determineStability(assessment: ClinicalAssessment): StabilityLabel {
  const { diagnosis, severityScoreType, severityScore, severityDurationMonths, dlqiScore } = assessment;

  const numericScore = typeof severityScore === 'object' ? Number(severityScore.toString()) : Number(severityScore);

  if (diagnosis === 'PSORIASIS') {
    if (severityScoreType === 'PASI') {
      const isStable = numericScore < 5 && severityDurationMonths >= 6 && dlqiScore <= 5;
      return isStable ? 'STABLE' : 'UNSTABLE';
    }
    if (severityScoreType === 'PGA') {
      const isStable = numericScore <= 1 && severityDurationMonths >= 6 && dlqiScore <= 5;
      return isStable ? 'STABLE' : 'UNSTABLE';
    }
  }

  if (diagnosis === 'ECZEMA') {
    if (severityScoreType === 'EASI') {
      const isStable = numericScore < 7 && severityDurationMonths >= 6 && dlqiScore <= 5;
      return isStable ? 'STABLE' : 'UNSTABLE';
    }
    if (severityScoreType === 'IGA') {
      const isStable = numericScore <= 1 && severityDurationMonths >= 6 && dlqiScore <= 5;
      return isStable ? 'STABLE' : 'UNSTABLE';
    }
  }

  return 'UNSTABLE';
}

export function determineFormularyStatus(currentDrug: FormularyDrug | null): FormularyLabel {
  if (!currentDrug) return 'NON_FORMULARY';
  if (currentDrug.tier === 1 && !currentDrug.requiresPA) return 'OPTIMAL';
  if (currentDrug.tier === 2 && !currentDrug.requiresPA) return 'OPTIMAL';
  if (currentDrug.tier === 3 || currentDrug.requiresPA) return 'SUBOPTIMAL';
  if (currentDrug.tier >= 4) return 'NON_FORMULARY';
  return 'SUBOPTIMAL';
}

function getQuadrant(stability: StabilityLabel, formulary: FormularyLabel) {
  if (stability === 'STABLE' && formulary === 'OPTIMAL') return 'stable_formulary_aligned';
  if (stability === 'STABLE' && formulary !== 'OPTIMAL') return 'stable_non_formulary';
  if (stability === 'UNSTABLE' && formulary === 'OPTIMAL') return 'unstable_formulary_aligned';
  return 'unstable_non_formulary';
}

function buildContextSummary(patient: PatientData, assessment: ClinicalAssessment, formularyDrug: FormularyDrug | null) {
  const med = patient.currentMedication;
  return [
    `${patient.firstName} ${patient.lastName}`,
    med ? `${med.drugName} ${med.dose} ${med.frequency}` : 'No current biologic',
    `Plan: ${patient.insurancePlan.planName}`,
    `Assessment: ${assessment.diagnosis} ${assessment.severityScoreType} ${assessment.severityScore}`,
    formularyDrug ? `Formulary tier ${formularyDrug.tier}` : 'Not on formulary'
  ].join('\n');
}

function normalizeDecimal(value?: any) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapRecommendationCosts(reco: z.infer<typeof recommendationSchema>, currentDrug?: FormularyDrug | null, alt?: FormularyDrug | null) {
  const currentAnnual = normalizeDecimal(currentDrug?.annualCostWAC);
  const recommendedAnnual = normalizeDecimal(alt?.annualCostWAC);
  const patientOopCurrent = normalizeDecimal(currentDrug?.memberCopayT3 ?? currentDrug?.memberCopayT2 ?? currentDrug?.memberCopayT1);
  const patientOopAlt = normalizeDecimal(alt?.memberCopayT1 ?? alt?.memberCopayT2 ?? alt?.memberCopayT3);

  // If cost data missing, maintain nulls to respect instruction of not assuming cost.
  return {
    ...reco,
    cost_current_annual: reco.cost_current_annual ?? currentAnnual,
    cost_recommended_annual: reco.cost_recommended_annual ?? recommendedAnnual,
    savings_annual:
      reco.savings_annual ??
      (currentAnnual !== null && recommendedAnnual !== null ? Number((currentAnnual - recommendedAnnual).toFixed(2)) : null),
    savings_percent:
      reco.savings_percent ??
      currentAnnual !== null && recommendedAnnual !== null && currentAnnual > 0
        ? Number((((currentAnnual - recommendedAnnual) / currentAnnual) * 100).toFixed(2))
        : null,
    patient_oop_current_monthly: reco.patient_oop_current_monthly ?? (patientOopCurrent !== null ? Number((patientOopCurrent / 12).toFixed(2)) : null),
    patient_oop_recommended_monthly:
      reco.patient_oop_recommended_monthly ?? (patientOopAlt !== null ? Number((patientOopAlt / 12).toFixed(2)) : null),
    formulary_tier: reco.formulary_tier ?? alt?.tier ?? currentDrug?.tier ?? null,
    requires_pa: reco.requires_pa ?? alt?.requiresPA ?? currentDrug?.requiresPA ?? null
  };
}

async function callLLM(payload: {
  patientSummary: string;
  assessment: ClinicalAssessment;
  stability: StabilityLabel;
  formulary: FormularyLabel;
  formularyOptions: FormularyDrug[];
  context: string;
}): Promise<DecisionResponse | null> {
  const client = (() => {
    try {
      return getOpenAIClient();
    } catch (error) {
      console.warn('OpenAI client unavailable', error);
      return null;
    }
  })();

  if (!client) return null;

  const systemPrompt = `You are an expert clinical decision support system for dermatology biologics within a value-based care model.
Your goal: Recommend the most cost-effective treatment that maintains or improves clinical outcomes.

Decision Matrix Framework:
- STABLE + FORMULARY-ALIGNED → Consider dose reduction
- STABLE + NON-FORMULARY → Switch to formulary-preferred equivalent
- UNSTABLE + FORMULARY-ALIGNED → Optimize current therapy (adherence, dose escalation)
- UNSTABLE + NON-FORMULARY → Switch to formulary-preferred alternative with different mechanism

Provide 1-3 recommendations ranked by:
1. Clinical appropriateness (safety, contraindications)
2. Formulary tier (prefer Tier 1 > Tier 2 > Tier 3)
3. Evidence strength
4. Cost savings potential

If cost information is not provided, explicitly state that savings are qualitative only and avoid fabricating dollar amounts.

For each recommendation, include:
- Specific drug, dose, frequency
- Clinical rationale (why appropriate for this patient)
- Evidence citations from provided context
- Cost comparison (qualitative if costs are unavailable)
- Formulary status (tier, PA requirement)
- Monitoring plan

Output as JSON matching the provided schema.`;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Patient Summary:\n${payload.patientSummary}\n\nAssessment Stability: ${payload.stability}\nFormulary Status: ${payload.formulary}\nRelevant Formulary Options: ${payload.formularyOptions
              .map((option) => `${option.drugName} (Tier ${option.tier})${option.requiresPA ? ' - PA required' : ''}`)
              .join(', ')}\n\nContext:\n${payload.context}`
          }
        ]
      }
    ],
  });

  const rawText = response.output_text?.[0] ?? response.output?.[0]?.content?.[0]?.text;
  if (!rawText) {
    return null;
  }
  const parsed = JSON.parse(rawText);
  return decisionResponseSchema.parse(parsed);
}

function qualitativeCostSummary(currentDrug: FormularyDrug | null, alternative: FormularyDrug | null) {
  if (!currentDrug && !alternative) return 'Cost impact unavailable.';
  if (!currentDrug || !alternative) return 'Cost comparison limited due to missing formulary pricing.';

  const currentTier = currentDrug.tier;
  const altTier = alternative.tier;
  if (altTier < currentTier) {
    return `Qualitatively lower expected spend by moving from Tier ${currentTier} to Tier ${altTier}.`;
  }
  if (altTier === currentTier) {
    return `Similar formulary tier (Tier ${currentTier}); potential savings depend on negotiated rates.`;
  }
  return `Higher formulary tier (${altTier}); ensure clinical justification outweighs potential higher spend.`;
}

function buildRuleBasedRecommendation({
  quadrant,
  currentFormularyDrug,
  currentMedication,
  alternatives
}: {
  quadrant: string;
  currentFormularyDrug: FormularyDrug | null;
  currentMedication: CurrentMedication | null;
  alternatives: FormularyDrug[];
}): DecisionResponse {
  const primaryAlternative = alternatives[0] ?? null;
  const stabilityRationale =
    quadrant.includes('stable')
      ? 'Patient meets disease control criteria for stability based on assessment inputs.'
      : 'Current severity metrics and quality-of-life impact indicate unstable disease control.';
  const formularyRationale = currentFormularyDrug
    ? `Current therapy is Tier ${currentFormularyDrug.tier}${currentFormularyDrug.requiresPA ? ' with prior authorization' : ''}.`
    : 'Current therapy is not present on the plan formulary.';

  const recommendations = [] as DecisionResponse['recommendations'];

  if (quadrant === 'stable_non_formulary' && primaryAlternative) {
    recommendations.push({
      rank: 1,
      drug_name: primaryAlternative.drugName,
      dose: currentMedication?.dose ?? 'Refer to label',
      frequency: currentMedication?.frequency ?? 'Refer to label',
      recommendation_type: 'biosimilar_switch',
      clinical_rationale: 'Stable disease allows formulary-aligned switch to preferred agent of same mechanism.',
      evidence: ['biosimilar-guidance.md'],
      cost_current_annual: null,
      cost_recommended_annual: null,
      savings_annual: null,
      savings_percent: null,
      formulary_tier: primaryAlternative.tier,
      requires_pa: primaryAlternative.requiresPA,
      patient_oop_current_monthly: null,
      patient_oop_recommended_monthly: null,
      monitoring_plan: qualitativeCostSummary(currentFormularyDrug, primaryAlternative)
    });
  } else if (quadrant === 'stable_formulary_aligned' && currentFormularyDrug && currentMedication) {
    recommendations.push({
      rank: 1,
      drug_name: currentMedication.drugName,
      dose: currentMedication.dose,
      frequency: 'Consider extended interval',
      recommendation_type: 'dose_reduction',
      clinical_rationale: 'Stable disease allows cautious dose interval extension with close monitoring.',
      evidence: ['clinical-guidelines.md'],
      cost_current_annual: null,
      cost_recommended_annual: null,
      savings_annual: null,
      savings_percent: null,
      formulary_tier: currentFormularyDrug.tier,
      requires_pa: currentFormularyDrug.requiresPA,
      patient_oop_current_monthly: null,
      patient_oop_recommended_monthly: null,
      monitoring_plan: 'Monitor disease activity (PASI/EASI) at 3 and 6 months post-adjustment.'
    });
  } else if (quadrant === 'unstable_formulary_aligned' && currentFormularyDrug && currentMedication) {
    recommendations.push({
      rank: 1,
      drug_name: currentMedication.drugName,
      dose: currentMedication.dose ?? 'Escalate per label',
      frequency: 'Escalate per label or address adherence',
      recommendation_type: 'optimize_current',
      clinical_rationale: 'Focus on adherence and labeled optimization steps before switching classes.',
      evidence: ['clinical-guidelines.md'],
      cost_current_annual: null,
      cost_recommended_annual: null,
      savings_annual: null,
      savings_percent: null,
      formulary_tier: currentFormularyDrug.tier,
      requires_pa: currentFormularyDrug.requiresPA,
      patient_oop_current_monthly: null,
      patient_oop_recommended_monthly: null,
      monitoring_plan: 'Reassess severity and adherence in 12 weeks; document interventions.'
    });
  } else if (quadrant === 'unstable_non_formulary' && primaryAlternative) {
    recommendations.push({
      rank: 1,
      drug_name: primaryAlternative.drugName,
      dose: primaryAlternative.biosimilarOf ? (currentMedication?.dose ?? 'Match current regimen') : 'Refer to label',
      frequency: primaryAlternative.biosimilarOf ? (currentMedication?.frequency ?? 'Match current regimen') : 'Refer to label',
      recommendation_type: 'therapeutic_switch',
      clinical_rationale: 'Unstable disease on non-formulary agent warrants switch to preferred mechanism/tier.',
      evidence: ['therapeutic-equivalence.md'],
      cost_current_annual: null,
      cost_recommended_annual: null,
      savings_annual: null,
      savings_percent: null,
      formulary_tier: primaryAlternative.tier,
      requires_pa: primaryAlternative.requiresPA,
      patient_oop_current_monthly: null,
      patient_oop_recommended_monthly: null,
      monitoring_plan: qualitativeCostSummary(currentFormularyDrug, primaryAlternative)
    });
  }

  if (recommendations.length === 0 && currentFormularyDrug && currentMedication) {
    recommendations.push({
      rank: 1,
      drug_name: currentMedication.drugName,
      dose: currentMedication.dose ?? 'Refer to label',
      frequency: currentMedication.frequency ?? 'Refer to label',
      recommendation_type: 'optimize_current',
      clinical_rationale: 'Maintain current therapy with enhanced monitoring due to limited data.',
      evidence: [],
      cost_current_annual: null,
      cost_recommended_annual: null,
      savings_annual: null,
      savings_percent: null,
      formulary_tier: currentFormularyDrug.tier,
      requires_pa: currentFormularyDrug.requiresPA,
      patient_oop_current_monthly: null,
      patient_oop_recommended_monthly: null,
      monitoring_plan: 'Continue regular assessments.'
    });
  }

  return {
    quadrant,
    stability_rationale,
    formulary_rationale,
    recommendations
  };
}

export async function analyzePatient(patient: PatientData, assessment: ClinicalAssessment) {
  const stabilityStatus = determineStability(assessment);
  const currentMedName = patient.currentMedication?.drugName?.toLowerCase();
  const currentFormularyDrug = patient.insurancePlan.formularyDrugs.find((drug) =>
    drug.drugName.toLowerCase() === currentMedName
  ) ?? null;

  const formularyStatus = determineFormularyStatus(currentFormularyDrug);
  const quadrant = getQuadrant(stabilityStatus, formularyStatus);

  const ragContextResults = await retrieveRelevantContext(
    `${assessment.diagnosis} ${patient.currentMedication?.drugName ?? ''} ${stabilityStatus} ${formularyStatus}`
  );
  const contextString = ragContextResults
    .map((match) => `Source: ${match.metadata?.source ?? match.id}\n${match.content}`)
    .join('\n\n');

  const patientSummary = buildContextSummary(patient, assessment, currentFormularyDrug);

  const candidateAlternatives = patient.insurancePlan.formularyDrugs
    .filter((drug) => {
      if (!currentFormularyDrug) return true;
      if (quadrant === 'stable_non_formulary' || quadrant === 'unstable_non_formulary') {
        return drug.tier <= currentFormularyDrug.tier && drug.id !== currentFormularyDrug.id;
      }
      return drug.id !== currentFormularyDrug.id;
    })
    .sort((a, b) => a.tier - b.tier);

  let decision: DecisionResponse | null = null;
  try {
    decision = await callLLM({
      patientSummary,
      assessment,
      stability: stabilityStatus,
      formulary: formularyStatus,
      formularyOptions: candidateAlternatives.slice(0, 6),
      context: contextString
    });
  } catch (error) {
    console.error('LLM decision engine failed', error);
  }

  if (!decision) {
    decision = buildRuleBasedRecommendation({
      quadrant,
      currentFormularyDrug: currentFormularyDrug,
      currentMedication: patient.currentMedication,
      alternatives: candidateAlternatives
    });
  }

  const recommendationsWithCosts = decision.recommendations.map((reco) => {
    const alternateDrug = patient.insurancePlan.formularyDrugs.find((drug) =>
      drug.drugName.toLowerCase() === reco.drug_name.toLowerCase()
    );
    return mapRecommendationCosts(reco, currentFormularyDrug, alternateDrug ?? null);
  });

  return {
    stabilityStatus,
    formularyStatus,
    quadrant,
    stabilityRationale: decision.stability_rationale,
    formularyRationale: decision.formulary_rationale,
    recommendations: recommendationsWithCosts,
    context: contextString,
    costSummary: recommendationsWithCosts.map((item) =>
      item.cost_current_annual && item.cost_recommended_annual
        ? `${item.drug_name}: ${formatCurrency(item.cost_recommended_annual)} vs ${formatCurrency(item.cost_current_annual)}`
        : `${item.drug_name}: qualitative savings (${qualitativeCostSummary(currentFormularyDrug, patient.insurancePlan.formularyDrugs.find((drug) =>
            drug.drugName.toLowerCase() === item.drug_name.toLowerCase()
          ) ?? null)})`
    )
  };
}
