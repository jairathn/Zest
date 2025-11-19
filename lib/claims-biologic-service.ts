/**
 * Service to determine current biologic from claims data
 * This is the source of truth for what medication a patient is currently on
 */

import { findDrugByNdc } from './ndc-mappings';
import { PharmacyClaim } from '@prisma/client';

export interface BiologicFromClaims {
  drugName: string;
  genericName?: string;
  drugClass?: string;
  dose: string;
  frequency: string; // Inferred from claims pattern
  strength?: string;
  dosageForm?: string;
  lastFillDate: Date;
  ndcCode: string;
}

/**
 * Get current biologic from claims data (most recent fill with NDC)
 * @param claims - Array of pharmacy claims, should be ordered by fillDate desc
 * @returns Biologic information from most recent claim, or null if no biologic claims found
 */
export function getCurrentBiologicFromClaims(
  claims: PharmacyClaim[]
): BiologicFromClaims | null {
  if (!claims || claims.length === 0) {
    return null;
  }

  // Find the most recent claim with an NDC code
  const mostRecentClaimWithNDC = claims.find(claim => claim.ndcCode);

  if (!mostRecentClaimWithNDC || !mostRecentClaimWithNDC.ndcCode) {
    return null;
  }

  // Look up drug information from NDC mapping
  const drugInfo = findDrugByNdc(mostRecentClaimWithNDC.ndcCode);

  if (!drugInfo) {
    // NDC code not in our mapping - return basic claim data
    return {
      drugName: mostRecentClaimWithNDC.drugName || 'Unknown Drug',
      dose: 'As prescribed',
      frequency: 'As prescribed',
      lastFillDate: mostRecentClaimWithNDC.fillDate,
      ndcCode: mostRecentClaimWithNDC.ndcCode,
    };
  }

  // Infer frequency from drug class and typical dosing patterns
  const frequency = inferFrequency(drugInfo.drugClass, drugInfo.drugName, claims);

  return {
    drugName: drugInfo.drugName,
    genericName: drugInfo.genericName,
    drugClass: drugInfo.drugClass,
    dose: drugInfo.strength || 'As prescribed',
    frequency,
    strength: drugInfo.strength,
    dosageForm: drugInfo.dosageForm,
    lastFillDate: mostRecentClaimWithNDC.fillDate,
    ndcCode: mostRecentClaimWithNDC.ndcCode,
  };
}

/**
 * Infer dosing frequency from drug class and claims pattern
 * This is a best-effort inference based on typical biologic dosing regimens
 */
function inferFrequency(
  drugClass: string | undefined,
  drugName: string,
  claims: PharmacyClaim[]
): string {
  // Default frequencies by drug class
  const defaultFrequencies: Record<string, string> = {
    TNF_INHIBITOR: 'Every 2 weeks', // Most TNF inhibitors (adalimumab, etanercept weekly, certolizumab)
    IL17_INHIBITOR: 'Monthly (after loading)', // Secukinumab, ixekizumab
    IL23_INHIBITOR: 'Every 8 weeks (after loading)', // Guselkumab, risankizumab
    IL12_23_INHIBITOR: 'Every 12 weeks (after loading)', // Ustekinumab
    IL4_13_INHIBITOR: 'Every 2 weeks', // Dupilumab
    JAK_INHIBITOR: 'Daily', // Oral JAK inhibitors
    OTHER: 'As prescribed',
  };

  // Try to calculate frequency from claims pattern
  if (claims.length >= 2) {
    const recentClaims = claims.slice(0, Math.min(3, claims.length));
    const daysBetweenFills: number[] = [];

    for (let i = 0; i < recentClaims.length - 1; i++) {
      const current = new Date(recentClaims[i].fillDate);
      const next = new Date(recentClaims[i + 1].fillDate);
      const daysDiff = Math.abs((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));
      daysBetweenFills.push(daysDiff);
    }

    if (daysBetweenFills.length > 0) {
      const avgDays = daysBetweenFills.reduce((a, b) => a + b, 0) / daysBetweenFills.length;

      // Map average days to frequency
      if (avgDays <= 10) return 'Weekly';
      if (avgDays <= 17) return 'Every 2 weeks';
      if (avgDays <= 35) return 'Monthly';
      if (avgDays <= 45) return 'Every 6 weeks';
      if (avgDays <= 65) return 'Every 8 weeks';
      if (avgDays <= 95) return 'Every 12 weeks';
      if (avgDays > 95) return 'Every 3+ months';
    }
  }

  // Fall back to default frequency for drug class
  return defaultFrequencies[drugClass || 'OTHER'] || 'As prescribed';
}

/**
 * Helper to format biologic info for display
 */
export function formatBiologicDisplay(biologic: BiologicFromClaims): string {
  return `${biologic.drugName} ${biologic.dose} ${biologic.frequency}`;
}

/**
 * Check if manually entered biologic differs from claims data
 */
export function isBiologicOverride(
  manualDrugName: string,
  claimsBiologic: BiologicFromClaims | null
): boolean {
  if (!claimsBiologic) {
    return false; // No claims data, so anything manual is not really an override
  }

  // Normalize for comparison (case-insensitive, trim whitespace)
  const normalizedManual = manualDrugName.toLowerCase().trim();
  const normalizedClaims = claimsBiologic.drugName.toLowerCase().trim();

  return normalizedManual !== normalizedClaims;
}
