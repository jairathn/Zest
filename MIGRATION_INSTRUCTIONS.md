# Database Migration Instructions

## Add Biologic Override Tracking Fields

This migration adds override tracking to the `CurrentBiologic` table to support claims-based biologic auto-population.

### Option 1: Using the Migration Script (Recommended)

1. **Set your DATABASE_URL environment variable:**
   ```bash
   export DATABASE_URL='postgresql://username:password@host:port/database'
   ```

2. **Run the migration script:**
   ```bash
   ./scripts/migrate-biologic-override.sh
   ```

### Option 2: Using Prisma DB Push

If your DATABASE_URL is already configured in your `.env` file:

```bash
npx prisma db push
```

This will automatically sync your Prisma schema to the database.

### Option 3: Manual SQL Execution

Connect to your PostgreSQL database and run:

```sql
ALTER TABLE "CurrentBiologic"
ADD COLUMN IF NOT EXISTS "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "claimsDrugName" TEXT,
ADD COLUMN IF NOT EXISTS "claimsDose" TEXT,
ADD COLUMN IF NOT EXISTS "claimsFrequency" TEXT;
```

### Option 4: Using psql Command Directly

```bash
psql "$DATABASE_URL" -f prisma/migrations/add_biologic_override_tracking.sql
```

## Verify Migration

After running the migration, verify the columns were added:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'CurrentBiologic'
AND column_name IN ('isManualOverride', 'claimsDrugName', 'claimsDose', 'claimsFrequency');
```

You should see 4 new columns.

## Troubleshooting

**"DATABASE_URL not found"**
- Make sure you've set the environment variable or have a `.env` file with `DATABASE_URL`

**"psql: command not found"**
- Install PostgreSQL client tools or use Option 2 (Prisma DB Push)

**"Permission denied"**
- For the script: Run `chmod +x scripts/migrate-biologic-override.sh`
- For database: Ensure your user has ALTER TABLE permissions
