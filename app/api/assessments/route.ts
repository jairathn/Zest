import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateRecommendations } from '@/lib/decision-engine';
import { generateLLMRecommendations } from '@/lib/llm-decision-engine';

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

    // Generate recommendations using LLM if available, with fallback to rule-based
    const useLLM = !!process.env.OPENAI_API_KEY;
    let result;

    if (useLLM) {
      try {
        console.log('Attempting LLM-based recommendations...');
        result = await generateLLMRecommendations({
          patientId,
          diagnosis,
          hasPsoriaticArthritis: hasPsoriaticArthritis || false,
          dlqiScore: Number(dlqiScore),
          monthsStable: Number(monthsStable),
          additionalNotes,
        });
        console.log(`LLM generated ${result.recommendations.length} recommendations`);
      } catch (error: any) {
        console.error('LLM recommendations failed, falling back to rule-based:', error.message);
        result = await generateRecommendations({
          patientId,
          diagnosis,
          hasPsoriaticArthritis: hasPsoriaticArthritis || false,
          dlqiScore: Number(dlqiScore),
          monthsStable: Number(monthsStable),
          additionalNotes,
        });
        console.log(`Rule-based generated ${result.recommendations.length} recommendations`);
      }
    } else {
      result = await generateRecommendations({
        patientId,
        diagnosis,
        hasPsoriaticArthritis: hasPsoriaticArthritis || false,
        dlqiScore: Number(dlqiScore),
        monthsStable: Number(monthsStable),
        additionalNotes,
      });
    }

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
