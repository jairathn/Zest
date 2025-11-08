import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateRecommendations } from '@/lib/decision-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      patientId,
      diagnosis,
      hasPsoriaticArthritis,
      dlqiScore,
      monthsStable,
      additionalNotes,
    } = body;

    // Create assessment
    const assessment = await prisma.assessment.create({
      data: {
        patientId,
        diagnosis,
        hasPsoriaticArthritis: hasPsoriaticArthritis || false,
        dlqiScore: Number(dlqiScore),
        monthsStable: Number(monthsStable),
        additionalNotes,
      },
    });

    // Generate recommendations
    const result = await generateRecommendations({
      patientId,
      diagnosis,
      hasPsoriaticArthritis: hasPsoriaticArthritis || false,
      dlqiScore: Number(dlqiScore),
      monthsStable: Number(monthsStable),
      additionalNotes,
    });

    // Save recommendations
    await Promise.all(
      result.recommendations.map((rec) =>
        prisma.recommendation.create({
          data: {
            assessmentId: assessment.id,
            patientId,
            isStable: result.isStable,
            isFormularyOptimal: result.isFormularyOptimal,
            quadrant: result.quadrant,
            rank: rec.rank,
            type: rec.type,
            drugName: rec.drugName,
            newDose: rec.newDose,
            newFrequency: rec.newFrequency,
            currentAnnualCost: rec.currentAnnualCost,
            recommendedAnnualCost: rec.recommendedAnnualCost,
            annualSavings: rec.annualSavings,
            savingsPercent: rec.savingsPercent,
            currentMonthlyOOP: rec.currentMonthlyOOP,
            recommendedMonthlyOOP: rec.recommendedMonthlyOOP,
            rationale: rec.rationale,
            evidenceSources: rec.evidenceSources,
            monitoringPlan: rec.monitoringPlan,
            tier: rec.tier,
            requiresPA: rec.requiresPA,
            contraindicated: rec.contraindicated,
            contraindicationReason: rec.contraindicationReason,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      assessmentId: assessment.id,
    });
  } catch (error: any) {
    console.error('Error creating assessment:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
