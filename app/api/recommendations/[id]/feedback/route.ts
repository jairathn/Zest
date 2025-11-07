import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const feedbackSchema = z.object({
  reasons: z.array(
    z.object({
      type: z.string(),
      details: z.string().optional(),
      extra: z.record(z.string(), z.any()).optional()
    })
  )
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data = feedbackSchema.parse(body);

    const feedback = await prisma.recommendationFeedback.upsert({
      where: { recommendationId: params.id },
      update: { reasons: data.reasons },
      create: {
        recommendationId: params.id,
        reasons: data.reasons
      }
    });

    return NextResponse.json({ data: feedback }, { status: 201 });
  } catch (error) {
    console.error('Feedback submission failed', error);
    return NextResponse.json({ error: 'Unable to submit feedback' }, { status: 400 });
  }
}
