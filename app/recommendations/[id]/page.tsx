import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { CheckCircle, AlertCircle, TrendingDown, DollarSign, FileText } from 'lucide-react';

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
          plan: true,
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

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const currentBiologic = assessment.patient.currentBiologics[0];
  const quadrantLabel = assessment.recommendations[0]?.quadrant.replace(/_/g, ' ').toUpperCase();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2">
          Recommendations for {assessment.patient.firstName} {assessment.patient.lastName}
        </h1>
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <span>Plan: {assessment.patient.plan.planName}</span>
          <span>•</span>
          <span>Current: {currentBiologic?.drugName || 'None'} {currentBiologic?.dose} {currentBiologic?.frequency}</span>
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
                {assessment.recommendations[0]?.isStable ? (
                  <span className="text-green-700">Stable</span>
                ) : (
                  <span className="text-amber-700">Unstable</span>
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
          const hasSavings = rec.annualSavings && rec.annualSavings > 0;

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
                    <p className="text-sm text-gray-600">
                      {rec.newDose} {rec.newFrequency}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {rec.type.replace(/_/g, ' ')} • Tier {rec.tier || 'N/A'}
                      {rec.requiresPA && ' • PA Required'}
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
                            {formatCurrency((rec.currentMonthlyOOP || 0) - (rec.recommendedMonthlyOOP || 0))}/mo
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

              {/* Evidence */}
              {rec.evidenceSources && rec.evidenceSources.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold text-sm mb-2">Supporting Evidence</h4>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {rec.evidenceSources.map((source, i) => (
                      <li key={i}>{source}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Monitoring Plan */}
              {rec.monitoringPlan && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-sm mb-1 text-blue-900">Monitoring Plan</h4>
                  <p className="text-sm text-blue-800">{rec.monitoringPlan}</p>
                </div>
              )}

              {/* Action Buttons */}
              {!isContraindicated && (
                <div className="mt-4 pt-4 border-t flex gap-3">
                  <form action={`/api/recommendations/${rec.id}/accept`} method="POST">
                    <button type="submit" className="btn btn-primary">
                      <CheckCircle className="w-4 h-4 inline mr-2" />
                      Accept Recommendation
                    </button>
                  </form>
                  <button className="btn btn-secondary">
                    Modify
                  </button>
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
    </div>
  );
}
