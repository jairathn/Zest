import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const patientCount = await prisma.patient.count();
    const claimCount = await prisma.pharmacyClaim.count();

    const recentPatients = await prisma.patient.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        externalId: true,
        pharmacyInsuranceId: true,
        city: true,
        state: true,
        costDesignation: true,
        createdAt: true,
      }
    });

    const uploadLogs = await prisma.uploadLog.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 5,
      select: {
        uploadType: true,
        fileName: true,
        rowsProcessed: true,
        rowsFailed: true,
        uploadedAt: true,
        errors: true,
      }
    });

    return NextResponse.json({
      patientCount,
      claimCount,
      recentPatients,
      uploadLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
