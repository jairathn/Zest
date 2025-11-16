// Script to seed NDC mappings into the database
import { PrismaClient } from '@prisma/client';
import { biologicNdcMappings } from '../lib/ndc-mappings';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding NDC mappings...');

  let inserted = 0;
  let skipped = 0;

  for (const mapping of biologicNdcMappings) {
    try {
      await prisma.ndcMapping.upsert({
        where: { ndcCode: mapping.ndcCode },
        update: {
          drugName: mapping.drugName,
          genericName: mapping.genericName,
          drugClass: mapping.drugClass,
          strength: mapping.strength,
          dosageForm: mapping.dosageForm,
        },
        create: {
          ndcCode: mapping.ndcCode,
          drugName: mapping.drugName,
          genericName: mapping.genericName,
          drugClass: mapping.drugClass,
          strength: mapping.strength,
          dosageForm: mapping.dosageForm,
        },
      });
      inserted++;
    } catch (error) {
      console.error(`Error inserting NDC ${mapping.ndcCode}:`, error);
      skipped++;
    }
  }

  console.log(`✅ Seeded ${inserted} NDC mappings (${skipped} skipped)`);
}

main()
  .catch((e) => {
    console.error('Error seeding NDC mappings:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
