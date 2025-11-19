-- Migration: Add override tracking to CurrentBiologic table
-- This allows tracking when user manually overrides claims data

-- Add new columns to CurrentBiologic table
ALTER TABLE "CurrentBiologic"
ADD COLUMN IF NOT EXISTS "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "claimsDrugName" TEXT,
ADD COLUMN IF NOT EXISTS "claimsDose" TEXT,
ADD COLUMN IF NOT EXISTS "claimsFrequency" TEXT;

-- Add comments to explain the fields
COMMENT ON COLUMN "CurrentBiologic"."isManualOverride" IS 'True if user manually changed from claims data';
COMMENT ON COLUMN "CurrentBiologic"."claimsDrugName" IS 'Drug name from claims data (for reference even if overridden)';
COMMENT ON COLUMN "CurrentBiologic"."claimsDose" IS 'Dose from claims data';
COMMENT ON COLUMN "CurrentBiologic"."claimsFrequency" IS 'Frequency inferred from claims data';
