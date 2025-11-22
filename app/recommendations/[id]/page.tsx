import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { AlertCircle, TrendingDown, DollarSign, FileText } from 'lucide-react';
import { Suspense } from 'react';
import ContraindicatedDrugsToggle from './ContraindicatedDrugsToggle';

interface PageProps {
  params: { id: string };
}

export default async function RecommendationsPage({ params }: PageProps) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: params.id },
    include: {
      patient: {
        include: {
          currentBiologics: true,
          plan: {
            include: {
              formularyDrugs: {
                orderBy: [
                  { tier: 'asc' },
                  { requiresPA: 'asc' },
                ],
              },
            },
          },
          contraindications: true,
        },
      },
      recommendations: {
        orderBy: { rank: 'asc' },
      },
    },
  });

  if (!assessment) {
    notFound();
  }

  // Resolve formulary drugs (same logic as decision engine)
  // If patient has formularyPlanName but no linked plan, look up the plan by name
  let effectivePlanId = assessment.patient.planId;
  if (!effectivePlanId && assessment.patient.formularyPlanName) {
    const planByName = await prisma.insurancePlan.findFirst({
      where: { planName: assessment.patient.formularyPlanName },
    });
    if (planByName) {
      effectivePlanId = planByName.id;
    }
  }

  // Fetch formulary drugs from the most recent upload for the effective plan
  const mostRecentUpload = effectivePlanId
    ? await prisma.uploadLog.findFirst({
        where: {
          uploadType: 'FORMULARY',
          planId: effectivePlanId,
        },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true },
      })
    : null;

  const fetchedFormularyDrugs = mostRecentUpload && effectivePlanId
    ? await prisma.formularyDrug.findMany({
        where: {
          planId: effectivePlanId,
          uploadLogId: mostRecentUpload.id,
        },
        orderBy: [
          { tier: 'asc' },
          { requiresPA: 'asc' },
        ],
      })
    : [];

  // Comprehensive contraindication checking with reasons
  const checkContraindications = (drugs: any[], contraindications: any[]) => {
    if (contraindications.length === 0) {
      return { safe: drugs, contraindicated: [] };
    }

    const safe: any[] = [];
    const contraindicated: any[] = [];

    for (const drug of drugs) {
      const normalizedDrugClass = drug.drugClass?.toUpperCase().replace(/\s+/g, '_') || '';
      const reasons: Array<{ type: string; severity: 'ABSOLUTE' | 'RELATIVE'; reason: string; details?: string }> = [];

      for (const ci of contraindications) {
        const ciType = ci.type;

        // TNF INHIBITORS
        if (normalizedDrugClass.includes('TNF')) {
          if (ciType === 'HEART_FAILURE') {
            reasons.push({
              type: ciType,
              severity: 'ABSOLUTE',
              reason: 'TNF inhibitors can worsen heart failure and increase mortality',
              details: ci.details
            });
          }
          if (ciType === 'MULTIPLE_SCLEROSIS' || ciType === 'DEMYELINATING_DISEASE') {
            reasons.push({
              type: ciType,
              severity: 'ABSOLUTE',
              reason: 'TNF inhibitors can exacerbate demyelinating diseases',
              details: ci.details
            });
          }
          if (ciType === 'LYMPHOMA') {
            reasons.push({
              type: ciType,
              severity: 'RELATIVE',
              reason: 'History of lymphoma - TNF inhibitors may increase recurrence risk. Consider risk/benefit with oncology.',
              details: ci.details
            });
          }
          if (ciType === 'MALIGNANCY') {
            reasons.push({
              type: ciType,
              severity: 'RELATIVE',
              reason: 'Active or recent malignancy - TNF inhibitors may affect tumor surveillance. Discuss with oncology.',
              details: ci.details
            });
          }
          if (ciType === 'HEPATITIS_B') {
            reasons.push({
              type: ciType,
              severity: 'RELATIVE',
              reason: 'Hepatitis B can reactivate with TNF inhibitors. Requires antiviral prophylaxis and monitoring.',
              details: ci.details
            });
          }
          if (ciType === 'ACTIVE_TUBERCULOSIS' || ciType === 'LATENT_TUBERCULOSIS') {
            reasons.push({
              type: ciType,
              severity: ciType === 'ACTIVE_TUBERCULOSIS' ? 'ABSOLUTE' : 'RELATIVE',
              reason: ciType === 'ACTIVE_TUBERCULOSIS'
                ? 'Active TB must be treated before starting any biologic, especially TNF inhibitors.'
                : 'Latent TB requires prophylactic treatment before starting TNF inhibitor.',
              details: ci.details
            });
          }
        }

        // JAK INHIBITORS
        if (normalizedDrugClass.includes('JAK') || normalizedDrugClass.includes('TYK2')) {
          if (ciType === 'THROMBOSIS' || ciType === 'VENOUS_THROMBOEMBOLISM') {
            reasons.push({
              type: ciType,
              severity: 'ABSOLUTE',
              reason: 'JAK inhibitors significantly increase VTE risk. Contraindicated in patients with thrombosis history.',
              details: ci.details
            });
          }
          if (ciType === 'CARDIOVASCULAR_DISEASE') {
            reasons.push({
              type: ciType,
              severity: 'RELATIVE',
              reason: 'JAK inhibitors increase MACE risk. Consider in patients >50 with CV risk factors. Monitor closely.',
              details: ci.details
            });
          }
        }

        // IL-17 INHIBITORS
        if (normalizedDrugClass.includes('IL17') || normalizedDrugClass.includes('IL-17')) {
          if (ciType === 'INFLAMMATORY_BOWEL_DISEASE') {
            reasons.push({
              type: ciType,
              severity: 'RELATIVE',
              reason: 'IL-17 inhibitors can worsen or trigger IBD. Use with caution and GI consultation.',
              details: ci.details
            });
          }
        }

        // ALL BIOLOGICS
        if (ciType === 'ACTIVE_INFECTION') {
          reasons.push({
            type: ciType,
            severity: 'ABSOLUTE',
            reason: 'Active infection must be treated before starting any biologic therapy.',
            details: ci.details
          });
        }
        if (ciType === 'PREGNANCY') {
          reasons.push({
            type: ciType,
            severity: 'RELATIVE',
            reason: 'Pregnancy requires careful risk/benefit assessment. Some biologics are safer than others. Consult maternal-fetal medicine.',
            details: ci.details
          });
        }
      }

      // Categorize
      if (reasons.length === 0) {
        safe.push(drug);
      } else {
        contraindicated.push({ drug, reasons });
      }
    }

    return { safe, contraindicated };
  };

  // Filter drugs by diagnosis indication
  const filterByDiagnosis = (drugs: any[], diagnosis: string) => {
    return drugs.filter(drug => {
      // If no indications specified, include it (for backward compatibility)
      if (!drug.fdaIndications || drug.fdaIndications.length === 0) {
        return true;
      }
      // Check if the diagnosis matches any FDA indication (case-insensitive, partial match)
      // Handle both "PSORIASIS" (enum) and "Psoriasis" (data) formats
      // Also handle abbreviations like "PsA" for Psoriatic Arthritis
      const diagnosisLower = diagnosis.toLowerCase().replace(/_/g, ' ');

      return drug.fdaIndications.some((indication: string) => {
        const indicationLower = indication.toLowerCase().replace(/_/g, ' ');
        // Exact match OR partial match (e.g., "psoriasis" matches "psoriatic arthritis")
        return indicationLower.includes(diagnosisLower) || diagnosisLower.includes(indicationLower);
      });
    });
  };

  // Get safe formulary drugs (filtered for diagnosis AND contraindications)
  // Use fetchedFormularyDrugs from the plan resolution above
  const diagnosisAppropriateDrugs = filterByDiagnosis(
    fetchedFormularyDrugs,
    assessment.diagnosis
  );
  const { safe: safeFormularyDrugs, contraindicated: contraindicatedFormularyDrugs } = checkContraindications(
    diagnosisAppropriateDrugs,
    assessment.patient.contraindications
  );

  const formatCurrency = (amount: any) => {
    if (amount === null || amount === undefined) return 'N/A';
    // Handle Prisma Decimal type
    const numAmount = typeof amount === 'object' && 'toNumber' in amount ? amount.toNumber() : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numAmount);
  };

  const currentBiologic = assessment.patient.currentBiologics[0];
  const quadrantLabel = assessment.recommendations[0]?.quadrant.replace(/_/g, ' ').toUpperCase();

  // Find current drug's tier from formulary
  const currentDrugTier = currentBiologic
    ? fetchedFormularyDrugs.find(
        drug => drug.drugName.toLowerCase() === currentBiologic.drugName.toLowerCase()
      )?.tier
    : undefined;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2">
          Recommendations for {assessment.patient.firstName} {assessment.patient.lastName}
        </h1>
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <span>Plan: {assessment.patient.plan?.planName || assessment.patient.formularyPlanName || 'Unknown'}</span>
          <span>•</span>
          <span>
            Current: {currentBiologic?.drugName || 'None'} {currentBiologic?.dose} {currentBiologic?.frequency}
            {currentBiologic && currentDrugTier && (
              <> • Tier {currentDrugTier}</>
            )}
          </span>
        </div>
      </div>

      {/* Quadrant Status */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="mb-2">Classification</h3>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-primary-100 text-primary-800 font-medium text-sm">
                {quadrantLabel}
              </span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <strong>Stability:</strong>{' '}
                {assessment.recommendations.length > 0 && assessment.recommendations[0]?.isStable ? (
                  <span className="text-green-700">Stable</span>
                ) : assessment.recommendations.length > 0 ? (
                  <span className="text-amber-700">Unstable</span>
                ) : (
                  <span className="text-gray-500">Unknown</span>
                )}{' '}
                (DLQI: {assessment.dlqiScore}, {assessment.monthsStable} months)
              </p>
              <p>
                <strong>Formulary Status:</strong>{' '}
                {assessment.recommendations[0]?.isFormularyOptimal ? (
                  <span className="text-green-700">Optimal</span>
                ) : (
                  <span className="text-amber-700">Suboptimal</span>
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Assessed on</p>
            <p className="text-sm font-medium">
              {new Date(assessment.assessedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-6">
        {assessment.recommendations.map((rec, idx) => {
          const isContraindicated = rec.contraindicated;
          const hasSavings = rec.annualSavings && rec.annualSavings.toNumber() > 0;

          return (
            <div
              key={rec.id}
              className={`card ${
                idx === 0 && !isContraindicated
                  ? 'border-2 border-primary-500 bg-primary-50/30'
                  : isContraindicated
                  ? 'border-2 border-red-300 bg-red-50/30'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">
                    {rec.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3>{rec.drugName}</h3>
                      {idx === 0 && !isContraindicated && (
                        <span className="px-2 py-0.5 rounded text-xs bg-primary-600 text-white font-medium">
                          RECOMMENDED
                        </span>
                      )}
                      {isContraindicated && (
                        <span className="px-2 py-0.5 rounded text-xs bg-red-600 text-white font-medium">
                          CONTRAINDICATED
                        </span>
                      )}
                    </div>
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm font-semibold text-blue-900">
                        Recommended Dosing: {rec.newDose} {rec.newFrequency}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {rec.type.replace(/_/g, ' ')} • Tier {rec.tier || 'N/A'}
                      {rec.requiresPA && ` • Prior Auth Required`}
                    </p>
                  </div>
                </div>
              </div>

              {isContraindicated && rec.contraindicationReason && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{rec.contraindicationReason}</p>
                </div>
              )}

              {/* Cost Savings */}
              {hasSavings && !isContraindicated && (
                <div className="grid md:grid-cols-2 gap-4 mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <div className="flex items-center text-green-800 mb-2">
                      <DollarSign className="w-5 h-5 mr-1" />
                      <h4 className="font-semibold text-sm">Annual Cost Impact</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current:</span>
                        <span className="font-medium">{formatCurrency(rec.currentAnnualCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Recommended:</span>
                        <span className="font-medium">{formatCurrency(rec.recommendedAnnualCost)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-green-300">
                        <span className="text-green-800 font-semibold">Savings:</span>
                        <span className="text-green-800 font-bold">
                          {formatCurrency(rec.annualSavings)} ({rec.savingsPercent?.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center text-green-800 mb-2">
                      <TrendingDown className="w-5 h-5 mr-1" />
                      <h4 className="font-semibold text-sm">Patient Out-of-Pocket</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current (monthly):</span>
                        <span className="font-medium">{formatCurrency(rec.currentMonthlyOOP)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Recommended:</span>
                        <span className="font-medium">{formatCurrency(rec.recommendedMonthlyOOP)}</span>
                      </div>
                      {rec.currentMonthlyOOP && rec.recommendedMonthlyOOP && (
                        <div className="flex justify-between pt-2 border-t border-green-300">
                          <span className="text-green-800 font-semibold">Savings:</span>
                          <span className="text-green-800 font-bold">
                            {formatCurrency(
                              (typeof rec.currentMonthlyOOP === 'object' && 'toNumber' in rec.currentMonthlyOOP
                                ? rec.currentMonthlyOOP.toNumber()
                                : rec.currentMonthlyOOP || 0) -
                              (typeof rec.recommendedMonthlyOOP === 'object' && 'toNumber' in rec.recommendedMonthlyOOP
                                ? rec.recommendedMonthlyOOP.toNumber()
                                : rec.recommendedMonthlyOOP || 0)
                            )}/mo
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Clinical Rationale */}
              <div className="mb-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center">
                  <FileText className="w-4 h-4 mr-1" />
                  Clinical Rationale
                </h4>
                <p className="text-sm text-gray-700">{rec.rationale}</p>
              </div>

              {/* Monitoring Plan */}
              {rec.monitoringPlan && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-sm mb-1 text-blue-900">Monitoring Plan</h4>
                  <p className="text-sm text-blue-800">{rec.monitoringPlan}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {assessment.recommendations.length === 0 && (
        <div className="card text-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-gray-600 mb-2">No Recommendations Available</h3>
          <p className="text-sm text-gray-500">
            Unable to generate recommendations based on current data.
          </p>
        </div>
      )}

      {/* Complete Formulary Reference */}
      {safeFormularyDrugs.length > 0 && (
        <div className="mt-8">
          <div className="card">
            <h2 className="mb-4">Complete Formulary Reference</h2>
            <p className="text-sm text-gray-600 mb-4">
              All appropriate biologic options for {assessment.diagnosis.replace(/_/g, ' ').toLowerCase()} (excluding contraindicated drugs)
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Drug Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Formulation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Strength
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      NDC
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tier
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prior Auth
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Restrictions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity Limit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {safeFormularyDrugs.map((drug, idx) => (
                    <tr key={idx} className={
                      drug.tier === 1 ? 'bg-green-50' :
                      drug.tier === 2 ? 'bg-yellow-50' :
                      drug.tier === 5 ? 'bg-red-100' : ''
                    }>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{drug.drugName}</div>
                        <div className="text-xs text-gray-500">{drug.genericName}</div>
                        <div className="text-xs text-gray-500 mt-1">{drug.drugClass}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {drug.formulation || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {drug.strength || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-600">
                        {drug.ndcCode || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          drug.tier === 1 ? 'bg-green-100 text-green-800' :
                          drug.tier === 2 ? 'bg-yellow-100 text-yellow-800' :
                          drug.tier === 3 ? 'bg-orange-100 text-orange-800' :
                          drug.tier === 4 ? 'bg-red-100 text-red-800' :
                          drug.tier === 5 ? 'bg-gray-100 text-gray-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          Tier {drug.tier}{drug.tier === 5 ? ' (Not Covered)' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {drug.requiresPA === 'Yes' ? (
                          <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-medium">
                            Yes
                          </span>
                        ) : drug.requiresPA === 'No' ? (
                          <span className="text-gray-500 text-xs">No</span>
                        ) : (
                          <span className="text-gray-400 text-xs">{drug.requiresPA || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {drug.restrictions || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {drug.quantityLimit || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Contraindicated Drugs Toggle */}
      <ContraindicatedDrugsToggle
        contraindicatedDrugs={contraindicatedFormularyDrugs}
        diagnosis={assessment.diagnosis}
      />
    </div>
  );
}
