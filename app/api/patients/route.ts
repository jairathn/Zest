import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createPatientSchema = z.object({
  externalId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  insurancePlanId: z.string()
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        currentMedication: true,
        insurancePlan: true,
        recommendations: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { lastName: 'asc' }
    }),
    prisma.patient.count()
  ]);

  return NextResponse.json({
    data: patients,
    pagination: { page, pageSize, total }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createPatientSchema.parse(body);
    const patient = await prisma.patient.create({
      data: {
        ...data,
        dateOfBirth: new Date(data.dateOfBirth)
      }
    });
    return NextResponse.json({ data: patient }, { status: 201 });
  } catch (error) {
    console.error('Create patient failed', error);
    return NextResponse.json({ error: 'Unable to create patient' }, { status: 400 });
  }
}
