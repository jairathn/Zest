import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const plans = await prisma.insurancePlan.findMany({
      select: {
        id: true,
        planName: true,
        payerName: true,
        _count: {
          select: {
            formularyDrugs: true,
          },
        },
      },
      orderBy: { planName: 'asc' },
    });

    return NextResponse.json(plans);
  } catch (error: any) {
    console.error('Error fetching insurance plans:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { planName, payerName } = body;

    if (!planName || !payerName) {
      return NextResponse.json(
        { error: 'Plan name and payer name are required' },
        { status: 400 }
      );
    }

    const plan = await prisma.insurancePlan.create({
      data: {
        planName,
        payerName,
        formularyVersion: new Date().toISOString().split('T')[0],
      },
    });

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error('Error creating insurance plan:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Check if plan has any formulary drugs
    const plan = await prisma.insurancePlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            formularyDrugs: true,
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Insurance plan not found' },
        { status: 404 }
      );
    }

    if (plan._count.formularyDrugs > 0) {
      return NextResponse.json(
        { error: `Cannot delete plan with ${plan._count.formularyDrugs} formulary drugs. Delete formulary data first.` },
        { status: 400 }
      );
    }

    await prisma.insurancePlan.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting insurance plan:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
