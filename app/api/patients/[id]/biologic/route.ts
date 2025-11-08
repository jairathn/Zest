import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { drugName, dose, frequency } = body;

    // Delete existing biologics for this patient
    await prisma.currentBiologic.deleteMany({
      where: { patientId: params.id },
    });

    // Create new biologic
    const biologic = await prisma.currentBiologic.create({
      data: {
        patientId: params.id,
        drugName,
        dose: dose || 'See label',
        frequency: frequency || 'See label',
        route: 'SC',
        startDate: new Date(),
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
