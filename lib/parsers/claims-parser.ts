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
  pharmacyInsuranceId: ['pharmacy insurance id', 'pharmacyinsuranceid', 'pharmacy_insurance_id', 'insurance id', 'insuranceid'],
  drugName: ['drug name', 'drugname', 'drug', 'medication', 'product'],
  ndcCode: ['ndc', 'ndc code', 'ndc_code', 'ndccode'],
  fillDate: ['fill date', 'filldate', 'fill_date', 'date', 'service date'],
  daysSupply: ['days supply', 'dayssupply', 'days_supply', 'supply'],
  quantity: ['quantity', 'qty', 'amount'],
  diagnosisCode: ['diagnosis code', 'diagnosiscode', 'diagnosis_code', 'dx code', 'icd10', 'icd-10'],
  outOfPocket: ['out of pocket', 'oop', 'out_of_pocket', 'patient paid', 'copay', 'member paid', 'cost (member paid)'],
  planPaid: ['plan paid', 'planpaid', 'plan_paid', 'insurance paid', 'payer paid', 'cost (plan paid)'],
  trueDrugCost: ['true drug cost', 'truedrug cost', 'true_drug_cost', 'net cost', 'cost (true drug cost)', 'actual cost'],
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

  // Required: fill date and at least one patient identifier
  const required = ['fillDate'];
  for (const field of required) {
    if (!columnMap.has(field)) {
      return { rows: [], errors: [{ row: 0, error: `Required column "${field}" not found` }] };
    }
  }

  // Check that we have at least one patient identifier
  if (!columnMap.has('patientId') && !columnMap.has('pharmacyInsuranceId')) {
    return { rows: [], errors: [{ row: 0, error: 'CSV must include either "Patient ID" or "Pharmacy Insurance ID" column' }] };
  }

  // Check that we have at least one drug identifier
  if (!columnMap.has('drugName') && !columnMap.has('ndcCode')) {
    return { rows: [], errors: [{ row: 0, error: 'CSV must include either "Drug Name" or "NDC Code" column' }] };
  }

  const parsedRows: any[] = [];
  const errors: Array<{ row: number, error: string }> = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      const parsed: any = {
        fillDate: parseDate(row[columnMap.get('fillDate')!]),
      };

      // Patient identifiers (at least one required)
      if (columnMap.has('patientId')) {
        const patientId = String(row[columnMap.get('patientId')!] || '').trim();
        if (patientId) parsed.patientId = patientId;
      }

      if (columnMap.has('pharmacyInsuranceId')) {
        const pharmacyInsuranceId = String(row[columnMap.get('pharmacyInsuranceId')!] || '').trim();
        if (pharmacyInsuranceId) parsed.pharmacyInsuranceId = pharmacyInsuranceId;
      }

      // Drug identifiers (at least one required)
      if (columnMap.has('drugName')) {
        const drugName = String(row[columnMap.get('drugName')!] || '').trim();
        if (drugName) parsed.drugName = drugName;
      }

      if (columnMap.has('ndcCode')) {
        const ndcCode = String(row[columnMap.get('ndcCode')!] || '').trim();
        if (ndcCode) parsed.ndcCode = ndcCode;
      }

      // Optional fields
      if (columnMap.has('daysSupply')) {
        const daysSupply = parseNumber(row[columnMap.get('daysSupply')!]);
        if (daysSupply !== undefined) parsed.daysSupply = daysSupply;
      }

      if (columnMap.has('quantity')) {
        const quantity = parseNumber(row[columnMap.get('quantity')!]);
        if (quantity !== undefined) parsed.quantity = quantity;
      }

      if (columnMap.has('diagnosisCode')) {
        const diagnosisCode = String(row[columnMap.get('diagnosisCode')!] || '').trim();
        if (diagnosisCode) parsed.diagnosisCode = diagnosisCode;
      }

      if (columnMap.has('outOfPocket')) {
        const outOfPocket = parseNumber(row[columnMap.get('outOfPocket')!]);
        if (outOfPocket !== undefined) parsed.outOfPocket = outOfPocket;
      }

      if (columnMap.has('planPaid')) {
        const planPaid = parseNumber(row[columnMap.get('planPaid')!]);
        if (planPaid !== undefined) parsed.planPaid = planPaid;
      }

      if (columnMap.has('trueDrugCost')) {
        const trueDrugCost = parseNumber(row[columnMap.get('trueDrugCost')!]);
        if (trueDrugCost !== undefined) parsed.trueDrugCost = trueDrugCost;
      }

      parsedRows.push(parsed);
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { rows: parsedRows, errors };
}
