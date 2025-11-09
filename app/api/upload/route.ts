import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { prisma } from '@/lib/db';
import { parseFormularyCSV } from '@/lib/parsers/formulary-parser';
import { parseClaimsCSV } from '@/lib/parsers/claims-parser';
import { parseEligibilityCSV } from '@/lib/parsers/eligibility-parser';
import { chunkTextByParagraph } from '@/lib/text-chunker';
import { generateEmbedding } from '@/lib/rag/embeddings';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    const text = await file.text();

    // Handle different upload types
    if (type === 'formulary') {
      return await handleFormularyUpload(text, file.name);
    } else if (type === 'claims') {
      return await handleClaimsUpload(text, file.name);
    } else if (type === 'eligibility') {
      return await handleEligibilityUpload(text, file.name);
    } else if (type === 'knowledge') {
      return await handleKnowledgeUpload(file);
    }

    return NextResponse.json(
      { success: false, message: 'Invalid upload type' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

async function handleFormularyUpload(csvText: string, fileName: string) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  // Get or create default plan
  let plan = await prisma.insurancePlan.findFirst();
  if (!plan) {
    plan = await prisma.insurancePlan.create({
      data: {
        planName: 'Default Plan',
        payerName: 'Default Payer',
        formularyVersion: new Date().toISOString().split('T')[0],
      },
    });
  }

  const { rows, errors } = parseFormularyCSV(parsed.data as any[], plan.id);

  if (errors.length > 0 && rows.length === 0) {
    await prisma.uploadLog.create({
      data: {
        uploadType: 'FORMULARY',
        fileName,
        rowsProcessed: 0,
        rowsFailed: errors.length,
        errors: errors,
      },
    });

    return NextResponse.json({
      success: false,
      message: errors[0].error,
      errors,
    });
  }

  // Delete existing formulary drugs for this plan and insert new ones
  await prisma.formularyDrug.deleteMany({ where: { planId: plan.id } });

  await prisma.formularyDrug.createMany({
    data: rows,
    skipDuplicates: true,
  });

  await prisma.uploadLog.create({
    data: {
      uploadType: 'FORMULARY',
      fileName,
      rowsProcessed: rows.length,
      rowsFailed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  return NextResponse.json({
    success: true,
    rowsProcessed: rows.length,
    rowsFailed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function handleClaimsUpload(csvText: string, fileName: string) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const { rows, errors } = parseClaimsCSV(parsed.data as any[]);

  if (errors.length > 0 && rows.length === 0) {
    await prisma.uploadLog.create({
      data: {
        uploadType: 'CLAIMS',
        fileName,
        rowsProcessed: 0,
        rowsFailed: errors.length,
        errors: errors,
      },
    });

    return NextResponse.json({
      success: false,
      message: errors[0].error,
      errors,
    });
  }

  // Group by patient and insert claims
  const claimsByPatient = rows.reduce((acc, claim) => {
    if (!acc[claim.patientId]) acc[claim.patientId] = [];
    acc[claim.patientId].push(claim);
    return acc;
  }, {} as Record<string, any[]>);

  let successCount = 0;
  let failCount = 0;

  for (const [patientId, claims] of Object.entries(claimsByPatient)) {
    try {
      // Find patient by external ID
      const patient = await prisma.patient.findFirst({
        where: { externalId: patientId },
      });

      if (!patient) {
        failCount += claims.length;
        errors.push({ row: 0, error: `Patient ${patientId} not found` });
        continue;
      }

      // Delete existing claims for this patient
      await prisma.pharmacyClaim.deleteMany({
        where: { patientId: patient.id },
      });

      // Insert new claims
      await prisma.pharmacyClaim.createMany({
        data: claims.map(claim => ({
          ...claim,
          patientId: patient.id,
        })),
      });

      successCount += claims.length;
    } catch (error: any) {
      failCount += claims.length;
      errors.push({ row: 0, error: `Failed to import claims for patient ${patientId}: ${error.message}` });
    }
  }

  await prisma.uploadLog.create({
    data: {
      uploadType: 'CLAIMS',
      fileName,
      rowsProcessed: successCount,
      rowsFailed: failCount,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  return NextResponse.json({
    success: successCount > 0,
    rowsProcessed: successCount,
    rowsFailed: failCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function handleEligibilityUpload(csvText: string, fileName: string) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  // Get or create default plan
  let plan = await prisma.insurancePlan.findFirst();
  if (!plan) {
    plan = await prisma.insurancePlan.create({
      data: {
        planName: 'Default Plan',
        payerName: 'Default Payer',
        formularyVersion: new Date().toISOString().split('T')[0],
      },
    });
  }

  const { rows, errors } = parseEligibilityCSV(parsed.data as any[], plan.id);

  if (errors.length > 0 && rows.length === 0) {
    await prisma.uploadLog.create({
      data: {
        uploadType: 'ELIGIBILITY',
        fileName,
        rowsProcessed: 0,
        rowsFailed: errors.length,
        errors: errors,
      },
    });

    return NextResponse.json({
      success: false,
      message: errors[0].error,
      errors,
    });
  }

  // Upsert patients
  let successCount = 0;
  let failCount = 0;

  for (const row of rows) {
    try {
      await prisma.patient.upsert({
        where: { externalId: row.externalId },
        update: {
          firstName: row.firstName,
          lastName: row.lastName,
          dateOfBirth: row.dateOfBirth,
          planId: row.planId,
        },
        create: row,
      });
      successCount++;
    } catch (error: any) {
      failCount++;
      errors.push({ row: 0, error: `Failed to import patient ${row.externalId}: ${error.message}` });
    }
  }

  await prisma.uploadLog.create({
    data: {
      uploadType: 'ELIGIBILITY',
      fileName,
      rowsProcessed: successCount,
      rowsFailed: failCount,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  return NextResponse.json({
    success: successCount > 0,
    rowsProcessed: successCount,
    rowsFailed: failCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function handleKnowledgeUpload(file: File) {
  let text = '';

  if (file.name.endsWith('.pdf')) {
    // For PDFs, use pdf-parse
    const pdf = require('pdf-parse');
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdf(buffer);
    text = data.text;
  } else {
    // For markdown/text files
    text = await file.text();
  }

  // Strip null bytes that PostgreSQL doesn't like
  text = text.replace(/\0/g, '');

  // Chunk the text using paragraph-based chunking
  const chunks = chunkTextByParagraph(text, 700, 100);

  let successCount = 0;
  let failCount = 0;

  // Generate embeddings and store each chunk
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);
      const embeddingStr = `[${embedding.join(',')}]`;

      // Store chunk with embedding using raw SQL
      await prisma.$queryRawUnsafe(`
        INSERT INTO "KnowledgeDocument" (
          id,
          title,
          content,
          embedding,
          category,
          "sourceFile",
          metadata,
          "createdAt",
          "updatedAt"
        )
        VALUES (
          gen_random_uuid()::text,
          $1,
          $2,
          $3::vector,
          'CLINICAL_GUIDELINE',
          $4,
          '{"chunkIndex": ${chunk.index}}'::jsonb,
          NOW(),
          NOW()
        )
      `, `${file.name} (chunk ${chunk.index})`, chunk.content, embeddingStr, file.name);

      successCount++;
    } catch (error: any) {
      console.error(`Error processing chunk ${chunk.index}:`, error);
      failCount++;
    }
  }

  await prisma.uploadLog.create({
    data: {
      uploadType: 'KNOWLEDGE',
      fileName: file.name,
      rowsProcessed: successCount,
      rowsFailed: failCount,
    },
  });

  return NextResponse.json({
    success: successCount > 0,
    rowsProcessed: successCount,
    rowsFailed: failCount,
    message: successCount > 0 ? `Successfully processed ${successCount} chunks from ${file.name}` : 'Failed to process file',
  });
}
