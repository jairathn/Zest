import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const action = searchParams.get('action');
  const id = searchParams.get('id');

  // Handle dataset view/download
  if (action === 'view' && id) {
    return handleViewDataset(type, id);
  }

  try {
    switch (type) {
      case 'knowledge':
        const knowledge = await prisma.knowledgeDocument.findMany({
          select: {
            id: true,
            title: true,
            category: true,
            sourceFile: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(
          knowledge.map(doc => ({
            id: doc.id,
            fileName: doc.sourceFile || doc.title,
            fileType: doc.category,
            uploadedAt: doc.createdAt,
            chunkCount: 1, // Each document is stored as a single entry
          }))
        );

      case 'formulary':
        // Get formulary datasets (grouped by uploadLog)
        const formularyLogs = await prisma.uploadLog.findMany({
          where: { uploadType: 'FORMULARY' },
          include: {
            plan: {
              select: {
                planName: true,
                payerName: true,
              },
            },
            _count: {
              select: { formularyDrugs: true },
            },
          },
          orderBy: { uploadedAt: 'desc' },
        });

        return NextResponse.json(
          formularyLogs.map(log => ({
            id: log.id,
            datasetLabel: log.datasetLabel || log.fileName,
            planName: log.plan?.planName || 'Unknown',
            payerName: log.plan?.payerName || '',
            drugCount: log._count.formularyDrugs,
            uploadedAt: log.uploadedAt,
            fileName: log.fileName,
          }))
        );

      case 'claims':
        // Get claims datasets (grouped by uploadLog)
        const claimsLogs = await prisma.uploadLog.findMany({
          where: { uploadType: 'CLAIMS' },
          include: {
            _count: {
              select: { claims: true },
            },
          },
          orderBy: { uploadedAt: 'desc' },
        });

        return NextResponse.json(
          claimsLogs.map(log => ({
            id: log.id,
            datasetLabel: log.datasetLabel || log.fileName,
            claimCount: log._count.claims,
            uploadedAt: log.uploadedAt,
            fileName: log.fileName,
          }))
        );

      case 'uploads':
        const uploads = await prisma.uploadLog.findMany({
          select: {
            id: true,
            uploadType: true,
            fileName: true,
            uploadedAt: true,
            rowsProcessed: true,
            rowsFailed: true,
          },
          orderBy: { uploadedAt: 'desc' },
        });

        return NextResponse.json(uploads);

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }

  try {
    switch (type) {
      case 'knowledge':
        // Delete the knowledge document
        await prisma.knowledgeDocument.delete({
          where: { id },
        });
        break;

      case 'formulary':
        // Delete all formulary drugs with this uploadLogId
        await prisma.formularyDrug.deleteMany({
          where: { uploadLogId: id },
        });
        // Delete the upload log
        await prisma.uploadLog.delete({
          where: { id },
        });
        break;

      case 'claims':
        // Delete all claims with this uploadLogId
        await prisma.pharmacyClaim.deleteMany({
          where: { uploadLogId: id },
        });
        // Delete the upload log
        await prisma.uploadLog.delete({
          where: { id },
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleViewDataset(type: string | null, id: string) {
  try {
    let csvData = '';

    switch (type) {
      case 'formulary':
        const formularyDrugs = await prisma.formularyDrug.findMany({
          where: { uploadLogId: id },
          include: {
            plan: {
              select: {
                planName: true,
                payerName: true,
              },
            },
          },
        });

        if (formularyDrugs.length === 0) {
          return NextResponse.json({ error: 'No data found' }, { status: 404 });
        }

        // Generate CSV headers
        const formularyHeaders = [
          'Drug Name',
          'Generic Name',
          'Drug Class',
          'Tier',
          'Requires PA',
          'Step Therapy Required',
          'Annual Cost (WAC)',
          'Member Copay T1',
          'Member Copay T2',
          'Member Copay T3',
          'Biosimilar Of',
          'Approved Indications',
          'Insurance Plan',
          'Payer Name',
        ];

        csvData = formularyHeaders.join(',') + '\n';

        // Generate CSV rows
        formularyDrugs.forEach(drug => {
          const row = [
            `"${drug.drugName}"`,
            `"${drug.genericName}"`,
            drug.drugClass,
            drug.tier,
            drug.requiresPA,
            drug.stepTherapyRequired,
            drug.annualCostWAC?.toString() || '',
            drug.memberCopayT1?.toString() || '',
            drug.memberCopayT2?.toString() || '',
            drug.memberCopayT3?.toString() || '',
            drug.biosimilarOf || '',
            `"${drug.approvedIndications.join('; ')}"`,
            `"${drug.plan.planName}"`,
            `"${drug.plan.payerName}"`,
          ];
          csvData += row.join(',') + '\n';
        });
        break;

      case 'claims':
        const claims = await prisma.pharmacyClaim.findMany({
          where: { uploadLogId: id },
          include: {
            patient: {
              select: {
                externalId: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        if (claims.length === 0) {
          return NextResponse.json({ error: 'No data found' }, { status: 404 });
        }

        // Generate CSV headers
        const claimsHeaders = [
          'Patient ID',
          'Pharmacy Insurance ID',
          'Patient Name',
          'Drug Name',
          'NDC Code',
          'Fill Date',
          'Days Supply',
          'Quantity',
          'Diagnosis Code',
          'Out of Pocket (Member Paid)',
          'Plan Paid',
          'True Drug Cost',
        ];

        csvData = claimsHeaders.join(',') + '\n';

        // Generate CSV rows
        claims.forEach(claim => {
          const row = [
            claim.patient.externalId || '',
            claim.patient.pharmacyInsuranceId || '',
            `"${claim.patient.firstName} ${claim.patient.lastName}"`,
            claim.drugName ? `"${claim.drugName}"` : '',
            claim.ndcCode || '',
            claim.fillDate.toISOString().split('T')[0],
            claim.daysSupply?.toString() || '',
            claim.quantity?.toString() || '',
            claim.diagnosisCode || '',
            claim.outOfPocket?.toString() || '',
            claim.planPaid?.toString() || '',
            claim.trueDrugCost?.toString() || '',
          ];
          csvData += row.join(',') + '\n';
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Return CSV with download headers
    return new NextResponse(csvData, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${type}-dataset-${id}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Error viewing dataset:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
