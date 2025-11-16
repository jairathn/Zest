import { z } from 'zod';

const eligibilitySchema = z.object({
  externalId: z.string().optional(),
  pharmacyInsuranceId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.date(),
  planName: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  employer: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  eligibilityStartDate: z.date().optional(),
  eligibilityEndDate: z.date().optional(),
  costDesignation: z.string().optional(),
  benchmarkCost: z.number().optional(),
});

type EligibilityRow = z.infer<typeof eligibilitySchema>;

const columnMappings = {
  externalId: ['patient id', 'patientid', 'patient_id', 'member id', 'memberid', 'external id', 'externalid'],
  pharmacyInsuranceId: ['pharmacy insurance id', 'pharmacyinsuranceid', 'pharmacy_insurance_id', 'insurance id', 'insuranceid'],
  firstName: ['first name', 'firstname', 'first_name', 'fname'],
  lastName: ['last name', 'lastname', 'last_name', 'lname'],
  dateOfBirth: ['date of birth', 'dob', 'date_of_birth', 'birth date', 'birthdate'],
  planName: ['formulary plan', 'plan name', 'plan', 'insurance plan', 'insurance', 'payer'],
  streetAddress: ['personal street address', 'street address', 'address', 'street', 'address1'],
  city: ['personal address city', 'city', 'address city'],
  state: ['state', 'st'],
  employer: ['employer', 'employer name'],
  email: ['personal email', 'email', 'email address'],
  phone: ['mobile phone', 'phone', 'phone number', 'mobile'],
  eligibilityStartDate: ['eligibility start date', 'start date', 'effective date'],
  eligibilityEndDate: ['eligibility end date', 'end date', 'termination date'],
  costDesignation: ['cost designation', 'cost tier', 'cost category'],
  benchmarkCost: ['benchmark cost', 'target cost', 'baseline cost'],
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

export function parseEligibilityCSV(data: any[]): {
  rows: any[],
  errors: Array<{ row: number, error: string }>
} {
  if (!data || data.length === 0) {
    return { rows: [], errors: [{ row: 0, error: 'No data provided' }] };
  }

  const headers = Object.keys(data[0]);
  const columnMap = mapColumns(headers);

  // Required fields are flexible: need either externalId OR pharmacyInsuranceId
  const required = ['firstName', 'lastName', 'dateOfBirth'];
  for (const field of required) {
    if (!columnMap.has(field)) {
      return { rows: [], errors: [{ row: 0, error: `Required column "${field}" not found.` }] };
    }
  }

  // Check that we have at least one identifier
  if (!columnMap.has('externalId') && !columnMap.has('pharmacyInsuranceId')) {
    return { rows: [], errors: [{ row: 0, error: 'CSV must include either "Patient ID" or "Pharmacy Insurance ID" column' }] };
  }

  const parsedRows: any[] = [];
  const errors: Array<{ row: number, error: string }> = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      const parsed: any = {
        firstName: String(row[columnMap.get('firstName')!]).trim(),
        lastName: String(row[columnMap.get('lastName')!]).trim(),
        dateOfBirth: parseDate(row[columnMap.get('dateOfBirth')!]),
      };

      // Add optional fields
      if (columnMap.has('externalId')) {
        const externalId = String(row[columnMap.get('externalId')!] || '').trim();
        if (externalId) parsed.externalId = externalId;
      }

      if (columnMap.has('pharmacyInsuranceId')) {
        const pharmacyInsuranceId = String(row[columnMap.get('pharmacyInsuranceId')!] || '').trim();
        if (pharmacyInsuranceId) parsed.pharmacyInsuranceId = pharmacyInsuranceId;
      }

      if (columnMap.has('planName')) {
        const planName = String(row[columnMap.get('planName')!] || '').trim();
        if (planName) parsed.planName = planName;
      }

      if (columnMap.has('streetAddress')) {
        const streetAddress = String(row[columnMap.get('streetAddress')!] || '').trim();
        if (streetAddress) parsed.streetAddress = streetAddress;
      }

      if (columnMap.has('city')) {
        const city = String(row[columnMap.get('city')!] || '').trim();
        if (city) parsed.city = city;
      }

      if (columnMap.has('state')) {
        const state = String(row[columnMap.get('state')!] || '').trim();
        if (state) parsed.state = state;
      }

      if (columnMap.has('employer')) {
        const employer = String(row[columnMap.get('employer')!] || '').trim();
        if (employer) parsed.employer = employer;
      }

      if (columnMap.has('email')) {
        const email = String(row[columnMap.get('email')!] || '').trim();
        if (email) parsed.email = email;
      }

      if (columnMap.has('phone')) {
        const phone = String(row[columnMap.get('phone')!] || '').trim();
        if (phone) parsed.phone = phone;
      }

      if (columnMap.has('eligibilityStartDate')) {
        try {
          parsed.eligibilityStartDate = parseDate(row[columnMap.get('eligibilityStartDate')!]);
        } catch {
          // Ignore invalid dates
        }
      }

      if (columnMap.has('eligibilityEndDate')) {
        try {
          parsed.eligibilityEndDate = parseDate(row[columnMap.get('eligibilityEndDate')!]);
        } catch {
          // Ignore invalid dates
        }
      }

      if (columnMap.has('costDesignation')) {
        const costDesignation = String(row[columnMap.get('costDesignation')!] || '').trim();
        if (costDesignation) {
          // Map to enum values
          if (costDesignation.toLowerCase().includes('high')) {
            parsed.costDesignation = 'HIGH_COST';
          } else if (costDesignation.toLowerCase().includes('low')) {
            parsed.costDesignation = 'LOW_COST';
          }
        }
      }

      if (columnMap.has('benchmarkCost')) {
        const benchmarkCost = parseNumber(row[columnMap.get('benchmarkCost')!]);
        if (benchmarkCost !== undefined) parsed.benchmarkCost = benchmarkCost;
      }

      parsedRows.push(parsed);
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { rows: parsedRows, errors };
}
