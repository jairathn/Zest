import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import OpenAI from 'openai';

// Note: You'll need to install pdf-parse: npm install pdf-parse
// For now, using a simplified text extraction approach
// In production, add: import pdfParse from 'pdf-parse';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ClinicalFinding {
  finding: string;
  drug?: string;
  drugClass?: string;
  indication?: string;
  findingType: string;
}

interface PaperExtraction {
  paperTitle: string;
  paperAuthors: string;
  citation: string;
  doi?: string;
  pubmedId?: string;
  findings: ClinicalFinding[];
}

/**
 * Extract clinical findings from paper text using GPT-4
 */
async function extractFindingsFromPaper(paperText: string, filename: string): Promise<PaperExtraction> {
  const prompt = `You are a clinical research analyst extracting key findings from a dermatology research paper about biologic therapies.

Read the following research paper and extract:
1. Paper metadata (title, authors, citation, DOI, PubMed ID)
2. All key clinical findings related to dose reduction, efficacy, safety, or cost-effectiveness

For each finding:
- Write it as a complete, standalone sentence
- Include specific numbers/percentages from the study
- Identify the drug(s) studied
- Categorize the finding type
- Make it physician-ready (no truncation, no metadata, include the trial/study name in the sentence)

CRITICAL: Each finding should be a COMPLETE sentence that makes sense on its own.

Example findings:
- "The CONDOR trial demonstrated that 53% of patients with stable psoriasis maintained dose-reduced adalimumab therapy over 12 months without persistent flares."
- "At 2-year follow-up, 41% of patients sustained low-dose biologic therapy without safety issues."

PAPER TEXT:
${paperText.substring(0, 50000)}

Return ONLY a JSON object with this structure:
{
  "paperTitle": "Full paper title",
  "paperAuthors": "First author et al." or "Author1, Author2, Author3",
  "citation": "Full citation in format: Author et al., Journal, Year;Volume(Issue):Pages",
  "doi": "10.xxxx/xxxxx or null",
  "pubmedId": "PMID number or null",
  "findings": [
    {
      "finding": "Complete sentence with specific finding",
      "drug": "adalimumab",
      "drugClass": "TNF_INHIBITOR",
      "indication": "PSORIASIS",
      "findingType": "DOSE_REDUCTION"
    }
  ]
}

findingType options: DOSE_REDUCTION, INTERVAL_EXTENSION, EFFICACY, SAFETY, COST_EFFECTIVENESS, OTHER`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  return result as PaperExtraction;
}

/**
 * Save extracted findings to database
 */
async function saveFindingsToDatabase(extraction: PaperExtraction, sourceFile: string) {
  for (const finding of extraction.findings) {
    await prisma.clinicalFinding.create({
      data: {
        paperTitle: extraction.paperTitle,
        paperAuthors: extraction.paperAuthors,
        citation: extraction.citation,
        doi: extraction.doi,
        pubmedId: extraction.pubmedId,
        finding: finding.finding,
        drug: finding.drug,
        drugClass: finding.drugClass,
        indication: finding.indication,
        findingType: finding.findingType,
        sourceFile: sourceFile,
        extractedBy: 'gpt-4o',
        reviewed: false,
      },
    });
  }
}

/**
 * Extract text from PDF buffer
 * TODO: Replace with actual PDF parsing using pdf-parse
 */
async function extractPDFText(buffer: Buffer): Promise<string> {
  // For now, return a placeholder
  // In production, use pdf-parse:
  // const pdfData = await pdfParse(buffer);
  // return pdfData.text;

  // Temporary: Try to read as text (won't work for real PDFs)
  try {
    return buffer.toString('utf-8');
  } catch {
    throw new Error('PDF parsing not yet implemented. Please install pdf-parse: npm install pdf-parse');
  }
}

/**
 * POST /api/knowledge/upload
 * Upload PDFs and extract clinical findings
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }

    const results = [];

    for (const file of files) {
      try {
        console.log(`Processing: ${file.name}`);

        // Read file as buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract text from PDF
        let paperText: string;
        try {
          // Try to use pdf-parse if available
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(buffer);
          paperText = pdfData.text;
        } catch {
          // Fallback: try reading as text
          paperText = buffer.toString('utf-8');
          if (!paperText || paperText.length < 100) {
            throw new Error('Could not extract text from PDF. Install pdf-parse: npm install pdf-parse');
          }
        }

        // Extract findings using GPT-4
        const extraction = await extractFindingsFromPaper(paperText, file.name);

        // Save to database
        await saveFindingsToDatabase(extraction, file.name);

        results.push({
          filename: file.name,
          paperTitle: extraction.paperTitle,
          findingsCount: extraction.findings.length,
          success: true,
        });

        console.log(`✓ Extracted ${extraction.findings.length} findings from ${file.name}`);
      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        results.push({
          filename: file.name,
          error: error.message,
          success: false,
        });
      }
    }

    const totalFindings = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.findingsCount || 0), 0);

    return NextResponse.json({
      success: true,
      filesProcessed: results.filter(r => r.success).length,
      totalFindings,
      results,
    });
  } catch (error: any) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Set maximum duration for long-running uploads (5 minutes)
// This allows processing ~10 papers at ~30 seconds each
export const maxDuration = 300; // 5 minutes in seconds (Vercel Pro/Enterprise)
export const dynamic = 'force-dynamic'; // Disable caching for upload endpoint
