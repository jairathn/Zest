import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeDetails = searchParams.get('includeDetails') === 'true';

    // If full details requested (for patient list page)
    if (includeDetails) {
      const patients = await prisma.patient.findMany({
        include: {
          currentBiologics: true,
          plan: true,
          claims: {
            orderBy: { fillDate: 'desc' },
            take: 5, // Get recent claims for biologic inference
          },
          assessments: {
            orderBy: { assessedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      });
      return NextResponse.json(patients);
    }

    // Default: Return minimal data for dropdowns
    const patients = await prisma.patient.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        externalId: true,
        costDesignation: true, // Include cost designation for filtering
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
