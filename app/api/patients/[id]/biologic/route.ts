import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const {
      drugName,
      dose,
      frequency,
      isManualOverride,
      claimsDrugName,
      claimsDose,
      claimsFrequency,
    } = body;

    // Delete existing biologics for this patient
    await prisma.currentBiologic.deleteMany({
      where: { patientId: params.id },
    });

    // Create new biologic with override tracking
    const biologic = await prisma.currentBiologic.create({
      data: {
        patientId: params.id,
        drugName,
        dose: dose || 'See label',
        frequency: frequency || 'See label',
        route: 'SC',
        startDate: new Date(),
        // Override tracking (Option C: Store both claims value and override)
        isManualOverride: isManualOverride || false,
        claimsDrugName: claimsDrugName || null,
        claimsDose: claimsDose || null,
        claimsFrequency: claimsFrequency || null,
      },
    });

    return NextResponse.json(biologic);
  } catch (error: any) {
    console.error('Error creating biologic:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
