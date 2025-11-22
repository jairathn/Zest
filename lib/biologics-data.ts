/**
 * Comprehensive biologic data for psoriasis and atopic dermatitis
 * Including brand names, generics, approved doses, and frequencies
 */

export interface BiologicOption {
  brand: string;
  generic: string;
  approvedDoses: string[];
  standardFrequencies: Array<{ value: string; label: string }>;
  indications: ('PSORIASIS' | 'ATOPIC_DERMATITIS' | 'PSORIATIC_ARTHRITIS')[];
}

export const BIOLOGICS_DATA: BiologicOption[] = [
  // TNF Inhibitors
  {
    brand: 'Humira',
    generic: 'adalimumab',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Amjevita',
    generic: 'adalimumab-atto',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Cyltezo',
    generic: 'adalimumab-adbm',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Hadlima',
    generic: 'adalimumab-bwwd',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Hyrimoz',
    generic: 'adalimumab-adaz',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Yuflyma',
    generic: 'adalimumab-aaty',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Hulio',
    generic: 'adalimumab-fkjp',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Idacio',
    generic: 'adalimumab-aacf',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Yusimry',
    generic: 'adalimumab-aqvh',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Simlandi',
    generic: 'adalimumab-ryvk',
    approvedDoses: ['40mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Enbrel',
    generic: 'etanercept',
    approvedDoses: ['25mg', '50mg'],
    standardFrequencies: [
      { value: 'twice-weekly', label: 'Twice weekly' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Erelzi',
    generic: 'etanercept-szzs',
    approvedDoses: ['25mg', '50mg'],
    standardFrequencies: [
      { value: 'twice-weekly', label: 'Twice weekly' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Eticovo',
    generic: 'etanercept-ykro',
    approvedDoses: ['25mg', '50mg'],
    standardFrequencies: [
      { value: 'twice-weekly', label: 'Twice weekly' },
      { value: 'weekly', label: 'Weekly' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Remicade',
    generic: 'infliximab',
    approvedDoses: ['5mg/kg'],
    standardFrequencies: [
      { value: 'every-8-weeks', label: 'Every 8 weeks (after loading)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Inflectra',
    generic: 'infliximab-dyyb',
    approvedDoses: ['5mg/kg'],
    standardFrequencies: [
      { value: 'every-8-weeks', label: 'Every 8 weeks (after loading)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Renflexis',
    generic: 'infliximab-abda',
    approvedDoses: ['5mg/kg'],
    standardFrequencies: [
      { value: 'every-8-weeks', label: 'Every 8 weeks (after loading)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Cimzia',
    generic: 'certolizumab',
    approvedDoses: ['200mg', '400mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'every-4-weeks', label: 'Every 4 weeks' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Simponi',
    generic: 'golimumab',
    approvedDoses: ['50mg', '100mg'],
    standardFrequencies: [
      { value: 'monthly', label: 'Monthly' },
    ],
    indications: ['PSORIATIC_ARTHRITIS'],
  },

  // IL-17 Inhibitors
  {
    brand: 'Cosentyx',
    generic: 'secukinumab',
    approvedDoses: ['150mg', '300mg'],
    standardFrequencies: [
      { value: 'monthly', label: 'Monthly (after loading)' },
      { value: 'every-4-weeks', label: 'Every 4 weeks' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Taltz',
    generic: 'ixekizumab',
    approvedDoses: ['80mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks (weeks 0-12)' },
      { value: 'every-4-weeks', label: 'Every 4 weeks (maintenance)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Siliq',
    generic: 'brodalumab',
    approvedDoses: ['210mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
    ],
    indications: ['PSORIASIS'],
  },

  // IL-23 Inhibitors
  {
    brand: 'Skyrizi',
    generic: 'risankizumab',
    approvedDoses: ['150mg'],
    standardFrequencies: [
      { value: 'every-12-weeks', label: 'Every 12 weeks (after loading)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Tremfya',
    generic: 'guselkumab',
    approvedDoses: ['100mg'],
    standardFrequencies: [
      { value: 'every-8-weeks', label: 'Every 8 weeks (after loading)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Ilumya',
    generic: 'tildrakizumab',
    approvedDoses: ['100mg'],
    standardFrequencies: [
      { value: 'every-12-weeks', label: 'Every 12 weeks (after loading)' },
    ],
    indications: ['PSORIASIS'],
  },

  // IL-12/23 Inhibitors
  {
    brand: 'Stelara',
    generic: 'ustekinumab',
    approvedDoses: ['45mg', '90mg'],
    standardFrequencies: [
      { value: 'every-12-weeks', label: 'Every 12 weeks (after loading)' },
    ],
    indications: ['PSORIASIS', 'PSORIATIC_ARTHRITIS'],
  },

  // IL-4/13 Inhibitors (Atopic Dermatitis)
  {
    brand: 'Dupixent',
    generic: 'dupilumab',
    approvedDoses: ['200mg', '300mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'every-4-weeks', label: 'Every 4 weeks' },
    ],
    indications: ['ATOPIC_DERMATITIS'],
  },
  {
    brand: 'Adbry',
    generic: 'tralokinumab',
    approvedDoses: ['300mg'],
    standardFrequencies: [
      { value: 'every-2-weeks', label: 'Every 2 weeks' },
      { value: 'every-4-weeks', label: 'Every 4 weeks (after 16 weeks)' },
    ],
    indications: ['ATOPIC_DERMATITIS'],
  },

  // JAK Inhibitors
  {
    brand: 'Rinvoq',
    generic: 'upadacitinib',
    approvedDoses: ['15mg', '30mg'],
    standardFrequencies: [
      { value: 'daily', label: 'Daily' },
    ],
    indications: ['ATOPIC_DERMATITIS', 'PSORIATIC_ARTHRITIS'],
  },
  {
    brand: 'Cibinqo',
    generic: 'abrocitinib',
    approvedDoses: ['50mg', '100mg', '200mg'],
    standardFrequencies: [
      { value: 'daily', label: 'Daily' },
    ],
    indications: ['ATOPIC_DERMATITIS'],
  },
];

/**
 * Get all biologics as autocomplete options
 */
export function getBiologicOptions(): Array<{ value: string; label: string; generic: string }> {
  return BIOLOGICS_DATA.map(bio => ({
    value: bio.brand,
    label: `${bio.brand} (${bio.generic})`,
    generic: bio.generic,
  }));
}

/**
 * Get biologic data by brand name
 */
export function getBiologicByBrand(brand: string): BiologicOption | undefined {
  return BIOLOGICS_DATA.find(bio => bio.brand.toLowerCase() === brand.toLowerCase());
}

/**
 * Get approved doses for a specific biologic
 */
export function getApprovedDoses(brand: string): string[] {
  const biologic = getBiologicByBrand(brand);
  return biologic?.approvedDoses || [];
}

/**
 * Get standard frequencies for a specific biologic
 */
export function getStandardFrequencies(brand: string): Array<{ value: string; label: string }> {
  const biologic = getBiologicByBrand(brand);
  return biologic?.standardFrequencies || [];
}

/**
 * Convert frequency value to display text
 */
export function parseFrequencyValue(value: string): { number: number; unit: string } | null {
  // Handle standard frequency codes
  const standardMap: Record<string, { number: number; unit: string }> = {
    'daily': { number: 1, unit: 'days' },
    'weekly': { number: 1, unit: 'weeks' },
    'twice-weekly': { number: 3.5, unit: 'days' },
    'monthly': { number: 1, unit: 'months' },
    'every-2-weeks': { number: 2, unit: 'weeks' },
    'every-4-weeks': { number: 4, unit: 'weeks' },
    'every-8-weeks': { number: 8, unit: 'weeks' },
    'every-12-weeks': { number: 12, unit: 'weeks' },
  };

  if (standardMap[value]) {
    return standardMap[value];
  }

  // Try to parse custom format: "every-X-weeks/days/months"
  const match = value.match(/every-(\d+)-(weeks|days|months)/);
  if (match) {
    return { number: parseInt(match[1]), unit: match[2] };
  }

  return null;
}

/**
 * Format frequency for display
 */
export function formatFrequency(number: number, unit: string): string {
  if (number === 1 && unit === 'days') return 'Daily';
  if (number === 1 && unit === 'weeks') return 'Weekly';
  if (number === 1 && unit === 'months') return 'Monthly';
  return `Every ${number} ${unit}`;
}
