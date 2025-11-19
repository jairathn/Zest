#!/bin/bash
# Migration script to add override tracking fields to CurrentBiologic table
# Run this script to apply the migration to your database

echo "🔄 Running migration: Add biologic override tracking fields"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo ""
  echo "Please set DATABASE_URL first:"
  echo "  export DATABASE_URL='your-postgres-connection-string'"
  echo ""
  echo "Example:"
  echo "  export DATABASE_URL='postgresql://user:password@localhost:5432/dbname'"
  exit 1
fi

# Run the migration SQL
psql "$DATABASE_URL" << 'EOF'
-- Migration: Add override tracking to CurrentBiologic table
ALTER TABLE "CurrentBiologic"
ADD COLUMN IF NOT EXISTS "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "claimsDrugName" TEXT,
ADD COLUMN IF NOT EXISTS "claimsDose" TEXT,
ADD COLUMN IF NOT EXISTS "claimsFrequency" TEXT;

-- Add comments
COMMENT ON COLUMN "CurrentBiologic"."isManualOverride" IS 'True if user manually changed from claims data';
COMMENT ON COLUMN "CurrentBiologic"."claimsDrugName" IS 'Drug name from claims data (for reference even if overridden)';
COMMENT ON COLUMN "CurrentBiologic"."claimsDose" IS 'Dose from claims data';
COMMENT ON COLUMN "CurrentBiologic"."claimsFrequency" IS 'Frequency inferred from claims data';

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'CurrentBiologic'
AND column_name IN ('isManualOverride', 'claimsDrugName', 'claimsDose', 'claimsFrequency');
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration completed successfully!"
else
  echo ""
  echo "❌ Migration failed. Please check the error message above."
  exit 1
fi
