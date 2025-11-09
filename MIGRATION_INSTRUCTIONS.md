# Database Migration Instructions

## Dataset Tracking System Migration

A database migration is required to add the dataset tracking functionality.

### Quick Start (For Existing Database)

If you get error **P3005: "The database schema is not empty"**, your database exists but has no migration history. Use this approach:

```bash
# Run the automated script
./apply-migration.sh

# OR run commands manually:
npx prisma db push --skip-generate
npx prisma migrate resolve --applied 20250109000000_add_dataset_tracking_fields
```

### Quick Start (For New Database)

If your database is empty:

```bash
npx prisma migrate deploy
```

### What This Migration Does

The migration adds the following fields to support dataset tracking:

1. **UploadLog table**:
   - `datasetLabel` (TEXT, nullable) - User-provided label for datasets
   - `planId` (TEXT, nullable) - Links formulary uploads to InsurancePlan

2. **FormularyDrug table**:
   - `uploadLogId` (TEXT, nullable) - Links each drug to its upload dataset

3. **PharmacyClaim table**:
   - `uploadLogId` (TEXT, nullable) - Links each claim to its upload dataset

4. **Indexes** for query performance on dataset lookups

5. **Foreign Keys** to maintain referential integrity

### Manual Migration (if needed)

If you need to apply the migration manually:

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Run the migration SQL
\i prisma/migrations/20250109000000_add_dataset_tracking_fields/migration.sql
```

### Verification

After running the migration, verify it worked:

```bash
npx prisma db pull
```

This should match your current `schema.prisma` file.

### Troubleshooting

**If migration fails due to existing columns:**
The migration uses `IF NOT EXISTS` clauses, so it's safe to run multiple times.

**If you see "column already exists" errors:**
The columns may have been added manually. You can mark the migration as applied:

```bash
npx prisma migrate resolve --applied 20250109000000_add_dataset_tracking_fields
```

### After Migration

Once the migration is applied, the application will support:
- Multiple formulary versions per insurance plan
- Dataset labeling and management
- View/download datasets as CSV
- Automatic selection of most recent formulary for recommendations
