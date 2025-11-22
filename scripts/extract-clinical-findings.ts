/**
 * Extract structured clinical findings from research papers using LLM
 *
 * This replaces the chunking/RAG approach with structured extraction:
 * - LLM reads entire paper
 * - Extracts key findings as clean, complete sentences
 * - Each finding includes full citation
 * - Findings are stored in structured format for easy retrieval
 *
 * Usage:
 *   npx ts-node scripts/extract-clinical-findings.ts path/to/paper.pdf
 *   npx ts-node scripts/extract-clinical-findings.ts path/to/papers/  # Batch process directory
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ClinicalFinding {
  finding: string;
  drug?: string;
  drugClass?: string;
  indication?: string;
  findingType: 'EFFICACY' | 'SAFETY' | 'DOSE_REDUCTION' | 'INTERVAL_EXTENSION' | 'COST_EFFECTIVENESS' | 'OTHER';
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
 * Extract clinical findings from a paper using GPT-4
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
- Make it physician-ready (no truncation, no metadata, no references to "the study" - use the trial name)

CRITICAL: Each finding should be a COMPLETE sentence that makes sense on its own, with the trial name included.

PAPER TEXT:
${paperText}

Return ONLY a JSON object with this structure:
{
  "paperTitle": "Full paper title",
  "paperAuthors": "First author et al." or "Author1, Author2, Author3",
  "citation": "Full citation in format: Author et al., Journal, Year;Volume(Issue):Pages",
  "doi": "10.xxxx/xxxxx or null",
  "pubmedId": "PMID number or null",
  "findings": [
    {
      "finding": "The CONDOR trial demonstrated that 53% of patients with stable psoriasis maintained dose-reduced adalimumab therapy over 12 months.",
      "drug": "adalimumab",
      "drugClass": "TNF_INHIBITOR",
      "indication": "PSORIASIS",
      "findingType": "DOSE_REDUCTION"
    },
    {
      "finding": "At 2-year follow-up, 41% of patients sustained low-dose biologic therapy without persistent flares or safety issues.",
      "drug": "adalimumab",
      "drugClass": "TNF_INHIBITOR",
      "indication": "PSORIASIS",
      "findingType": "SAFETY"
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    temperature: 0.2,  // Low temperature for accuracy
    system: 'You are a clinical research analyst. Always respond with valid JSON only, no other text.',
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  const result = JSON.parse(content.type === 'text' ? content.text : '{}');
  return result as PaperExtraction;
}

/**
 * Save extracted findings to database
 */
async function saveFindingsToDatabase(extraction: PaperExtraction, sourceFile: string) {
  console.log(`\n📝 Saving ${extraction.findings.length} findings from "${extraction.paperTitle}"...`);

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
        extractedBy: 'claude-sonnet-4-5-20250929',
        reviewed: false,  // Requires human review before production use
      },
    });
  }

  console.log(`✅ Saved ${extraction.findings.length} findings`);
}

/**
 * Process a single PDF file
 */
async function processPDF(pdfPath: string) {
  console.log(`\n📄 Processing: ${path.basename(pdfPath)}`);

  // TODO: Add PDF text extraction
  // For now, assuming text is available (you'll need to add PDF parser)
  const paperText = fs.readFileSync(pdfPath, 'utf-8');

  const extraction = await extractFindingsFromPaper(paperText, pdfPath);

  console.log(`\n📊 Extracted from: ${extraction.paperTitle}`);
  console.log(`   Authors: ${extraction.paperAuthors}`);
  console.log(`   Citation: ${extraction.citation}`);
  console.log(`   Findings: ${extraction.findings.length}`);

  // Preview first 3 findings
  console.log(`\n   Sample findings:`);
  extraction.findings.slice(0, 3).forEach((f, i) => {
    console.log(`   ${i + 1}. ${f.finding.substring(0, 100)}...`);
  });

  await saveFindingsToDatabase(extraction, pdfPath);
}

/**
 * Main function
 */
async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Usage: npx ts-node scripts/extract-clinical-findings.ts <path-to-pdf-or-directory>');
    process.exit(1);
  }

  console.log('🔬 Clinical Findings Extraction Tool');
  console.log('=====================================\n');

  const stats = fs.statSync(inputPath);

  if (stats.isDirectory()) {
    // Process all PDFs in directory
    const files = fs.readdirSync(inputPath)
      .filter(f => f.endsWith('.pdf'))
      .map(f => path.join(inputPath, f));

    console.log(`Found ${files.length} PDF files to process\n`);

    for (const file of files) {
      try {
        await processPDF(file);
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error);
      }
    }
  } else {
    // Process single PDF
    await processPDF(inputPath);
  }

  console.log('\n✨ Extraction complete!');
  console.log('\n⚠️  IMPORTANT: Review extracted findings before using in production.');
  console.log('   Run: SELECT * FROM "ClinicalFinding" WHERE reviewed = false;\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
