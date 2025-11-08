import { z } from 'zod';

const claimSchema = z.object({
  patientId: z.string(),
  drugName: z.string(),
  ndcCode: z.string().optional(),
  fillDate: z.date(),
  daysSupply: z.number().int().positive(),
  quantity: z.number().int().positive(),
  outOfPocket: z.number().optional(),
  planPaid: z.number().optional(),
});

type ClaimRow = z.infer<typeof claimSchema>;

const columnMappings = {
  patientId: ['patient id', 'patientid', 'patient_id', 'member id', 'memberid', 'external id', 'externalid'],
  drugName: ['drug name', 'drugname', 'drug', 'medication', 'product'],
  ndcCode: ['ndc', 'ndc code', 'ndc_code', 'ndccode'],
  fillDate: ['fill date', 'filldate', 'fill_date', 'date', 'service date'],
  daysSupply: ['days supply', 'dayssupply', 'days_supply', 'supply'],
  quantity: ['quantity', 'qty', 'amount'],
  outOfPocket: ['out of pocket', 'oop', 'out_of_pocket', 'patient paid', 'copay'],
  planPaid: ['plan paid', 'planpaid', 'plan_paid', 'insurance paid', 'payer paid'],
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

function parseDate(value: any): Date {
  if (value instanceof Date) return value;
  const date = new Date(value);
  if (isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function parseNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

export function parseClaimsCSV(data: any[]): {
  rows: any[],
  errors: Array<{ row: number, error: string }>
} {
  if (!data || data.length === 0) {
    return { rows: [], errors: [{ row: 0, error: 'No data provided' }] };
  }

  const headers = Object.keys(data[0]);
  const columnMap = mapColumns(headers);

  const required = ['patientId', 'drugName', 'fillDate'];
  for (const field of required) {
    if (!columnMap.has(field)) {
      return { rows: [], errors: [{ row: 0, error: `Required column "${field}" not found` }] };
    }
  }

  const parsedRows: any[] = [];
  const errors: Array<{ row: number, error: string }> = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      const parsed: any = {
        patientId: String(row[columnMap.get('patientId')!]).trim(),
        drugName: String(row[columnMap.get('drugName')!]).trim(),
        ndcCode: columnMap.has('ndcCode') ? String(row[columnMap.get('ndcCode')!]).trim() : null,
        fillDate: parseDate(row[columnMap.get('fillDate')!]),
        daysSupply: parseNumber(columnMap.has('daysSupply') ? row[columnMap.get('daysSupply')!] : 90) ?? 90,
        quantity: parseNumber(columnMap.has('quantity') ? row[columnMap.get('quantity')!] : 1) ?? 1,
        outOfPocket: parseNumber(columnMap.has('outOfPocket') ? row[columnMap.get('outOfPocket')!] : undefined),
        planPaid: parseNumber(columnMap.has('planPaid') ? row[columnMap.get('planPaid')!] : undefined),
      };

      parsedRows.push(parsed);
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { rows: parsedRows, errors };
}
