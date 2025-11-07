import { determineStability, determineFormularyStatus, analyzePatient } from '@/lib/llm/decision-engine';
import { ClinicalAssessment, FormularyDrug, Prisma } from '@prisma/client';

jest.mock('@/lib/rag/retrieve', () => ({
  retrieveRelevantContext: jest.fn().mockResolvedValue([])
}));

jest.mock('@/lib/llm/openai-client', () => ({
  getOpenAIClient: jest.fn(() => {
    throw new Error('OpenAI disabled for tests');
  })
}));

describe('Decision engine helpers', () => {
  const baseAssessment: ClinicalAssessment = {
    id: 'a',
    patientId: 'p',
    assessedBy: 'u',
    assessmentDate: new Date(),
    diagnosis: 'PSORIASIS',
    severityScoreType: 'PASI',
    severityScore: new Prisma.Decimal(3),
    severityDurationMonths: 12,
    dlqiScore: 3,
    adverseEvents: null,
    comorbidities: null,
    providerNotes: null,
    createdAt: new Date()
  };

  it('classifies stability correctly for psoriasis', () => {
    expect(determineStability(baseAssessment)).toBe('STABLE');
    expect(
      determineStability({ ...baseAssessment, severityScore: new Prisma.Decimal(6) })
    ).toBe('UNSTABLE');
  });

  it('classifies formulary tiers', () => {
    const tier1: FormularyDrug = {
      id: '1',
      planId: 'plan',
      drugName: 'Test',
      genericName: 'Generic',
      drugClass: 'TNF_INHIBITOR',
      tier: 1,
      requiresPA: false,
      stepTherapyRequired: false,
      annualCostWAC: null,
      memberCopayT1: null,
      memberCopayT2: null,
      memberCopayT3: null,
      biosimilarOf: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    expect(determineFormularyStatus(tier1)).toBe('OPTIMAL');
    expect(determineFormularyStatus({ ...tier1, tier: 3, requiresPA: true })).toBe('SUBOPTIMAL');
    expect(determineFormularyStatus({ ...tier1, tier: 5 })).toBe('NON_FORMULARY');
  });

  it('falls back to rule-based recommendations when LLM is unavailable', async () => {
    const patient: any = {
      id: 'p1',
      firstName: 'Test',
      lastName: 'Patient',
      dateOfBirth: new Date(),
      insurancePlan: {
        planName: 'Test Plan',
        formularyDrugs: [
          {
            id: 'f1',
            planId: 'plan',
            drugName: 'Humira',
            genericName: 'adalimumab',
            drugClass: 'TNF_INHIBITOR',
            tier: 3,
            requiresPA: true,
            stepTherapyRequired: false,
            annualCostWAC: new Prisma.Decimal(84000),
            memberCopayT1: null,
            memberCopayT2: null,
            memberCopayT3: new Prisma.Decimal(850),
            biosimilarOf: null,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: 'f2',
            planId: 'plan',
            drugName: 'Amjevita',
            genericName: 'adalimumab-atto',
            drugClass: 'TNF_INHIBITOR',
            tier: 1,
            requiresPA: false,
            stepTherapyRequired: false,
            annualCostWAC: new Prisma.Decimal(28500),
            memberCopayT1: new Prisma.Decimal(25),
            memberCopayT2: null,
            memberCopayT3: null,
            biosimilarOf: 'Humira',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      },
      currentMedication: {
        drugName: 'Humira',
        dose: '40mg',
        frequency: 'Q2W',
        route: 'SC',
        startDate: new Date('2023-01-01'),
        lastFillDate: new Date('2024-12-01'),
        adherencePDC: new Prisma.Decimal(94),
        createdAt: new Date(),
        updatedAt: new Date(),
        id: 'cm1',
        patientId: 'p1'
      },
      claimsHistory: [],
      pharmacyClaims: []
    };

    const result = await analyzePatient(patient, baseAssessment);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.quadrant).toBe('stable_non_formulary');
  });
});
