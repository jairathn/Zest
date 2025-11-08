import { z } from 'zod';

const eligibilitySchema = z.object({
  externalId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.date(),
  planId: z.string(),
});

type EligibilityRow = z.infer<typeof eligibilitySchema>;

const columnMappings = {
  externalId: ['patient id', 'patientid', 'patient_id', 'member id', 'memberid', 'external id', 'externalid'],
  firstName: ['first name', 'firstname', 'first_name', 'fname'],
  lastName: ['last name', 'lastname', 'last_name', 'lname'],
  dateOfBirth: ['date of birth', 'dob', 'date_of_birth', 'birth date', 'birthdate'],
  planId: ['plan id', 'planid', 'plan_id', 'insurance plan', 'plan name'],
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

export function parseEligibilityCSV(data: any[], defaultPlanId?: string): {
  rows: any[],
  errors: Array<{ row: number, error: string }>
} {
  if (!data || data.length === 0) {
    return { rows: [], errors: [{ row: 0, error: 'No data provided' }] };
  }

  const headers = Object.keys(data[0]);
  const columnMap = mapColumns(headers);

  const required = ['externalId', 'firstName', 'lastName', 'dateOfBirth'];
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
      const planId = columnMap.has('planId')
        ? String(row[columnMap.get('planId')!]).trim()
        : defaultPlanId;

      if (!planId) {
        throw new Error('Plan ID not found and no default provided');
      }

      const parsed: any = {
        externalId: String(row[columnMap.get('externalId')!]).trim(),
        firstName: String(row[columnMap.get('firstName')!]).trim(),
        lastName: String(row[columnMap.get('lastName')!]).trim(),
        dateOfBirth: parseDate(row[columnMap.get('dateOfBirth')!]),
        planId,
      };

      parsedRows.push(parsed);
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { rows: parsedRows, errors };
}
