import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/knowledge/findings
 * Returns list of clinical findings with optional filters and pagination
 * Query params:
 * - limit: number of findings to return (default: 20, use 0 for all)
 * - skip: number of findings to skip for pagination (default: 0)
 * - reviewed: filter by reviewed status (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = parseInt(searchParams.get('skip') || '0');
    const reviewed = searchParams.get('reviewed');

    const where: any = {};
    if (reviewed !== null) {
      where.reviewed = reviewed === 'true';
    }

    // Get total count for pagination
    const total = await prisma.clinicalFinding.count({ where });

    // Get findings with pagination
    const queryOptions: any = {
      where,
      orderBy: [
        { reviewed: 'asc' },  // Show unreviewed first
        { createdAt: 'desc' },
      ],
      skip,
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
    };

    // Only apply limit if > 0 (0 means "all")
    if (limit > 0) {
      queryOptions.take = limit;
    }

    const findings = await prisma.clinicalFinding.findMany(queryOptions);

    return NextResponse.json({
      findings,
      total,
      limit,
      skip,
    });
  } catch (error: any) {
    console.error('Error getting findings:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
