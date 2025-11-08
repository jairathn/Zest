import { z } from 'zod';
import { DrugClass } from '@prisma/client';

const formularySchema = z.object({
  drugName: z.string(),
  genericName: z.string().optional().default(''),
  drugClass: z.string(),
  tier: z.number().int().min(1).max(5),
  requiresPA: z.boolean().optional().default(false),
  stepTherapyRequired: z.boolean().optional().default(false),
  annualCostWAC: z.number().optional(),
  memberCopayT1: z.number().optional(),
  memberCopayT2: z.number().optional(),
  memberCopayT3: z.number().optional(),
  biosimilarOf: z.string().optional(),
  approvedIndications: z.array(z.string()).optional().default([]),
});

type FormularyRow = z.infer<typeof formularySchema>;

const columnMappings = {
  drugName: ['drug name', 'drugname', 'drug', 'medication', 'brand name', 'brand'],
  genericName: ['generic name', 'genericname', 'generic'],
  drugClass: ['drug class', 'drugclass', 'class', 'category', 'type'],
  tier: ['tier', 'formulary tier', 'formulary_tier'],
  requiresPA: ['requires pa', 'pa required', 'prior auth', 'prior authorization', 'pa'],
  stepTherapyRequired: ['step therapy', 'step_therapy', 'step required'],
  annualCostWAC: ['annual cost', 'wac', 'annual_cost_wac', 'yearly cost', 'cost'],
  memberCopayT1: ['copay t1', 'tier 1 copay', 'copay_t1', 'tier1copay'],
  memberCopayT2: ['copay t2', 'tier 2 copay', 'copay_t2', 'tier2copay'],
  memberCopayT3: ['copay t3', 'tier 3 copay', 'copay_t3', 'tier3copay'],
  biosimilarOf: ['biosimilar of', 'biosimilar_of', 'reference product', 'originator'],
  approvedIndications: ['indications', 'approved indications', 'approved_indications'],
};

function normalizeColumnName(col: string): string {
  return col.toLowerCase().trim().replace(/[_\s]+/g, ' ');
}

function mapColumns(headers: string[]): Map<string, string> {
  const mapping = new Map<string, string>();
  const normalizedHeaders = headers.map(h => normalizeColumnName(h));

  for (const [field, aliases] of Object.entries(columnMappings)) {
    for (const alias of aliases) {
      const index = normalizedHeaders.indexOf(alias);
      if (index !== -1) {
        mapping.set(field, headers[index]);
        break;
      }
    }
  }

  return mapping;
}

function parseDrugClass(value: string): DrugClass {
  const normalized = value.toUpperCase().trim().replace(/[\s-]/g, '_');

  if (normalized.includes('TNF')) return 'TNF_INHIBITOR';
  if (normalized.includes('IL17') || normalized.includes('IL_17')) return 'IL17_INHIBITOR';
  if (normalized.includes('IL23') || normalized.includes('IL_23')) return 'IL23_INHIBITOR';
  if (normalized.includes('IL4') || normalized.includes('IL_4') || normalized.includes('IL13') || normalized.includes('IL_13')) return 'IL4_13_INHIBITOR';
  if (normalized.includes('IL12') || normalized.includes('IL_12')) return 'IL12_23_INHIBITOR';
  if (normalized.includes('JAK')) return 'JAK_INHIBITOR';

  return 'OTHER';
}

function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase().trim();
  return ['yes', 'true', '1', 'y'].includes(str);
}

function parseNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

export function parseFormularyCSV(data: any[], planId: string): {
  rows: any[],
  errors: Array<{ row: number, error: string }>
} {
  if (!data || data.length === 0) {
    return { rows: [], errors: [{ row: 0, error: 'No data provided' }] };
  }

  const headers = Object.keys(data[0]);
  const columnMap = mapColumns(headers);

  if (!columnMap.has('drugName')) {
    return { rows: [], errors: [{ row: 0, error: 'Required column "Drug Name" not found' }] };
  }

  const parsedRows: any[] = [];
  const errors: Array<{ row: number, error: string }> = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      const parsed: any = {
        planId,
        drugName: row[columnMap.get('drugName')!],
        genericName: columnMap.has('genericName') ? row[columnMap.get('genericName')!] : '',
        drugClass: parseDrugClass(columnMap.has('drugClass') ? row[columnMap.get('drugClass')!] : 'OTHER'),
        tier: parseNumber(columnMap.has('tier') ? row[columnMap.get('tier')!] : 3) ?? 3,
        requiresPA: columnMap.has('requiresPA') ? parseBoolean(row[columnMap.get('requiresPA')!]) : false,
        stepTherapyRequired: columnMap.has('stepTherapyRequired') ? parseBoolean(row[columnMap.get('stepTherapyRequired')!]) : false,
        annualCostWAC: parseNumber(columnMap.has('annualCostWAC') ? row[columnMap.get('annualCostWAC')!] : undefined),
        memberCopayT1: parseNumber(columnMap.has('memberCopayT1') ? row[columnMap.get('memberCopayT1')!] : undefined),
        memberCopayT2: parseNumber(columnMap.has('memberCopayT2') ? row[columnMap.get('memberCopayT2')!] : undefined),
        memberCopayT3: parseNumber(columnMap.has('memberCopayT3') ? row[columnMap.get('memberCopayT3')!] : undefined),
        biosimilarOf: columnMap.has('biosimilarOf') ? row[columnMap.get('biosimilarOf')!] : null,
        approvedIndications: columnMap.has('approvedIndications')
          ? String(row[columnMap.get('approvedIndications')!]).split(',').map(s => s.trim())
          : [],
      };

      parsedRows.push(parsed);
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { rows: parsedRows, errors };
}
