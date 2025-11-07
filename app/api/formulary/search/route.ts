import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const term = (searchParams.get('q') ?? '').toLowerCase();
  const planId = searchParams.get('planId');

  if (!planId) {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 });
  }

  const filters = term
    ? {
        OR: [
          { drugName: { contains: term, mode: 'insensitive' } },
          { genericName: { contains: term, mode: 'insensitive' } }
        ]
      }
    : {};

  const results = await prisma.formularyDrug.findMany({
    where: {
      planId,
      ...filters
    },
    take: 20,
    orderBy: [{ tier: 'asc' }, { drugName: 'asc' }]
  });

  return NextResponse.json({ data: results });
}
