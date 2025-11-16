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
        claims: {
          orderBy: { fillDate: 'desc' },
          take: 5, // Get most recent 5 claims for auto-fill
        },
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
    const {
      firstName,
      lastName,
      dateOfBirth,
      externalId,
      pharmacyInsuranceId,
      streetAddress,
      city,
      state,
      employer,
      email,
      phone,
    } = body;

    const updateData: any = {
      firstName,
      lastName,
      dateOfBirth: new Date(dateOfBirth),
    };

    // Add optional fields only if they are provided
    if (externalId !== undefined) updateData.externalId = externalId;
    if (pharmacyInsuranceId !== undefined) updateData.pharmacyInsuranceId = pharmacyInsuranceId;
    if (streetAddress !== undefined) updateData.streetAddress = streetAddress;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (employer !== undefined) updateData.employer = employer;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;

    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: updateData,
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
