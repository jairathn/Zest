import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/knowledge/findings
 * Returns list of clinical findings with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const reviewed = searchParams.get('reviewed');

    const where: any = {};
    if (reviewed !== null) {
      where.reviewed = reviewed === 'true';
    }

    const findings = await prisma.clinicalFinding.findMany({
      where,
      orderBy: [
        { reviewed: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      select: {
        id: true,
        paperTitle: true,
        finding: true,
        citation: true,
        drug: true,
        indication: true,
        reviewed: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ findings });
  } catch (error: any) {
    console.error('Error getting findings:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
