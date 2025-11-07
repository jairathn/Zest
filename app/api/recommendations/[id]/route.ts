import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  providerDecision: z.enum(['ACCEPTED', 'REJECTED', 'MODIFIED', 'PENDING']).optional(),
  acceptedRecommendationIndex: z.number().int().min(0).optional(),
  rejectionReason: z.string().optional()
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: params.id },
      include: {
        assessment: true,
        patient: true
      }
    });

    if (!recommendation) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    return NextResponse.json({ data: recommendation });
  } catch (error) {
    console.error('Recommendation fetch failed', error);
    return NextResponse.json({ error: 'Unable to fetch recommendation' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data = updateSchema.parse(body);

    const recommendation = await prisma.recommendation.update({
      where: { id: params.id },
      data: {
        providerDecision: data.providerDecision,
        acceptedRecommendationIndex: data.acceptedRecommendationIndex,
        rejectionReason: data.rejectionReason,
        decidedAt: new Date()
      }
    });

    return NextResponse.json({ data: recommendation });
  } catch (error) {
    console.error('Recommendation update failed', error);
    return NextResponse.json({ error: 'Unable to update recommendation' }, { status: 400 });
  }
}
