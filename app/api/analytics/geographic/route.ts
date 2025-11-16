import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Get patient counts by state
    const patientsByState = await prisma.patient.groupBy({
      by: ['state'],
      _count: {
        id: true,
      },
      where: {
        state: {
          not: null,
        },
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    // Get high-cost patients by state
    const highCostByState = await prisma.patient.groupBy({
      by: ['state'],
      _count: {
        id: true,
      },
      where: {
        state: {
          not: null,
        },
        costDesignation: 'HIGH_COST',
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    // Get patients with recommendations by state
    const recommendationsByState = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`
      SELECT p.state, COUNT(DISTINCT p.id)::int as count
      FROM "Patient" p
      INNER JOIN "Recommendation" r ON r."patientId" = p.id
      WHERE p.state IS NOT NULL
      GROUP BY p.state
      ORDER BY count DESC
    `;

    // Get accepted recommendations by state
    const acceptedByState = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`
      SELECT p.state, COUNT(DISTINCT r.id)::int as count
      FROM "Patient" p
      INNER JOIN "Recommendation" r ON r."patientId" = p.id
      WHERE p.state IS NOT NULL AND r.status = 'ACCEPTED'
      GROUP BY p.state
      ORDER BY count DESC
    `;

    // Calculate success rates by state
    const stateAnalytics = patientsByState.map(stateData => {
      const state = stateData.state || 'Unknown';
      const totalPatients = stateData._count.id;
      const highCostCount = highCostByState.find(h => h.state === state)?._count.id || 0;
      const recommendationsCount = Number(recommendationsByState.find((r: any) => r.state === state)?.count || 0);
      const acceptedCount = Number(acceptedByState.find((a: any) => a.state === state)?.count || 0);

      const successRate = recommendationsCount > 0 ? (acceptedCount / recommendationsCount) * 100 : 0;
      const highCostRate = totalPatients > 0 ? (highCostCount / totalPatients) * 100 : 0;

      return {
        state,
        totalPatients,
        highCostCount,
        highCostRate: Math.round(highCostRate * 10) / 10,
        recommendationsCount,
        acceptedCount,
        successRate: Math.round(successRate * 10) / 10,
      };
    });

    // Get top cities
    const patientsByCity = await prisma.patient.groupBy({
      by: ['city', 'state'],
      _count: {
        id: true,
      },
      where: {
        city: {
          not: null,
        },
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    return NextResponse.json({
      stateAnalytics,
      topCities: patientsByCity.map(c => ({
        city: c.city,
        state: c.state,
        patientCount: c._count.id,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching geographic analytics:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
