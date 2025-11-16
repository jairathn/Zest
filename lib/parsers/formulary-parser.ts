import { z } from 'zod';

const formularySchema = z.object({
  drugName: z.string(),
  genericName: z.string().optional().default(''),
  drugClass: z.string(),
  formulation: z.string().optional(),
  strength: z.string().optional(),
  tier: z.number().int().min(1).max(5),
  requiresPA: z.string().optional(),
  stepTherapyRequired: z.boolean().optional().default(false),
  restrictions: z.string().optional(),
  quantityLimit: z.string().optional(),
  biosimilarOf: z.string().optional(),
  fdaIndications: z.array(z.string()).optional().default([]),
  ndcCode: z.string().optional(),
});

type FormularyRow = z.infer<typeof formularySchema>;

const columnMappings = {
  drugName: ['drug name', 'drugname', 'drug', 'medication', 'brand name', 'brand'],
  genericName: ['generic name', 'genericname', 'generic'],
  drugClass: ['drug class', 'drugclass', 'class', 'category', 'type'],
  formulation: ['formulation', 'dosage form', 'form'],
  strength: ['strength', 'dose strength', 'concentration'],
  tier: ['tier', 'formulary tier', 'formulary_tier'],
  requiresPA: ['requires pa', 'pa required', 'prior auth', 'prior authorization', 'pa'],
  stepTherapyRequired: ['step therapy', 'step_therapy', 'step required'],
  restrictions: ['restrictions', 'restriction', 'limits'],
  quantityLimit: ['quantity limit', 'quantity_limit', 'qty limit', 'ql'],
  biosimilarOf: ['biosimilar of', 'biosimilar_of', 'reference product', 'originator'],
  fdaIndications: ['fda indications', 'indications', 'approved indications', 'approved_indications'],
  ndcCode: ['ndc code', 'ndc', 'ndc_code', 'national drug code'],
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
        drugClass: columnMap.has('drugClass') ? String(row[columnMap.get('drugClass')!]) : 'OTHER',
        formulation: columnMap.has('formulation') ? row[columnMap.get('formulation')!] : null,
        strength: columnMap.has('strength') ? row[columnMap.get('strength')!] : null,
        tier: parseNumber(columnMap.has('tier') ? row[columnMap.get('tier')!] : 3) ?? 3,
        requiresPA: columnMap.has('requiresPA') ? String(row[columnMap.get('requiresPA')!]) : null,
        stepTherapyRequired: columnMap.has('stepTherapyRequired') ? parseBoolean(row[columnMap.get('stepTherapyRequired')!]) : false,
        restrictions: columnMap.has('restrictions') ? row[columnMap.get('restrictions')!] : null,
        quantityLimit: columnMap.has('quantityLimit') ? row[columnMap.get('quantityLimit')!] : null,
        biosimilarOf: columnMap.has('biosimilarOf') ? row[columnMap.get('biosimilarOf')!] : null,
        fdaIndications: columnMap.has('fdaIndications')
          ? String(row[columnMap.get('fdaIndications')!]).split(/[;,]/).map(s => s.trim()).filter(s => s.length > 0)
          : [],
        ndcCode: columnMap.has('ndcCode') ? row[columnMap.get('ndcCode')!] : null,
      };

      parsedRows.push(parsed);
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { rows: parsedRows, errors };
}
