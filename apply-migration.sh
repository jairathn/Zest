#!/bin/bash
set -e

echo "=== Applying Dataset Tracking Migration ==="
echo ""

echo "Step 1: Applying schema changes to database..."
npx prisma db push --skip-generate

echo ""
echo "Step 2: Marking migration as applied in history..."
npx prisma migrate resolve --applied 20250109000000_add_dataset_tracking_fields

echo ""
echo "✓ Migration complete!"
echo ""
echo "The following fields have been added:"
echo "  - UploadLog: datasetLabel, planId"
echo "  - FormularyDrug: uploadLogId"
echo "  - PharmacyClaim: uploadLogId"
echo ""
echo "Next: Restart your dev server and test uploads!"
