import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const decimal = (value: number) => new Prisma.Decimal(value);

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.recommendation.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.contraindication.deleteMany();
  await prisma.pharmacyClaim.deleteMany();
  await prisma.currentBiologic.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.formularyDrug.deleteMany();
  await prisma.insurancePlan.deleteMany();
  await prisma.knowledgeDocument.deleteMany();

  // Create insurance plan
  const plan = await prisma.insurancePlan.create({
    data: {
      planName: 'BlueCross PPO 2025',
      payerName: 'BlueCross BlueShield',
      effectiveDate: new Date('2025-01-01'),
      formularyVersion: '2025-Q1',
    },
  });

  console.log('Created insurance plan:', plan.id);

  // Create formulary drugs
  const formularyDrugs = await prisma.formularyDrug.createMany({
    data: [
      // Tier 1 - Preferred biosimilars
      {
        planId: plan.id,
        drugName: 'Amjevita',
        genericName: 'adalimumab-atto',
        drugClass: 'TNF_INHIBITOR',
        tier: 1,
        requiresPA: false,
        stepTherapyRequired: false,
        annualCostWAC: decimal(28500),
        memberCopayT1: decimal(300),
        biosimilarOf: 'Humira',
        approvedIndications: ['PSORIASIS', 'ATOPIC_DERMATITIS'],
      },
      {
        planId: plan.id,
        drugName: 'Hyrimoz',
        genericName: 'adalimumab-adaz',
        drugClass: 'TNF_INHIBITOR',
        tier: 1,
        requiresPA: false,
        stepTherapyRequired: false,
        annualCostWAC: decimal(29000),
        memberCopayT1: decimal(300),
        biosimilarOf: 'Humira',
        approvedIndications: ['PSORIASIS'],
      },
      // Tier 2 - Preferred brands
      {
        planId: plan.id,
        drugName: 'Cosentyx',
        genericName: 'secukinumab',
        drugClass: 'IL17_INHIBITOR',
        tier: 2,
        requiresPA: false,
        stepTherapyRequired: true,
        annualCostWAC: decimal(68000),
        memberCopayT2: decimal(1200),
        approvedIndications: ['PSORIASIS'],
      },
      {
        planId: plan.id,
        drugName: 'Skyrizi',
        genericName: 'risankizumab',
        drugClass: 'IL23_INHIBITOR',
        tier: 2,
        requiresPA: false,
        stepTherapyRequired: true,
        annualCostWAC: decimal(75000),
        memberCopayT2: decimal(1200),
        approvedIndications: ['PSORIASIS'],
      },
      {
        planId: plan.id,
        drugName: 'Dupixent',
        genericName: 'dupilumab',
        drugClass: 'IL4_13_INHIBITOR',
        tier: 2,
        requiresPA: false,
        stepTherapyRequired: true,
        annualCostWAC: decimal(48000),
        memberCopayT2: decimal(1200),
        approvedIndications: ['ATOPIC_DERMATITIS'],
      },
      // Tier 3 - Non-preferred
      {
        planId: plan.id,
        drugName: 'Humira',
        genericName: 'adalimumab',
        drugClass: 'TNF_INHIBITOR',
        tier: 3,
        requiresPA: true,
        stepTherapyRequired: false,
        annualCostWAC: decimal(84000),
        memberCopayT3: decimal(10200),
        approvedIndications: ['PSORIASIS', 'ATOPIC_DERMATITIS'],
      },
      {
        planId: plan.id,
        drugName: 'Taltz',
        genericName: 'ixekizumab',
        drugClass: 'IL17_INHIBITOR',
        tier: 3,
        requiresPA: true,
        stepTherapyRequired: false,
        annualCostWAC: decimal(72000),
        memberCopayT3: decimal(10200),
        approvedIndications: ['PSORIASIS'],
      },
      {
        planId: plan.id,
        drugName: 'Tremfya',
        genericName: 'guselkumab',
        drugClass: 'IL23_INHIBITOR',
        tier: 3,
        requiresPA: true,
        stepTherapyRequired: false,
        annualCostWAC: decimal(78000),
        memberCopayT3: decimal(10200),
        approvedIndications: ['PSORIASIS'],
      },
    ],
  });

  console.log('Created formulary drugs');

  // Create sample patients
  const patient1 = await prisma.patient.create({
    data: {
      externalId: 'P001',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1978-03-15'),
      planId: plan.id,
    },
  });

  // John - on expensive Humira, stable disease (candidate for biosimilar switch)
  await prisma.currentBiologic.create({
    data: {
      patientId: patient1.id,
      drugName: 'Humira',
      dose: '40mg',
      frequency: 'Q2W',
      route: 'SC',
      startDate: new Date('2023-01-15'),
      lastFillDate: new Date('2025-01-15'),
    },
  });

  // Add pharmacy claims
  const fillDates = [
    new Date('2024-07-01'),
    new Date('2024-10-01'),
    new Date('2025-01-01'),
  ];

  for (const fillDate of fillDates) {
    await prisma.pharmacyClaim.create({
      data: {
        patientId: patient1.id,
        drugName: 'Humira',
        ndcCode: '00000-0000-01',
        fillDate,
        daysSupply: 90,
        quantity: 6,
        outOfPocket: decimal(850),
        planPaid: decimal(20000),
      },
    });
  }

  const patient2 = await prisma.patient.create({
    data: {
      externalId: 'P002',
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: new Date('1985-07-22'),
      planId: plan.id,
    },
  });

  // Jane - on Cosentyx (Tier 2), stable, candidate for dose reduction
  await prisma.currentBiologic.create({
    data: {
      patientId: patient2.id,
      drugName: 'Cosentyx',
      dose: '300mg',
      frequency: 'Q4W',
      route: 'SC',
      startDate: new Date('2023-06-01'),
      lastFillDate: new Date('2025-01-01'),
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      externalId: 'P003',
      firstName: 'Bob',
      lastName: 'Johnson',
      dateOfBirth: new Date('1972-11-03'),
      planId: plan.id,
    },
  });

  // Bob - on Tremfya (Tier 3), unstable disease
  await prisma.currentBiologic.create({
    data: {
      patientId: patient3.id,
      drugName: 'Tremfya',
      dose: '100mg',
      frequency: 'Q8W',
      route: 'SC',
      startDate: new Date('2023-12-01'),
      lastFillDate: new Date('2025-01-01'),
    },
  });

  // Add contraindication for Bob (heart failure - contraindicated for TNF inhibitors)
  await prisma.contraindication.create({
    data: {
      patientId: patient3.id,
      type: 'HEART_FAILURE',
      details: 'NYHA Class II heart failure',
    },
  });

  console.log('Created 3 sample patients');

  // Create sample knowledge documents
  await prisma.knowledgeDocument.create({
    data: {
      title: 'Biosimilar Switching Guidelines',
      content: `Biosimilars are biological products highly similar to FDA-approved reference products with no clinically meaningful differences in safety, purity, and potency. Clinical studies demonstrate that switching from reference biologics to biosimilars in stable patients is safe and effective. The NOR-SWITCH trial (Lancet 2017) showed non-inferiority of switching from originator infliximab to biosimilar in multiple immune-mediated inflammatory diseases. For adalimumab biosimilars, real-world evidence supports safe switching in psoriasis patients with maintained disease control.`,
      category: 'BIOSIMILAR_EVIDENCE',
      sourceUrl: 'https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(17)30068-5',
    },
  });

  await prisma.knowledgeDocument.create({
    data: {
      title: 'Dose Reduction Strategies for Biologics',
      content: `Dose reduction or interval extension of biologic therapy in stable psoriasis patients may be considered to reduce costs while maintaining disease control. Studies suggest that patients with PASI <3 or DLQI ≤5 for at least 6 months may be candidates for cautious dose de-escalation. The CONDOR trial demonstrated successful dose reduction in 40% of patients with stable disease on adalimumab. Close monitoring is essential, with DLQI assessments at 3 and 6 months post-reduction. Be prepared to resume standard dosing if disease activity increases.`,
      category: 'DOSE_REDUCTION',
    },
  });

  await prisma.knowledgeDocument.create({
    data: {
      title: 'Formulary Management Best Practices',
      content: `Value-based formulary design prioritizes biosimilars and preferred agents with demonstrated efficacy and cost-effectiveness. Step therapy requirements for higher-tier agents ensure appropriate sequencing. Prior authorization should be streamlined for formulary-preferred options while non-preferred agents require clinical justification. Consider patient out-of-pocket costs when making recommendations, as high copays can reduce adherence and outcomes.`,
      category: 'FORMULARY_STRATEGY',
    },
  });

  console.log('Created knowledge base documents');
  console.log('Seed data completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
