import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * PATCH /api/knowledge/findings/[id]
 * Update a clinical finding (e.g., mark as reviewed)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { reviewed } = body;

    const finding = await prisma.clinicalFinding.update({
      where: { id: params.id },
      data: { reviewed },
    });

    return NextResponse.json({ success: true, finding });
  } catch (error: any) {
    console.error('Error updating finding:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
