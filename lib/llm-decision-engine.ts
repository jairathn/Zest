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

// Lazy initialization to avoid build-time errors
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
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
  return dlqiScore <= 1 && monthsStable < 6;
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
      ? (currentFormularyDrug.tier === 1 && !currentFormularyDrug.requiresPA)
      : false;
    return {
      isStable: true, // Patient IS stable, just not for long enough
      isFormularyOptimal,
      quadrant: 'stable_short_duration'
    };
  }

  // Stability: DLQI ≤1 (no effect on life) and ≥6 months stable
  const isStable = dlqiScore <= 1 && monthsStable >= 6;

  // Formulary optimal: ONLY Tier 1 without PA
  // Tier 2-3 = suboptimal even if "aligned"
  const isFormularyOptimal = currentFormularyDrug
    ? (currentFormularyDrug.tier === 1 && !currentFormularyDrug.requiresPA)
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
  quadrant: string
): Promise<TriageResult> {
  const prompt = `You are a clinical decision support AI for dermatology biologic optimization.

Patient Information:
- Diagnosis: ${assessment.diagnosis}
- Current medication: ${currentDrug || 'None (not on biologic)'}
- DLQI Score: ${assessment.dlqiScore} (0-30 scale, lower is better)
- Months stable: ${assessment.monthsStable}
- Has psoriatic arthritis: ${assessment.hasPsoriaticArthritis ? 'Yes' : 'No'}
- Additional notes: ${assessment.additionalNotes || 'None'}

Formulary Status:
- Tier: ${formularyDrug?.tier || 'Unknown'}
- Requires PA: ${formularyDrug?.requiresPA ? 'Yes' : 'No'}
- Classification: ${quadrant.replace(/_/g, ' ').toUpperCase()}

The patient has been classified as: ${quadrant}
- not_on_biologic: Patient needs biologic initiation → Recommend best Tier 1 option
- stable_short_duration: Patient is stable (DLQI ≤1) but for <6 months → Continue current therapy, re-evaluate after sufficient time
- stable_optimal: Stable + Tier 1 without PA → Consider dose reduction OR within-tier optimization
- stable_suboptimal: Stable + Tier 2-3 → MUST recommend switch to Tier 1
- unstable_optimal: Unstable + Tier 1 → Consider different Tier 1 option or optimize current
- unstable_suboptimal: Unstable + Tier 2-3 → ⚠️ MUST recommend switch to Tier 1 (NEVER just continue or optimize current)

CRITICAL: Tier 2 and Tier 3 indicate room for optimization. These patients should ALWAYS get switch recommendations to Tier 1.

Based on the quadrant "${quadrant}", determine:
1. Should dose reduction be considered? (Only for stable_optimal AND currently Tier 1, NOT for stable_short_duration)
2. Should formulary switch be recommended? (YES for any "suboptimal" OR "not_on_biologic", NOT for stable_short_duration)
3. Should recommend biologic initiation? (YES for "not_on_biologic")
4. Should continue current therapy? (YES for stable_short_duration)
5. Provide clinical reasoning

Return ONLY a JSON object with this exact structure:
{
  "canDoseReduce": boolean,
  "shouldSwitch": boolean,
  "needsInitiation": boolean,
  "shouldContinueCurrent": boolean,
  "quadrant": "${quadrant}",
  "reasoning": "string"
}`;

  const openai = getOpenAI();
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
 * Step 3: Targeted RAG Retrieval based on triage result
 */
async function retrieveRelevantEvidence(
  drugName: string | null,
  diagnosis: DiagnosisType,
  triage: TriageResult
): Promise<string[]> {
  const queries: string[] = [];

  // Biologic initiation - get efficacy data for condition
  if (triage.needsInitiation) {
    queries.push(`${diagnosis} biologic efficacy comparison first-line therapy`);
    queries.push(`${diagnosis} treatment guidelines biologic selection`);
    queries.push(`${diagnosis} biologic initiation best outcomes`);
  }
  // Continue current - minimal evidence needed, just dose reduction possibilities for future
  else if (triage.shouldContinueCurrent && drugName) {
    queries.push(`${drugName} dose reduction interval extension ${diagnosis} stable patients`);
    // Limited evidence retrieval - just for future reference
  }
  // Switch evidence for suboptimal patients
  else if (triage.shouldSwitch && drugName) {
    queries.push(`biosimilar switching ${drugName} ${diagnosis} efficacy`);
    queries.push(`${drugName} to alternative ${diagnosis} outcomes`);
    queries.push(`formulary optimization biologics ${diagnosis} cost effectiveness`);
  }
  // Dose reduction evidence for optimal stable patients
  else if (triage.canDoseReduce && drugName) {
    queries.push(`${drugName} dose reduction interval extension ${diagnosis} stable patients`);
    queries.push(`${drugName} extended dosing efficacy ${diagnosis}`);
  }
  // General evidence
  else if (drugName) {
    queries.push(`${drugName} ${diagnosis} treatment guidelines`);
  }

  // Retrieve evidence for each query using dynamic similarity threshold
  const evidenceResults = await Promise.all(
    queries.map(query => searchKnowledge(query, {
      minSimilarity: 0.65,  // Only include moderately relevant chunks
      maxResults: 10         // Cap to avoid context overflow
    }))
  );

  // Flatten and extract content
  const allEvidence = evidenceResults.flat();
  return allEvidence.map(e => `${e.title}: ${e.content.substring(0, 500)}...`);
}

/**
 * Filter drugs by approved indications for the patient's diagnosis
 */
function filterByDiagnosis(
  drugs: FormularyDrug[],
  diagnosis: DiagnosisType
): FormularyDrug[] {
  return drugs.filter(drug => {
    // If no indications specified, include it (for backward compatibility)
    if (!drug.approvedIndications || drug.approvedIndications.length === 0) {
      return true;
    }
    // Check if the diagnosis is in the approved indications list
    return drug.approvedIndications.includes(diagnosis);
  });
}

/**
 * Filter out contraindicated drugs based on patient contraindications
 */
function filterContraindicated(
  drugs: FormularyDrug[],
  contraindications: Contraindication[]
): FormularyDrug[] {
  if (contraindications.length === 0) return drugs;

  const contraindicationTypes = contraindications.map(c => c.type);

  return drugs.filter(drug => {
    // TNF inhibitors contraindicated in CHF and MS
    if (drug.drugClass === 'TNF_INHIBITOR') {
      if (contraindicationTypes.includes('HEART_FAILURE')) return false;
      if (contraindicationTypes.includes('MULTIPLE_SCLEROSIS')) return false;
    }

    // IL-17 inhibitors can worsen IBD
    if (drug.drugClass === 'IL17_INHIBITOR') {
      if (contraindicationTypes.includes('INFLAMMATORY_BOWEL_DISEASE')) return false;
    }

    // All biologics contraindicated in active infection
    if (contraindicationTypes.includes('ACTIVE_INFECTION')) {
      return false;
    }

    return true;
  });
}

/**
 * Step 4: LLM Decision-Making with retrieved context
 */
async function getLLMRecommendationSuggestions(
  assessment: AssessmentInput,
  currentDrug: string | null,
  triage: TriageResult,
  evidence: string[],
  formularyOptions: FormularyDrug[],
  currentFormularyDrug: FormularyDrug | null,
  contraindications: Contraindication[]
): Promise<LLMRecommendation[]> {
  const contraindicationText = contraindications.length > 0
    ? contraindications.map(c => c.type).join(', ')
    : 'None';

  // Show top 10 formulary options, prioritizing lower tiers
  const formularyText = formularyOptions
    .filter(d => !currentDrug || d.drugName.toLowerCase() !== currentDrug.toLowerCase()) // Exclude current drug if exists
    .slice(0, 10)
    .map(d => `${d.drugName} (${d.drugClass}, Tier ${d.tier}, PA: ${d.requiresPA ? 'Yes' : 'No'}, Annual Cost: $${d.annualCostWAC})`)
    .join('\n');

  const evidenceText = evidence.length > 0
    ? evidence.join('\n\n')
    : 'No specific evidence retrieved from knowledge base.';

  const prompt = `You are a clinical decision support AI for dermatology biologic optimization.

Patient Information:
- Current medication: ${currentDrug || 'None (not on biologic)'}
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

CONTRAINDICATION RULES (CRITICAL - NEVER recommend contraindicated drugs):
- TNF inhibitors (adalimumab, infliximab, etanercept): CONTRAINDICATED if HEART_FAILURE or MULTIPLE_SCLEROSIS
- IL-17 inhibitors (secukinumab, ixekizumab, brodalumab): Can worsen INFLAMMATORY_BOWEL_DISEASE
- ALL biologics: CONTRAINDICATED if ACTIVE_INFECTION
- Contraindicated drugs have been PRE-FILTERED from formulary options shown above

CRITICAL TIER OPTIMIZATION RULES:
⚠️ **Tier 2 and Tier 3 should ALMOST NEVER result in CONTINUE or just OPTIMIZE_CURRENT**
   - There is ALWAYS room to optimize by moving to Tier 1
   - Generate SWITCH recommendations to Tier 1 drugs
   - Only use CONTINUE if you absolutely cannot generate 3 switch options

⚠️ **CONTINUE should ONLY be used when:**
   - Already on Tier 1 AND stable AND dose-reduced/optimized (truly no more optimization possible)
   - OR you cannot generate 3 other recommendations despite trying

CLINICAL DECISION-MAKING GUIDELINES:
1. **not_on_biologic**: Recommend BEST Tier 1 option based on:
   - Highest efficacy for ${assessment.diagnosis} (cite RAG evidence)
   - Psoriatic arthritis coverage if needed: ${assessment.hasPsoriaticArthritis ? 'YES - prefer drugs with PsA indication' : 'NO'}
   - Lowest cost within Tier 1
   - Generate 2-3 Tier 1 options if available

2. **stable_short_duration** (DLQI ≤1 but <6 months stable):
   - PRIMARY: CONTINUE_CURRENT - patient has excellent control but insufficient duration
   - Calculate months needed to reach 6 months total: ${6 - assessment.monthsStable} more months
   - OPTION 2 & 3: Mention future options to consider once 6 months stability is achieved (formulary switches or dose reduction as appropriate)
   - Rationale: Premature optimization risks disrupting newly achieved stability

3. **stable_optimal** (Tier 1, stable ≥6 months):
   - PRIMARY: Dose reduction (cite RAG evidence for safety/efficacy of extended intervals)
   - ALTERNATIVE: Switch to different Tier 1 ONLY if biosimilar or significantly lower cost

4. **stable_suboptimal** - TIER-SPECIFIC STRATEGY:

   a. **Tier 2 (stable)** - Two options, ranked by cost savings:
      - OPTION 1 (Preferred): Switch to Tier 1 biosimilar or same-class drug
      - OPTION 2 (Alternative): Dose reduction of current Tier 2 drug (cite RAG evidence)
      - Rank by total cost optimization potential
      - No RAG needed for switch rationale (formulary alignment is self-evident)

   b. **Tier 3 (stable)** - Switch ONLY (NEVER dose reduce):
      - MUST switch to Tier 1 or Tier 2 (prefer Tier 1)
      - Prioritize biosimilars of same drug if available
      - Then same-class drugs
      - Then cross-class if better efficacy
      - No RAG needed for switch rationale (cost optimization is obvious)

5. **unstable_optimal** (Tier 1, unstable):
   - Switch to different Tier 1 with superior efficacy (cite evidence)
   - Prefer different mechanism of action (e.g., if TNF failed, try IL-17 or IL-23)
   - Target drugs with proven higher efficacy for ${assessment.diagnosis}

6. **unstable_suboptimal** (Tier 2-3, unstable):
   - Switch to Tier 1 drug with best efficacy for ${assessment.diagnosis} (cite evidence)
   - Prefer different mechanism if current class failing
   - If Tier 3 and same class as better Tier 1/2 option, recommend that

PRIORITIZATION:
- Always prefer Tier 1 > Tier 2 > Tier 3
- Within same tier: Higher efficacy > Lower cost
- For ${assessment.diagnosis}, consider drug class preferences from guidelines

EVIDENCE REQUIREMENTS (RAG):
- **DOSE REDUCTION ONLY**: Cite RAG evidence (clinically controversial, needs literature support)
- **FORMULARY SWITCHES**: NO RAG - cost optimization is self-evident business case
- **THERAPEUTIC SWITCHES** (unstable escalation): NO RAG - standard clinical practice, provide rationale but no citations needed

Generate AT LEAST 3 specific recommendations ranked by clinical benefit and cost savings. For EACH recommendation:
1. Type (DOSE_REDUCTION, SWITCH_TO_BIOSIMILAR, SWITCH_TO_PREFERRED, THERAPEUTIC_SWITCH, OPTIMIZE_CURRENT, or CONTINUE_CURRENT)
2. Specific drug name (MUST be from formulary options above, or current drug for CONTINUE_CURRENT/OPTIMIZE_CURRENT)
3. New dose:
   - DOSE_REDUCTION: Extract SPECIFIC reduced dose from RAG evidence (e.g., "40 mg")
   - SWITCHES: Provide FDA-approved SPECIFIC dose (e.g., "80 mg initial, then 40 mg" or "300 mg")
   - NEVER use generic phrases like "Per label" - always specify the actual dose
4. New frequency:
   - DOSE_REDUCTION: Extract SPECIFIC reduced interval from RAG evidence (e.g., "every 4 weeks" instead of "every 2 weeks")
   - SWITCHES: Provide FDA-approved SPECIFIC frequency (e.g., "every 2 weeks starting 1 week after initial dose")
   - NEVER use generic phrases like "Per label" - always specify the actual interval
5. Detailed rationale:
   - DOSE_REDUCTION: MUST cite specific RAG evidence (trials, studies, intervals)
   - SWITCHES (formulary or therapeutic): Provide clear clinical reasoning, NO RAG citations needed
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
    const openai = getOpenAI();
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
  };

  const currentBiologic = patient.currentBiologics[0];
  const hasCurrentBiologic = !!currentBiologic;

  // Normalize drug name to generic (or null if not on biologic)
  const genericDrugName = currentBiologic
    ? await normalizeToGeneric(currentBiologic.drugName)
    : null;

  // Find current drug in formulary (match by brand name OR generic name)
  const currentFormularyDrug = currentBiologic
    ? patientWithFormulary.plan.formularyDrugs.find(drug => {
        const brandMatch = drug.drugName.toLowerCase() === currentBiologic.drugName.toLowerCase();
        const genericMatch = genericDrugName && (
          drug.genericName.toLowerCase() === genericDrugName.toLowerCase() ||
          drug.genericName.toLowerCase().startsWith(genericDrugName.toLowerCase() + '-') // biosimilar suffix
        );
        return brandMatch || genericMatch;
      }) ?? null
    : null;

  // Step 1: Determine quadrant using hard-coded rules (don't trust LLM for this)
  const { isStable, isFormularyOptimal, quadrant } = determineQuadrantAndStatus(
    assessment.dlqiScore,
    assessment.monthsStable,
    currentFormularyDrug || null,
    hasCurrentBiologic
  );
  console.log(`Quadrant determination: ${quadrant}, hasCurrentBiologic: ${hasCurrentBiologic}, isStable: ${isStable}, isFormularyOptimal: ${isFormularyOptimal}, Tier: ${currentFormularyDrug?.tier}`);

  // Step 2: Get LLM clinical reasoning
  const triage = await triagePatient(assessment, genericDrugName || 'None', currentFormularyDrug || null, quadrant);
  console.log('Triage result:', JSON.stringify(triage));

  // Step 3: Targeted RAG Retrieval (for LLM context, not for display)
  // Note: This evidence helps the LLM generate recommendations but won't be shown to users
  // Drug-specific evidence for DOSE_REDUCTION will be retrieved separately in Step 5
  const evidence = await retrieveRelevantEvidence(genericDrugName, assessment.diagnosis, triage);
  console.log(`Retrieved ${evidence.length} evidence chunks for LLM context`);

  // Step 4: Filter drugs by diagnosis, then by contraindications
  const diagnosisAppropriateDrugs = filterByDiagnosis(patientWithFormulary.plan.formularyDrugs, assessment.diagnosis);
  const safeFormularyDrugs = filterContraindicated(diagnosisAppropriateDrugs, patient.contraindications);
  console.log(`Filtered formulary: ${patientWithFormulary.plan.formularyDrugs.length} total → ${diagnosisAppropriateDrugs.length} for ${assessment.diagnosis} → ${safeFormularyDrugs.length} safe`);

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
  const llmRecs = await getLLMRecommendationSuggestions(
    assessment,
    genericDrugName,
    triage,
    evidence,
    sortedFormularyDrugs,
    currentFormularyDrug || null,
    patient.contraindications
  );

  // Step 5: Add cost calculations and retrieve drug-specific evidence for dose reduction
  // TRUE RAG: Only retrieve evidence for DOSE_REDUCTION (needs literature to convince clinicians)
  // Formulary switches don't need RAG - they're straightforward cost optimizations
  const recommendations = await Promise.all(llmRecs.map(async rec => {
    const targetDrug = rec.drugName
      ? patientWithFormulary.plan.formularyDrugs.find(d => d.drugName.toLowerCase() === rec.drugName?.toLowerCase()) ?? null
      : null;

    const costData = calculateCostSavings(rec, currentFormularyDrug, targetDrug);

    // Retrieve drug-specific evidence ONLY for dose reduction recommendations
    // Uses dynamic similarity-based retrieval to ensure all relevant evidence is included
    let drugSpecificEvidence: string[] = [];
    if (rec.type === 'DOSE_REDUCTION' && rec.drugName) {
      const queries = [
        `${rec.drugName} dose reduction interval extension ${assessment.diagnosis} stable patients`,
        `${rec.drugName} extended dosing efficacy safety ${assessment.diagnosis}`,
        `${rec.drugName} treatment optimization ${assessment.diagnosis} guidelines`
      ];

      // Use dynamic similarity threshold (0.65 = moderately relevant)
      // This retrieves 0-10 chunks per query based on actual relevance
      const evidenceResults = await Promise.all(
        queries.map(query => searchKnowledge(query, {
          minSimilarity: 0.65,  // Only include chunks with >65% similarity
          maxResults: 10         // Cap at 10 to avoid overwhelming context
        }))
      );

      // Flatten and format evidence with similarity scores for transparency
      // Filter out metadata patterns and show longer excerpts (800 chars) for better context
      drugSpecificEvidence = evidenceResults
        .flat()
        .map(e => {
          // Clean content: remove common PDF metadata patterns
          let cleanContent = e.content
            .replace(/^.*?(Abstract|ABSTRACT|Background\/objectives?|Introduction|INTRODUCTION):/i, '$1:')
            .replace(/^\s*[A-Z][a-z]+\s+[A-Z][a-z]+,?\s+[A-Z]\..*?\n/gm, '') // Author names
            .replace(/^\s*\d+\s*$/gm, '') // Page numbers alone on a line
            .replace(/doi:\s*\S+/gi, '') // DOI references
            .trim();

          return `${e.title} (relevance: ${(e.similarity * 100).toFixed(0)}%): ${cleanContent.substring(0, 800)}...`;
        });
    }

    // For dose reduction, display the BRAND name (Amjevita) not generic (adalimumab)
    // since Amjevita, Hyrimoz, and Humira are all adalimumab but different products
    const displayDrugName = rec.type === 'DOSE_REDUCTION' && currentBiologic
      ? currentBiologic.drugName  // Brand name: "Amjevita"
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
      evidenceSources: drugSpecificEvidence, // Show all dynamically retrieved evidence
      monitoringPlan: rec.monitoringPlan,
      // For DOSE_REDUCTION, use current drug's tier (no target drug, staying on same medication)
      // For switches, use target drug's tier
      tier: rec.type === 'DOSE_REDUCTION'
        ? currentFormularyDrug?.tier
        : (targetDrug?.tier || currentFormularyDrug?.tier),
      requiresPA: rec.type === 'DOSE_REDUCTION'
        ? currentFormularyDrug?.requiresPA
        : (targetDrug?.requiresPA || currentFormularyDrug?.requiresPA),
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

  return {
    isStable,
    isFormularyOptimal,
    quadrant,
    recommendations: recommendations.slice(0, 3),
    formularyReference,
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
