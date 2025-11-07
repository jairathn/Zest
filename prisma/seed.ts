import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const decimal = (value: number) => new Prisma.Decimal(value);

async function main() {
  await prisma.recommendationFeedback.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.clinicalAssessment.deleteMany();
  await prisma.pharmacyClaim.deleteMany();
  await prisma.claimsHistory.deleteMany();
  await prisma.currentMedication.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.formularyDrug.deleteMany();
  await prisma.insurancePlan.deleteMany();
  await prisma.user.deleteMany();

  const provider = await prisma.user.create({
    data: {
      email: 'provider@zest.com',
      password: '$2a$10$placeholderhash',
      name: 'Dr. Provider',
      npi: '1234567890',
      role: 'PROVIDER'
    }
  });

  await prisma.user.create({
    data: {
      email: 'admin@zest.com',
      password: '$2a$10$placeholderhash',
      name: 'Admin User',
      npi: null,
      role: 'ADMIN'
    }
  });

  const plan = await prisma.insurancePlan.create({
    data: {
      planName: 'BlueCross PPO 2025',
      payerName: 'BlueCross',
      effectiveDate: new Date('2025-01-01'),
      formularyVersion: '2025-Q1'
    }
  });

  await prisma.formularyDrug.createMany({
    data: [
      {
        planId: plan.id,
        drugName: 'Amjevita',
        genericName: 'adalimumab-atto',
        drugClass: 'TNF_INHIBITOR',
        tier: 1,
        requiresPA: false,
        stepTherapyRequired: false,
        annualCostWAC: decimal(28500),
        memberCopayT1: decimal(25),
        memberCopayT2: decimal(25),
        memberCopayT3: decimal(25),
        biosimilarOf: 'Humira'
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
        memberCopayT1: decimal(25),
        memberCopayT2: decimal(25),
        memberCopayT3: decimal(25),
        biosimilarOf: 'Humira'
      },
      {
        planId: plan.id,
        drugName: 'Cosentyx',
        genericName: 'secukinumab',
        drugClass: 'IL17_INHIBITOR',
        tier: 2,
        requiresPA: false,
        stepTherapyRequired: true,
        annualCostWAC: decimal(68000),
        memberCopayT1: decimal(100),
        memberCopayT2: decimal(100),
        memberCopayT3: decimal(100)
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
        memberCopayT1: decimal(100),
        memberCopayT2: decimal(100),
        memberCopayT3: decimal(100)
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
        memberCopayT1: decimal(100),
        memberCopayT2: decimal(100),
        memberCopayT3: decimal(100)
      },
      {
        planId: plan.id,
        drugName: 'Humira',
        genericName: 'adalimumab',
        drugClass: 'TNF_INHIBITOR',
        tier: 3,
        requiresPA: true,
        stepTherapyRequired: false,
        annualCostWAC: decimal(84000),
        memberCopayT1: decimal(850),
        memberCopayT2: decimal(850),
        memberCopayT3: decimal(850)
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
        memberCopayT1: decimal(850),
        memberCopayT2: decimal(850),
        memberCopayT3: decimal(850)
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
        memberCopayT1: decimal(850),
        memberCopayT2: decimal(850),
        memberCopayT3: decimal(850)
      },
      {
        planId: plan.id,
        drugName: 'Stelara',
        genericName: 'ustekinumab',
        drugClass: 'IL12_23_INHIBITOR',
        tier: 3,
        requiresPA: true,
        stepTherapyRequired: false,
        annualCostWAC: decimal(89000),
        memberCopayT1: decimal(850),
        memberCopayT2: decimal(850),
        memberCopayT3: decimal(850)
      }
    ]
  });

  const patients = [
    {
      info: {
        firstName: 'John',
        lastName: 'Doe',
        externalId: 'P1',
        dateOfBirth: new Date('1978-03-15')
      },
      currentMedication: {
        drugName: 'Humira',
        dose: '40mg',
        frequency: 'Q2W',
        route: 'SC',
        startDate: new Date('2023-01-15'),
        lastFillDate: new Date('2025-01-15'),
        adherencePDC: decimal(94)
      },
      claimsHistory: [
        {
          drugName: 'Methotrexate',
          startDate: new Date('2021-06-01'),
          endDate: new Date('2022-08-01'),
          reasonDiscontinued: 'Inadequate response'
        },
        {
          drugName: 'Otezla',
          startDate: new Date('2022-09-01'),
          endDate: new Date('2022-12-01'),
          reasonDiscontinued: 'GI side effects'
        },
        {
          drugName: 'Humira',
          startDate: new Date('2023-01-15'),
          endDate: null,
          reasonDiscontinued: null
        }
      ],
      fills: generateQuarterlyFills('Humira', 850)
    },
    {
      info: {
        firstName: 'Jane',
        lastName: 'Smith',
        externalId: 'P2',
        dateOfBirth: new Date('1985-07-22')
      },
      currentMedication: {
        drugName: 'Cosentyx',
        dose: '300mg',
        frequency: 'Q4W',
        route: 'SC',
        startDate: new Date('2023-06-01'),
        lastFillDate: new Date('2025-01-01'),
        adherencePDC: decimal(97)
      },
      claimsHistory: [
        { drugName: 'Topical steroids', startDate: new Date('2021-01-01'), endDate: new Date('2021-12-31'), reasonDiscontinued: 'Inadequate control' },
        { drugName: 'Phototherapy', startDate: new Date('2022-01-01'), endDate: new Date('2022-12-31'), reasonDiscontinued: 'Limited response' }
      ],
      fills: generateQuarterlyFills('Cosentyx', 100)
    },
    {
      info: {
        firstName: 'Bob',
        lastName: 'Johnson',
        externalId: 'P3',
        dateOfBirth: new Date('1972-11-03')
      },
      currentMedication: {
        drugName: 'Tremfya',
        dose: '100mg',
        frequency: 'Q8W',
        route: 'SC',
        startDate: new Date('2023-12-01'),
        lastFillDate: new Date('2025-01-01'),
        adherencePDC: decimal(89)
      },
      claimsHistory: [
        { drugName: 'Humira', startDate: new Date('2021-01-01'), endDate: new Date('2022-04-01'), reasonDiscontinued: 'Loss of response' },
        { drugName: 'Enbrel', startDate: new Date('2022-05-01'), endDate: new Date('2023-01-01'), reasonDiscontinued: 'Inadequate response' }
      ],
      fills: generateQuarterlyFills('Tremfya', 850)
    },
    {
      info: {
        firstName: 'Sarah',
        lastName: 'Williams',
        externalId: 'P4',
        dateOfBirth: new Date('1990-02-10')
      },
      currentMedication: {
        drugName: 'Amjevita',
        dose: '40mg',
        frequency: 'Q2W',
        route: 'SC',
        startDate: new Date('2024-06-01'),
        lastFillDate: new Date('2025-01-01'),
        adherencePDC: decimal(76)
      },
      claimsHistory: [
        { drugName: 'Amjevita', startDate: new Date('2024-06-01'), endDate: null, reasonDiscontinued: null }
      ],
      fills: generateQuarterlyFills('Amjevita', 25)
    },
    {
      info: {
        firstName: 'Mike',
        lastName: 'Chen',
        externalId: 'P5',
        dateOfBirth: new Date('1980-09-18')
      },
      currentMedication: {
        drugName: 'Dupixent',
        dose: '300mg',
        frequency: 'Q2W',
        route: 'SC',
        startDate: new Date('2023-02-01'),
        lastFillDate: new Date('2025-01-01'),
        adherencePDC: decimal(99)
      },
      claimsHistory: [
        { drugName: 'Topical steroids', startDate: new Date('2021-05-01'), endDate: new Date('2022-12-01'), reasonDiscontinued: 'Inadequate response' }
      ],
      fills: generateQuarterlyFills('Dupixent', 100)
    }
  ];

  for (const patientData of patients) {
    const patient = await prisma.patient.create({
      data: {
        ...patientData.info,
        insurancePlanId: plan.id
      }
    });

    await prisma.currentMedication.create({
      data: {
        patientId: patient.id,
        ...patientData.currentMedication
      }
    });

    for (const history of patientData.claimsHistory) {
      await prisma.claimsHistory.create({
        data: {
          patientId: patient.id,
          ...history
        }
      });
    }

    for (const fill of patientData.fills) {
      await prisma.pharmacyClaim.create({
        data: {
          patientId: patient.id,
          drugName: patientData.currentMedication.drugName,
          ndcCode: '00000-0000',
          fillDate: fill.fillDate,
          daysSupply: 90,
          quantity: 6,
          outOfPocket: decimal(fill.opp),
          planPaid: decimal(fill.opp * 2)
        }
      });
    }
  }

  console.log('Seed data created successfully', { providerId: provider.id });
}

function generateQuarterlyFills(drugName: string, oopMonthly: number) {
  const fills = [] as Array<{ fillDate: Date; opp: number }>;
  const baseDate = new Date('2024-01-01');
  for (let i = 0; i < 6; i++) {
    const fillDate = new Date(baseDate);
    fillDate.setMonth(baseDate.getMonth() + i * 3);
    fills.push({ fillDate, opp: oopMonthly });
  }
  return fills;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
