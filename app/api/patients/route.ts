import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const patients = await prisma.patient.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        externalId: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    return NextResponse.json(patients);
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
