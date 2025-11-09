import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

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
        const formulary = await prisma.formularyDrug.findMany({
          select: {
            id: true,
            drugName: true,
            genericName: true,
            drugClass: true,
            tier: true,
            annualCostWAC: true,
            requiresPA: true,
          },
          orderBy: [
            { tier: 'asc' },
            { drugName: 'asc' },
          ],
        });

        return NextResponse.json(formulary);

      case 'claims':
        const claims = await prisma.pharmacyClaim.findMany({
          select: {
            id: true,
            patientId: true,
            drugName: true,
            fillDate: true,
            daysSupply: true,
            outOfPocket: true,
          },
          orderBy: { fillDate: 'desc' },
          take: 500, // Limit to prevent overwhelming the UI
        });

        return NextResponse.json(claims);

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
        await prisma.formularyDrug.delete({
          where: { id },
        });
        break;

      case 'claims':
        await prisma.pharmacyClaim.delete({
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
