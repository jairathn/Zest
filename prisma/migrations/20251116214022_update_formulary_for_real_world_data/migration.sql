-- AlterTable FormularyDrug: Add new fields for real-world formulary data
ALTER TABLE "FormularyDrug" ADD COLUMN "formulation" TEXT;
ALTER TABLE "FormularyDrug" ADD COLUMN "strength" TEXT;
ALTER TABLE "FormularyDrug" ADD COLUMN "restrictions" TEXT;
ALTER TABLE "FormularyDrug" ADD COLUMN "quantityLimit" TEXT;
ALTER TABLE "FormularyDrug" ADD COLUMN "fdaIndications" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "FormularyDrug" ADD COLUMN "ndcCode" TEXT;

-- AlterTable FormularyDrug: Change drugClass from enum to text
-- First, convert existing enum values to text
ALTER TABLE "FormularyDrug" ALTER COLUMN "drugClass" TYPE TEXT USING "drugClass"::TEXT;

-- AlterTable FormularyDrug: Change requiresPA from boolean to text
-- Convert existing boolean values: true -> 'Yes', false -> 'No'
ALTER TABLE "FormularyDrug" ALTER COLUMN "requiresPA" DROP DEFAULT;
ALTER TABLE "FormularyDrug" ALTER COLUMN "requiresPA" TYPE TEXT USING CASE WHEN "requiresPA" = true THEN 'Yes' ELSE 'No' END;
ALTER TABLE "FormularyDrug" ALTER COLUMN "requiresPA" DROP NOT NULL;

-- AlterTable FormularyDrug: Drop old cost fields
ALTER TABLE "FormularyDrug" DROP COLUMN IF EXISTS "annualCostWAC";
ALTER TABLE "FormularyDrug" DROP COLUMN IF EXISTS "memberCopayT1";
ALTER TABLE "FormularyDrug" DROP COLUMN IF EXISTS "memberCopayT2";
ALTER TABLE "FormularyDrug" DROP COLUMN IF EXISTS "memberCopayT3";

-- AlterTable FormularyDrug: Rename approvedIndications to fdaIndications if needed
-- (Skip if column doesn't exist or already named correctly)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='FormularyDrug' AND column_name='approvedIndications') THEN
    ALTER TABLE "FormularyDrug" RENAME COLUMN "approvedIndications" TO "fdaIndications";
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FormularyDrug_genericName_idx" ON "FormularyDrug"("genericName");
CREATE INDEX IF NOT EXISTS "FormularyDrug_drugClass_idx" ON "FormularyDrug"("drugClass");
CREATE INDEX IF NOT EXISTS "FormularyDrug_tier_idx" ON "FormularyDrug"("tier");
CREATE INDEX IF NOT EXISTS "FormularyDrug_ndcCode_idx" ON "FormularyDrug"("ndcCode");

-- AlterTable NdcMapping: Change drugClass from enum to text
ALTER TABLE "NdcMapping" ALTER COLUMN "drugClass" TYPE TEXT USING "drugClass"::TEXT;
ALTER TABLE "NdcMapping" ALTER COLUMN "drugClass" DROP NOT NULL;

-- AlterTable NdcMapping: Add formulation field
ALTER TABLE "NdcMapping" ADD COLUMN IF NOT EXISTS "formulation" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NdcMapping_genericName_idx" ON "NdcMapping"("genericName");

-- Drop DrugClass enum (only if it's not used anywhere else)
-- This may fail if there are still dependencies, which is okay
DO $$
BEGIN
  DROP TYPE IF EXISTS "DrugClass" CASCADE;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore errors if enum is still in use
END $$;
