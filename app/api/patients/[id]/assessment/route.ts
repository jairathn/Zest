import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { analyzePatient } from '@/lib/llm/decision-engine';
import { z } from 'zod';

const assessmentSchema = z.object({
  assessmentDate: z.string(),
  diagnosis: z.enum(['PSORIASIS', 'ECZEMA', 'HIDRADENITIS_SUPPURATIVA', 'OTHER']),
  severityScoreType: z.enum(['PASI', 'EASI', 'IGA', 'PGA']),
  severityScore: z.number().min(0),
  severityDurationMonths: z.number().int().min(0),
  dlqiScore: z.number().int().min(0).max(30),
  adverseEvents: z.string().optional(),
  comorbidities: z.string().optional(),
  providerNotes: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const validatedData = assessmentSchema.parse(body);

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      include: {
        currentMedication: true,
        claimsHistory: true,
        pharmacyClaims: { orderBy: { fillDate: 'desc' }, take: 6 },
        insurancePlan: {
          include: { formularyDrugs: true }
        }
      }
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const assessment = await prisma.clinicalAssessment.create({
      data: {
        patientId: params.id,
        assessedBy: 'seed-user',
        assessmentDate: new Date(validatedData.assessmentDate),
        diagnosis: validatedData.diagnosis,
        severityScoreType: validatedData.severityScoreType,
        severityScore: validatedData.severityScore,
        severityDurationMonths: validatedData.severityDurationMonths,
        dlqiScore: validatedData.dlqiScore,
        adverseEvents: validatedData.adverseEvents,
        comorbidities: validatedData.comorbidities,
        providerNotes: validatedData.providerNotes
      }
    });

    const aiResult = await analyzePatient(patient, assessment);

    const recommendation = await prisma.recommendation.create({
      data: {
        patientId: params.id,
        assessmentId: assessment.id,
        llmModel: 'gpt-4.1-mini',
        stabilityStatus: aiResult.stabilityStatus,
        formularyStatus: aiResult.formularyStatus,
        quadrant: aiResult.quadrant,
        recommendationsJson: aiResult.recommendations,
        providerDecision: 'PENDING'
      }
    });

    return NextResponse.json({
      assessment,
      recommendation: {
        id: recommendation.id,
        ...aiResult
      }
    });
  } catch (error) {
    console.error('Assessment error:', error);
    return NextResponse.json({ error: 'Failed to process assessment' }, { status: 500 });
  }
}
