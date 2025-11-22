'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react';

interface ContraindicationReason {
  type: string;
  severity: 'ABSOLUTE' | 'RELATIVE';
  reason: string;
  details?: string;
}

interface ContraindicatedDrug {
  drug: any;
  reasons: ContraindicationReason[];
}

interface Props {
  contraindicatedDrugs: ContraindicatedDrug[];
  diagnosis: string;
}

export default function ContraindicatedDrugsToggle({ contraindicatedDrugs, diagnosis }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (contraindicatedDrugs.length === 0) {
    return null;
  }

  const absoluteCount = contraindicatedDrugs.filter(cd =>
    cd.reasons.some(r => r.severity === 'ABSOLUTE')
  ).length;
  const relativeCount = contraindicatedDrugs.length - absoluteCount;

  return (
    <div className="mt-8">
      <div className="card border-2 border-amber-300">
        {/* Toggle Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between hover:bg-amber-50 transition-colors rounded-lg p-4 -m-4"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div className="text-left">
              <h2 className="mb-1">Contraindicated Options</h2>
              <p className="text-sm text-gray-600">
                {contraindicatedDrugs.length} drug{contraindicatedDrugs.length !== 1 ? 's' : ''} filtered due to patient contraindications
                {absoluteCount > 0 && relativeCount > 0 && (
                  <> ({absoluteCount} absolute, {relativeCount} relative)</>
                )}
              </p>
            </div>
          </div>
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {/* Expandable Content */}
        {isOpen && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-semibold mb-1">Clinical Note</p>
                  <p>
                    These medications are typically contraindicated based on patient history, but some contraindications
                    are <strong>relative</strong> and may be surmountable with appropriate treatment or monitoring.
                    Review carefully with the patient&apos;s full clinical context.
                  </p>
                </div>
              </div>
            </div>

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
                      Tier
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prior Auth
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contraindication Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contraindicatedDrugs.map((cd, idx) => {
                    const hasAbsolute = cd.reasons.some(r => r.severity === 'ABSOLUTE');
                    return (
                      <tr key={idx} className={hasAbsolute ? 'bg-red-50' : 'bg-yellow-50'}>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">{cd.drug.drugName}</div>
                          <div className="text-xs text-gray-500">{cd.drug.genericName}</div>
                          <div className="text-xs text-gray-500 mt-1">{cd.drug.drugClass}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <div>{cd.drug.formulation || '-'}</div>
                          <div className="text-xs text-gray-500">{cd.drug.strength || ''}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            cd.drug.tier === 1 ? 'bg-green-100 text-green-800' :
                            cd.drug.tier === 2 ? 'bg-yellow-100 text-yellow-800' :
                            cd.drug.tier === 3 ? 'bg-orange-100 text-orange-800' :
                            cd.drug.tier === 4 ? 'bg-red-100 text-red-800' :
                            cd.drug.tier === 5 ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            Tier {cd.drug.tier}{cd.drug.tier === 5 ? ' (Not Covered)' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {cd.drug.requiresPA === 'Yes' ? (
                            <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-medium">
                              Yes
                            </span>
                          ) : cd.drug.requiresPA === 'No' ? (
                            <span className="text-gray-500 text-xs">No</span>
                          ) : (
                            <span className="text-gray-400 text-xs">{cd.drug.requiresPA || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            {cd.reasons.map((reason, rIdx) => (
                              <div key={rIdx} className="text-sm">
                                <div className="flex items-start gap-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0 ${
                                    reason.severity === 'ABSOLUTE'
                                      ? 'bg-red-600 text-white'
                                      : 'bg-yellow-500 text-white'
                                  }`}>
                                    {reason.severity}
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-gray-900 font-medium">
                                      {reason.type.replace(/_/g, ' ')}
                                    </p>
                                    <p className="text-gray-700 mt-1">{reason.reason}</p>
                                    {reason.details && (
                                      <p className="text-gray-600 text-xs mt-1 italic">
                                        Patient history: {reason.details}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
