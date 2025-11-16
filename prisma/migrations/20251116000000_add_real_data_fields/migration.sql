-- CreateEnum (if not exists)
DO $$ BEGIN
  CREATE TYPE "CostDesignation" AS ENUM ('LOW_COST', 'HIGH_COST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable Patient - Add new fields
ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "pharmacyInsuranceId" TEXT,
  ADD COLUMN IF NOT EXISTS "streetAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "employer" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "eligibilityStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eligibilityEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "costDesignation" "CostDesignation",
  ADD COLUMN IF NOT EXISTS "benchmarkCost" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "formularyPlanName" TEXT;

-- Make planId nullable (if not already)
ALTER TABLE "Patient" ALTER COLUMN "planId" DROP NOT NULL;

-- Make externalId nullable (if not already)
ALTER TABLE "Patient" ALTER COLUMN "externalId" DROP NOT NULL;

-- Add unique constraint on pharmacyInsuranceId (if not exists)
DO $$ BEGIN
  ALTER TABLE "Patient" ADD CONSTRAINT "Patient_pharmacyInsuranceId_key" UNIQUE ("pharmacyInsuranceId");
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS "Patient_pharmacyInsuranceId_idx" ON "Patient"("pharmacyInsuranceId");
CREATE INDEX IF NOT EXISTS "Patient_externalId_idx" ON "Patient"("externalId");

-- AlterTable PharmacyClaim - Update fields
ALTER TABLE "PharmacyClaim"
  ADD COLUMN IF NOT EXISTS "diagnosisCode" TEXT,
  ADD COLUMN IF NOT EXISTS "trueDrugCost" DECIMAL(12,2);

-- Make drugName nullable
ALTER TABLE "PharmacyClaim" ALTER COLUMN "drugName" DROP NOT NULL;

-- Make daysSupply nullable
ALTER TABLE "PharmacyClaim" ALTER COLUMN "daysSupply" DROP NOT NULL;

-- Make quantity nullable
ALTER TABLE "PharmacyClaim" ALTER COLUMN "quantity" DROP NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS "PharmacyClaim_ndcCode_idx" ON "PharmacyClaim"("ndcCode");
CREATE INDEX IF NOT EXISTS "PharmacyClaim_diagnosisCode_idx" ON "PharmacyClaim"("diagnosisCode");

-- CreateTable NdcMapping
CREATE TABLE IF NOT EXISTS "NdcMapping" (
    "id" TEXT NOT NULL,
    "ndcCode" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "genericName" TEXT,
    "drugClass" "DrugClass",
    "strength" TEXT,
    "dosageForm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NdcMapping_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on ndcCode (if not exists)
DO $$ BEGIN
  ALTER TABLE "NdcMapping" ADD CONSTRAINT "NdcMapping_ndcCode_key" UNIQUE ("ndcCode");
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS "NdcMapping_ndcCode_idx" ON "NdcMapping"("ndcCode");
CREATE INDEX IF NOT EXISTS "NdcMapping_drugName_idx" ON "NdcMapping"("drugName");
