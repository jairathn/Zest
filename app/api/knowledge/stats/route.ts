import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/knowledge/stats
 * Returns statistics about the knowledge base
 */
export async function GET(request: NextRequest) {
  try {
    const [oldChunks, newFindings, reviewedFindings] = await Promise.all([
      prisma.knowledgeDocument.count(),
      prisma.clinicalFinding.count(),
      prisma.clinicalFinding.count({ where: { reviewed: true } }),
    ]);

    return NextResponse.json({
      oldChunks,
      newFindings,
      reviewedFindings,
    });
  } catch (error: any) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
