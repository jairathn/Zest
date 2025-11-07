import { NextRequest } from 'next/server';
import { POST as assessmentHandler } from '@/app/api/patients/[id]/assessment/route';
import { PATCH as recommendationPatch, GET as recommendationGet } from '@/app/api/recommendations/[id]/route';

type PrismaMock = {
  patient: any;
  clinicalAssessment: any;
  recommendation: any;
};

const mockPrisma: PrismaMock = {
  patient: {
    findUnique: jest.fn()
  },
  clinicalAssessment: {
    create: jest.fn()
  },
  recommendation: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn()
  }
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

jest.mock('@/lib/llm/decision-engine', () => ({
  analyzePatient: jest.fn(async () => ({
    stabilityStatus: 'STABLE',
    formularyStatus: 'NON_FORMULARY',
    quadrant: 'stable_non_formulary',
    recommendations: [
      {
        rank: 1,
        drug_name: 'Amjevita',
        dose: '40mg',
        frequency: 'Q2W',
        recommendation_type: 'biosimilar_switch',
        clinical_rationale: 'Reason',
        evidence: ['source'],
        cost_current_annual: null,
        cost_recommended_annual: null,
        savings_annual: null,
        savings_percent: null,
        formulary_tier: 1,
        requires_pa: false,
        patient_oop_current_monthly: null,
        patient_oop_recommended_monthly: null,
        monitoring_plan: 'Monitor'
      }
    ]
  }))
}));

function createRequest(body: any) {
  return new NextRequest('http://localhost/api', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

describe('Recommendation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates assessment and recommendation', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 'patient',
      currentMedication: {},
      claimsHistory: [],
      pharmacyClaims: [],
      insurancePlan: { formularyDrugs: [] }
    });
    mockPrisma.clinicalAssessment.create.mockResolvedValue({ id: 'assessment' });
    mockPrisma.recommendation.create.mockResolvedValue({ id: 'rec' });

    const req = createRequest({
      assessmentDate: new Date().toISOString(),
      diagnosis: 'PSORIASIS',
      severityScoreType: 'PASI',
      severityScore: 3,
      severityDurationMonths: 12,
      dlqiScore: 3
    });

    const response = await assessmentHandler(req as any, { params: { id: 'patient' } });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.recommendation.id).toBe('rec');
  });

  it('updates recommendation decision', async () => {
    mockPrisma.recommendation.update.mockResolvedValue({ id: 'rec', providerDecision: 'ACCEPTED' });
    const response = await recommendationPatch({
      method: 'PATCH',
      json: async () => ({ providerDecision: 'ACCEPTED', acceptedRecommendationIndex: 0 })
    } as any, { params: { id: 'rec' } });
    const json = await response.json();
    expect(json.data.providerDecision).toBe('ACCEPTED');
  });

  it('returns recommendation details', async () => {
    mockPrisma.recommendation.findUnique.mockResolvedValue({ id: 'rec', patientId: 'patient' });
    const response = await recommendationGet({} as any, { params: { id: 'rec' } });
    const json = await response.json();
    expect(json.data.id).toBe('rec');
  });
});
