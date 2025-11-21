export const dynamic = 'force-dynamic';

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, User, Edit, Filter } from 'lucide-react';
import DeletePatientButton from './DeletePatientButton';
import { getCurrentBiologicFromClaims } from '@/lib/claims-biologic-service';

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [showHighCostOnly, setShowHighCostOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const res = await fetch('/api/patients?includeDetails=true');
      const data = await res.json();
      setPatients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching patients:', error);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter patients based on cost designation
  const filteredPatients = showHighCostOnly
    ? patients.filter(p => p.costDesignation === 'HIGH_COST')
    : patients;

  const highCostCount = patients.filter(p => p.costDesignation === 'HIGH_COST').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-4">
        <h1>Patients</h1>
        <Link href="/assess" className="btn btn-primary">
          New Assessment
        </Link>
      </div>

      {/* Filter Toggle */}
      <div className="mb-6 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showHighCostOnly}
            onChange={(e) => setShowHighCostOnly(e.target.checked)}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            <Filter className="w-4 h-4 inline mr-1" />
            Show High Cost Patients Only
          </span>
        </label>
        <span className="text-xs text-gray-500">
          ({highCostCount} high cost / {patients.length} total)
        </span>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Patient</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">ID</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Location</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Plan</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Current Biologic</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Cost Tier</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Last Assessment</th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <svg className="spinner w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading patients...
                    </div>
                  </td>
                </tr>
              ) : filteredPatients.map((patient) => {
                // PRIMARY SOURCE: Claims data (most recent fill with NDC)
                const claimsBiologic = getCurrentBiologicFromClaims(patient.claims);

                // SECONDARY SOURCE: Manual entry (if no claims or if override exists)
                const manualBiologic = patient.currentBiologics[0];

                // Display claims data if available, otherwise fall back to manual entry
                const displayBiologic = claimsBiologic || (manualBiologic ? {
                  drugName: manualBiologic.drugName,
                  dose: manualBiologic.dose,
                  frequency: manualBiologic.frequency,
                  isManual: true,
                } : null);

                const lastAssessment = patient.assessments[0];

                // Check if manual entry differs from claims (override indicator)
                const hasOverride = manualBiologic && claimsBiologic &&
                  manualBiologic.drugName.toLowerCase() !== claimsBiologic.drugName.toLowerCase();

                return (
                  <tr key={patient.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center mr-3">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium">
                            {patient.firstName} {patient.lastName}
                          </div>
                          <div className="text-xs text-gray-500">
                            DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.externalId || patient.pharmacyInsuranceId || '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.city && patient.state ? (
                        <div>
                          <div>{patient.city}, {patient.state}</div>
                        </div>
                      ) : patient.state ? (
                        patient.state
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.plan?.planName || patient.formularyPlanName || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {displayBiologic ? (
                        <div>
                          <div className="text-sm font-medium">
                            {displayBiologic.drugName}
                            {hasOverride && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800" title="Manual override of claims data">
                                Override
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {displayBiologic.dose} {displayBiologic.frequency}
                          </div>
                          {claimsBiologic && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              From claims ({new Date(claimsBiologic.lastFillDate).toLocaleDateString()})
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {patient.costDesignation ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          patient.costDesignation === 'HIGH_COST'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {patient.costDesignation === 'HIGH_COST' ? 'High Cost' : 'Low Cost'}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {lastAssessment ? (
                        new Date(lastAssessment.assessedAt).toLocaleDateString()
                      ) : (
                        <span className="text-gray-400">No assessments</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/patients/${patient.id}/edit`}
                          className="text-gray-600 hover:text-gray-900 transition-all duration-150 hover:scale-110 active:scale-95 inline-block"
                          title="Edit patient"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <DeletePatientButton patientId={patient.id} patientName={`${patient.firstName} ${patient.lastName}`} />
                        <Link
                          href={`/assess?patientId=${patient.id}`}
                          className="text-primary-600 hover:text-primary-700 inline-flex items-center text-sm font-medium ml-2 transition-all duration-150 active:scale-95 group"
                        >
                          Assess
                          <ChevronRight className="w-4 h-4 ml-1 transition-transform duration-150 group-hover:translate-x-1" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && filteredPatients.length === 0 && (
            <div className="text-center py-12">
              {patients.length === 0 ? (
                <>
                  <p className="text-gray-500 mb-4">No patients found</p>
                  <p className="text-sm text-gray-400">
                    Upload patient eligibility data in the admin panel to get started
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-500 mb-4">No high cost patients found</p>
                  <p className="text-sm text-gray-400">
                    Try disabling the "Show High Cost Patients Only" filter
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
