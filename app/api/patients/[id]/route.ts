import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      include: {
        currentBiologics: true,
        contraindications: true,
        plan: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json(patient);
  } catch (error: any) {
    console.error('Error fetching patient:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { firstName, lastName, dateOfBirth, externalId } = body;

    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: {
        firstName,
        lastName,
        dateOfBirth: new Date(dateOfBirth),
        externalId,
      },
    });

    return NextResponse.json(patient);
  } catch (error: any) {
    console.error('Error updating patient:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Delete all related data first (foreign key constraints)
    await prisma.contraindication.deleteMany({ where: { patientId: params.id } });
    await prisma.currentBiologic.deleteMany({ where: { patientId: params.id } });
    await prisma.pharmacyClaim.deleteMany({ where: { patientId: params.id } });
    await prisma.recommendation.deleteMany({ where: { patientId: params.id } });

    // Delete assessments
    await prisma.assessment.deleteMany({ where: { patientId: params.id } });

    // Finally delete the patient
    await prisma.patient.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting patient:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
