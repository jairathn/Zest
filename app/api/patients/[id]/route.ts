import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      include: {
        insurancePlan: { include: { formularyDrugs: true } },
        currentMedication: true,
        claimsHistory: true,
        pharmacyClaims: {
          orderBy: { fillDate: 'desc' }
        },
        recommendations: {
          orderBy: { createdAt: 'desc' },
          take: 3
        }
      }
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ data: patient });
  } catch (error) {
    console.error('Patient detail fetch failed', error);
    return NextResponse.json({ error: 'Unable to fetch patient' }, { status: 500 });
  }
}
