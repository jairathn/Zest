/**
 * Retrieve structured clinical findings for dose reduction recommendations
 *
 * This replaces the chunking/RAG searchKnowledge() function with structured retrieval.
 * Instead of searching noisy chunks, we query clean, LLM-extracted findings.
 */

import { prisma } from './db';

export interface ClinicalFindingResult {
  finding: string;
  citation: string;
  paperTitle: string;
  relevance?: number;  // For compatibility with existing code
}

/**
 * Search for clinical findings related to dose reduction
 *
 * @param drug - Generic drug name (e.g., "adalimumab")
 * @param indication - Diagnosis (e.g., "PSORIASIS")
 * @param findingTypes - Types of findings to include (default: dose reduction and safety)
 * @returns Array of formatted findings with citations
 */
export async function searchClinicalFindings(
  drug: string,
  indication: string,
  findingTypes: string[] = ['DOSE_REDUCTION', 'INTERVAL_EXTENSION', 'SAFETY']
): Promise<ClinicalFindingResult[]> {
  // Query structured findings from database
  const findings = await prisma.clinicalFinding.findMany({
    where: {
      AND: [
        {
          OR: [
            { drug: { contains: drug, mode: 'insensitive' } },
            { drugClass: { contains: drug, mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { indication: { contains: indication, mode: 'insensitive' } },
            { finding: { contains: indication, mode: 'insensitive' } },
          ],
        },
        {
          findingType: { in: findingTypes },
        },
        // CRITICAL: Only include reviewed findings in production
        // Unreviewed findings may contain errors or be irrelevant
        { reviewed: true },
      ],
    },
    orderBy: [
      { reviewed: 'desc' },  // Prioritize human-reviewed findings
      { extractedAt: 'desc' },  // Then most recent
    ],
    take: 10,  // Limit to top 10 findings
  });

  // Format for display
  return findings.map(f => ({
    finding: f.finding,
    citation: f.citation,
    paperTitle: f.paperTitle,
    relevance: 1.0,  // All are 100% relevant (filtered by query)
  }));
}

/**
 * Search for clinical findings with flexible text search
 * (fallback for cases where structured fields aren't filled)
 */
export async function searchClinicalFindingsFullText(
  searchQuery: string
): Promise<ClinicalFindingResult[]> {
  const findings = await prisma.clinicalFinding.findMany({
    where: {
      OR: [
        { finding: { contains: searchQuery, mode: 'insensitive' } },
        { drug: { contains: searchQuery, mode: 'insensitive' } },
        { paperTitle: { contains: searchQuery, mode: 'insensitive' } },
      ],
    },
    orderBy: [
      { reviewed: 'desc' },
      { extractedAt: 'desc' },
    ],
    take: 10,
  });

  return findings.map(f => ({
    finding: f.finding,
    citation: f.citation,
    paperTitle: f.paperTitle,
    relevance: 1.0,
  }));
}

/**
 * Format findings for LLM prompt
 *
 * Converts structured findings into the format expected by the LLM decision engine
 */
export function formatFindingsForPrompt(findings: ClinicalFindingResult[]): string {
  if (findings.length === 0) {
    return 'No clinical findings available for this drug/indication combination.';
  }

  return findings
    .map((f, i) => {
      return `📄 ${f.paperTitle}\nCitation: ${f.citation}\nFinding: ${f.finding}\n`;
    })
    .join('\n---\n\n');
}
