import OpenAI from 'openai';
import { prisma } from './db';
import { searchKnowledge } from './rag/embeddings';
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
 * Step 1: LLM Triage - Determine if patient is candidate for dose reduction, switch, both, or neither
 */
async function triagePatient(
  assessment: AssessmentInput,
  currentDrug: string,
  formularyDrug: FormularyDrug | null
): Promise<TriageResult> {
  const prompt = `You are a clinical decision support AI for dermatology biologic optimization.

Patient Information:
- Diagnosis: ${assessment.diagnosis}
- Current medication: ${currentDrug}
- DLQI Score: ${assessment.dlqiScore} (0-30 scale, lower is better)
- Months stable: ${assessment.monthsStable}
- Has psoriatic arthritis: ${assessment.hasPsoriaticArthritis ? 'Yes' : 'No'}
- Additional notes: ${assessment.additionalNotes || 'None'}

Formulary Status:
- Tier: ${formularyDrug?.tier || 'Unknown'}
- Requires PA: ${formularyDrug?.requiresPA ? 'Yes' : 'No'}

Based on this information, determine:
1. Is the patient stable enough to consider dose reduction? (DLQI ≤5 and stable ≥6 months typically required)
2. Is a formulary switch recommended? (High tier or PA required while stable)
3. What quadrant is the patient in?
   - stable_formulary_aligned: Stable disease, optimal formulary position
   - stable_non_formulary: Stable disease, non-optimal formulary (high tier or PA)
   - unstable_formulary_aligned: Unstable disease, optimal formulary position
   - unstable_non_formulary: Unstable disease, non-optimal formulary

Return ONLY a JSON object with this exact structure:
{
  "canDoseReduce": boolean,
  "shouldSwitch": boolean,
  "quadrant": string,
  "reasoning": string
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  return result as TriageResult;
}

/**
 * Step 2: Targeted RAG Retrieval based on triage result
 */
async function retrieveRelevantEvidence(
  drugName: string,
  diagnosis: DiagnosisType,
  triage: TriageResult
): Promise<string[]> {
  const queries: string[] = [];

  if (triage.canDoseReduce) {
    queries.push(`${drugName} dose reduction interval extension ${diagnosis} stable patients`);
    queries.push(`${drugName} extended dosing efficacy ${diagnosis}`);
  }

  if (triage.shouldSwitch) {
    queries.push(`biosimilar switching ${drugName} ${diagnosis}`);
    queries.push(`formulary optimization biologics ${diagnosis}`);
  }

  // Retrieve evidence for each query
  const evidenceResults = await Promise.all(
    queries.map(query => searchKnowledge(query, 3))
  );

  // Flatten and extract content
  const allEvidence = evidenceResults.flat();
  return allEvidence.map(e => `${e.title}: ${e.content.substring(0, 500)}...`);
}

/**
 * Step 3: LLM Decision-Making with retrieved context
 */
async function getLLMRecommendationSuggestions(
  assessment: AssessmentInput,
  currentDrug: string,
  triage: TriageResult,
  evidence: string[],
  formularyOptions: FormularyDrug[],
  currentFormularyDrug: FormularyDrug | null,
  contraindications: Contraindication[]
): Promise<LLMRecommendation[]> {
  const contraindicationText = contraindications.length > 0
    ? contraindications.map(c => c.type).join(', ')
    : 'None';

  const formularyText = formularyOptions
    .slice(0, 5)
    .map(d => `${d.drugName} (${d.drugClass}, Tier ${d.tier}, PA: ${d.requiresPA ? 'Yes' : 'No'}, Annual Cost: $${d.annualCostWAC})`)
    .join('\n');

  const evidenceText = evidence.length > 0
    ? evidence.join('\n\n')
    : 'No specific evidence retrieved from knowledge base.';

  const prompt = `You are a clinical decision support AI for dermatology biologic optimization.

Patient Information:
- Current medication: ${currentDrug}
- Diagnosis: ${assessment.diagnosis}
- DLQI Score: ${assessment.dlqiScore}
- Months stable: ${assessment.monthsStable}
- Quadrant: ${triage.quadrant}
- Triage reasoning: ${triage.reasoning}
- Contraindications: ${contraindicationText}

Current Formulary Status:
${currentFormularyDrug ? `Tier ${currentFormularyDrug.tier}, PA: ${currentFormularyDrug.requiresPA ? 'Yes' : 'No'}, Annual Cost: $${currentFormularyDrug.annualCostWAC}` : 'Not on formulary'}

Available Formulary Options:
${formularyText}

Clinical Evidence:
${evidenceText}

Based on this information, generate 1-3 specific cost-saving recommendations. For EACH recommendation, provide:
1. Type (DOSE_REDUCTION, SWITCH_TO_BIOSIMILAR, SWITCH_TO_PREFERRED, THERAPEUTIC_SWITCH, or OPTIMIZE_CURRENT)
2. Specific drug name (if switching)
3. New dose (if dose reduction, extract from evidence)
4. New frequency (if dose reduction, extract interval from evidence - e.g., "every 12 weeks")
5. Detailed rationale citing clinical evidence
6. Monitoring plan

Return ONLY a JSON object with this exact structure:
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0].message.content || '{}';
    console.log('LLM Response:', content); // Debug logging
    const parsed = JSON.parse(content);

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
 * Step 4: Calculate cost savings
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

  if (!patient || !patient.plan) {
    throw new Error('Patient or plan not found');
  }

  const currentBiologic = patient.currentBiologics[0];
  if (!currentBiologic) {
    throw new Error('No current biologic found for patient');
  }

  // Normalize drug name to generic
  const genericDrugName = await normalizeToGeneric(currentBiologic.drugName);

  // Find current drug in formulary
  const currentFormularyDrug = patient.plan.formularyDrugs.find(
    drug => drug.drugName.toLowerCase() === genericDrugName.toLowerCase()
  );

  // Step 1: LLM Triage
  const triage = await triagePatient(assessment, genericDrugName, currentFormularyDrug || null);

  // Step 2: Targeted RAG Retrieval
  const evidence = await retrieveRelevantEvidence(genericDrugName, assessment.diagnosis, triage);

  // Step 3: LLM Recommendations
  const llmRecs = await getLLMRecommendationSuggestions(
    assessment,
    genericDrugName,
    triage,
    evidence,
    patient.plan.formularyDrugs,
    currentFormularyDrug || null,
    patient.contraindications
  );

  // Step 4: Add cost calculations and format
  const recommendations = llmRecs.map(rec => {
    const targetDrug = rec.drugName
      ? patient.plan!.formularyDrugs.find(d => d.drugName.toLowerCase() === rec.drugName?.toLowerCase())
      : null;

    const costData = calculateCostSavings(rec, currentFormularyDrug || null, targetDrug);

    return {
      rank: rec.rank,
      type: rec.type,
      drugName: rec.drugName || genericDrugName,
      newDose: rec.newDose,
      newFrequency: rec.newFrequency,
      ...costData,
      rationale: rec.rationale,
      evidenceSources: evidence.slice(0, 3).map(e => e.split(':')[0]), // Extract titles
      monitoringPlan: rec.monitoringPlan,
      tier: targetDrug?.tier || currentFormularyDrug?.tier,
      requiresPA: targetDrug?.requiresPA || currentFormularyDrug?.requiresPA,
      contraindicated: false, // LLM should handle contraindications in rationale
      contraindicationReason: undefined,
    };
  });

  return {
    isStable: triage.canDoseReduce,
    isFormularyOptimal: !triage.shouldSwitch,
    quadrant: triage.quadrant,
    recommendations: recommendations.slice(0, 3),
  };
}
