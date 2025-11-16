import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { prisma } from '@/lib/db';
import { parseFormularyCSV } from '@/lib/parsers/formulary-parser';
import { parseClaimsCSV } from '@/lib/parsers/claims-parser';
import { parseEligibilityCSV } from '@/lib/parsers/eligibility-parser';
import { chunkTextByParagraph } from '@/lib/text-chunker';
import { generateEmbedding } from '@/lib/rag/embeddings';
import { findDrugByNdc } from '@/lib/ndc-mappings';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const datasetLabel = formData.get('datasetLabel') as string | null;
    const planId = formData.get('planId') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    const text = await file.text();

    // Handle different upload types
    if (type === 'formulary') {
      return await handleFormularyUpload(text, file.name, datasetLabel, planId);
    } else if (type === 'claims') {
      return await handleClaimsUpload(text, file.name, datasetLabel);
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

async function handleFormularyUpload(csvText: string, fileName: string, datasetLabel: string | null, planId: string | null) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  // Get or create plan
  let plan;
  if (planId) {
    plan = await prisma.insurancePlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({
        success: false,
        message: `Insurance plan with ID ${planId} not found`,
      }, { status: 400 });
    }
  } else {
    // Get or create default plan
    plan = await prisma.insurancePlan.findFirst();
    if (!plan) {
      plan = await prisma.insurancePlan.create({
        data: {
          planName: 'Default Plan',
          payerName: 'Default Payer',
          formularyVersion: new Date().toISOString().split('T')[0],
        },
      });
    }
  }

  const { rows, errors } = parseFormularyCSV(parsed.data as any[], plan.id);

  if (errors.length > 0 && rows.length === 0) {
    await prisma.uploadLog.create({
      data: {
        uploadType: 'FORMULARY',
        fileName,
        datasetLabel,
        planId: plan.id,
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

  // Create upload log first to get its ID
  const uploadLog = await prisma.uploadLog.create({
    data: {
      uploadType: 'FORMULARY',
      fileName,
      datasetLabel,
      planId: plan.id,
      rowsProcessed: rows.length,
      rowsFailed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  // Add uploadLogId to all rows and insert (do NOT delete existing data)
  await prisma.formularyDrug.createMany({
    data: rows.map(row => ({ ...row, uploadLogId: uploadLog.id })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    success: true,
    rowsProcessed: rows.length,
    rowsFailed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function handleClaimsUpload(csvText: string, fileName: string, datasetLabel: string | null) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const { rows, errors } = parseClaimsCSV(parsed.data as any[]);

  if (errors.length > 0 && rows.length === 0) {
    await prisma.uploadLog.create({
      data: {
        uploadType: 'CLAIMS',
        fileName,
        datasetLabel,
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

  // Create upload log first to get its ID
  const uploadLog = await prisma.uploadLog.create({
    data: {
      uploadType: 'CLAIMS',
      fileName,
      datasetLabel,
      rowsProcessed: 0, // Will update after processing
      rowsFailed: 0,
    },
  });

  let successCount = 0;
  let failCount = 0;

  for (const claimData of rows) {
    try {
      // Find patient by either pharmacyInsuranceId or externalId
      let patient;
      if (claimData.pharmacyInsuranceId) {
        patient = await prisma.patient.findFirst({
          where: { pharmacyInsuranceId: claimData.pharmacyInsuranceId },
        });
      } else if (claimData.patientId) {
        patient = await prisma.patient.findFirst({
          where: { externalId: claimData.patientId },
        });
      }

      if (!patient) {
        failCount++;
        const identifier = claimData.pharmacyInsuranceId || claimData.patientId || 'unknown';
        errors.push({ row: 0, error: `Patient ${identifier} not found` });
        continue;
      }

      // Prepare claim data
      const claimToInsert: any = {
        patientId: patient.id,
        fillDate: claimData.fillDate,
        uploadLogId: uploadLog.id,
      };

      // Add drug information - convert NDC to drug name if needed
      let drugName = claimData.drugName;
      const ndcCode = claimData.ndcCode;

      // If no drug name but have NDC, try to look it up
      if (!drugName && ndcCode) {
        const ndcMapping = findDrugByNdc(ndcCode);
        if (ndcMapping) {
          drugName = ndcMapping.drugName;
        }
      }

      if (drugName) claimToInsert.drugName = drugName;
      if (ndcCode) claimToInsert.ndcCode = ndcCode;
      if (claimData.daysSupply !== undefined) claimToInsert.daysSupply = claimData.daysSupply;
      if (claimData.quantity !== undefined) claimToInsert.quantity = claimData.quantity;
      if (claimData.diagnosisCode) claimToInsert.diagnosisCode = claimData.diagnosisCode;
      if (claimData.outOfPocket !== undefined) claimToInsert.outOfPocket = claimData.outOfPocket;
      if (claimData.planPaid !== undefined) claimToInsert.planPaid = claimData.planPaid;
      if (claimData.trueDrugCost !== undefined) claimToInsert.trueDrugCost = claimData.trueDrugCost;

      // Insert claim
      await prisma.pharmacyClaim.create({
        data: claimToInsert,
      });

      successCount++;
    } catch (error: any) {
      failCount++;
      const identifier = claimData.pharmacyInsuranceId || claimData.patientId || 'unknown';
      errors.push({ row: 0, error: `Failed to import claim for patient ${identifier}: ${error.message}` });
    }
  }

  // Update upload log with final counts
  await prisma.uploadLog.update({
    where: { id: uploadLog.id },
    data: {
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

  const { rows, errors } = parseEligibilityCSV(parsed.data as any[]);

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

  // EMPLOYER TO PLAN MAPPING (PLACEHOLDER)
  // TODO: Replace with configurable mapping or database table
  const employerToPlanMapping: Record<string, string> = {
    'API Heat Transfer': 'Aetna December 2024',
    // Add more employer -> plan mappings here as needed
  };

  // Extract unique plan names and employers from the CSV
  const uniquePlanNames = [...new Set(rows.map(row => row.planName).filter(Boolean))];
  const uniqueEmployers = [...new Set(rows.map(row => row.employer).filter(Boolean))];

  // Add mapped plan names from employers
  for (const employer of uniqueEmployers) {
    const mappedPlan = employerToPlanMapping[employer];
    if (mappedPlan && !uniquePlanNames.includes(mappedPlan)) {
      uniquePlanNames.push(mappedPlan);
    }
  }

  // Find or create insurance plans for each unique plan name
  const planNameToIdMap: Record<string, string> = {};

  for (const planName of uniquePlanNames) {
    if (!planName) continue;

    let plan = await prisma.insurancePlan.findFirst({
      where: { planName },
    });

    if (!plan) {
      // Create new plan if it doesn't exist
      plan = await prisma.insurancePlan.create({
        data: {
          planName,
          payerName: planName, // Default to same as planName
          formularyVersion: new Date().toISOString().split('T')[0],
        },
      });
    }

    planNameToIdMap[planName] = plan.id;
  }

  // Upsert patients
  let successCount = 0;
  let failCount = 0;

  for (const row of rows) {
    try {
      // Determine plan ID (if plan name is provided OR can be inferred from employer)
      let planId = null;
      let effectivePlanName = row.planName;

      // If no plan name but has employer, try to map employer to plan
      if (!effectivePlanName && row.employer) {
        effectivePlanName = employerToPlanMapping[row.employer];
      }

      if (effectivePlanName) {
        planId = planNameToIdMap[effectivePlanName];
        if (!planId) {
          throw new Error(`Plan ID not found for plan name: ${effectivePlanName}`);
        }
      }

      // Prepare patient data
      const patientData: any = {
        firstName: row.firstName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
      };

      // Add optional fields
      if (row.externalId) patientData.externalId = row.externalId;
      if (row.pharmacyInsuranceId) patientData.pharmacyInsuranceId = row.pharmacyInsuranceId;
      if (planId) patientData.planId = planId;
      if (effectivePlanName) patientData.formularyPlanName = effectivePlanName;
      if (row.streetAddress) patientData.streetAddress = row.streetAddress;
      if (row.city) patientData.city = row.city;
      if (row.state) patientData.state = row.state;
      if (row.employer) patientData.employer = row.employer;
      if (row.email) patientData.email = row.email;
      if (row.phone) patientData.phone = row.phone;
      if (row.eligibilityStartDate) patientData.eligibilityStartDate = row.eligibilityStartDate;
      if (row.eligibilityEndDate) patientData.eligibilityEndDate = row.eligibilityEndDate;
      if (row.costDesignation) patientData.costDesignation = row.costDesignation;
      if (row.benchmarkCost) patientData.benchmarkCost = row.benchmarkCost;

      // Determine unique identifier for upsert
      let whereClause: any;
      if (row.pharmacyInsuranceId) {
        whereClause = { pharmacyInsuranceId: row.pharmacyInsuranceId };
      } else if (row.externalId) {
        whereClause = { externalId: row.externalId };
      } else {
        throw new Error('Patient must have either externalId or pharmacyInsuranceId');
      }

      await prisma.patient.upsert({
        where: whereClause,
        update: patientData,
        create: patientData,
      });
      successCount++;
    } catch (error: any) {
      failCount++;
      const patientIdentifier = row.pharmacyInsuranceId || row.externalId || 'unknown';
      errors.push({ row: 0, error: `Failed to import patient ${patientIdentifier}: ${error.message}` });
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
