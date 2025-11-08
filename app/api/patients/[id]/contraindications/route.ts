import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { contraindications } = body;

    // Delete existing contraindications
    await prisma.contraindication.deleteMany({
      where: { patientId: params.id },
    });

    // Create new contraindications
    if (contraindications && contraindications.length > 0) {
      await prisma.contraindication.createMany({
        data: contraindications.map((type: string) => ({
          patientId: params.id,
          type,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error creating contraindications:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
