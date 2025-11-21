'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import BiologicInput from '@/components/BiologicInput';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  externalId: string | null;
  costDesignation?: 'HIGH_COST' | 'LOW_COST' | null;
}

export default function AssessmentPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimsBiologic, setClaimsBiologic] = useState<any>(null); // Biologic from claims data
  const [showOverrideWarning, setShowOverrideWarning] = useState(false);
  const [pendingBiologicChange, setPendingBiologicChange] = useState<string | null>(null);
  const [showHighCostOnly, setShowHighCostOnly] = useState(false); // Filter for high cost patients

  const [formData, setFormData] = useState({
    patientId: '',
    notOnBiologic: false,
    currentBiologic: '',
    dose: '',
    frequency: '',
    diagnosis: 'PSORIASIS',
    hasPsoriaticArthritis: false,
    contraindications: [] as string[],
    dlqiScore: 5,
    monthsStable: 6,
    additionalNotes: '',
  });

  useEffect(() => {
    fetch('/api/patients')
      .then(res => res.json())
      .then(data => {
        // Ensure data is an array before setting patients
        if (Array.isArray(data)) {
          setPatients(data);
        } else {
          console.error('Expected array of patients, got:', data);
          setPatients([]);
        }
      })
      .catch(err => {
        console.error('Failed to fetch patients:', err);
        setPatients([]);
      });
  }, []);

  // Auto-fill current biologic from claims data (SOURCE OF TRUTH)
  const handlePatientChange = async (patientId: string) => {
    if (!patientId) {
      setFormData({ ...formData, patientId: '' });
      setClaimsBiologic(null);
      return;
    }

    try {
      // Fetch patient data with claims
      const res = await fetch(`/api/patients/${patientId}`);
      const patientData = await res.json();

      // Get biologic from claims (PRIMARY SOURCE)
      let biologicFromClaims = null;

      if (patientData.claims && patientData.claims.length > 0) {
        // Find most recent claim with NDC code
        const claimWithNdc = patientData.claims.find((claim: any) => claim.ndcCode);

        if (claimWithNdc?.ndcCode) {
          // Fetch drug info from NDC mapping
          const ndcRes = await fetch(`/api/ndc-lookup?ndc=${claimWithNdc.ndcCode}`);
          const drugInfo = await ndcRes.json();

          if (drugInfo && drugInfo.drugName) {
            biologicFromClaims = {
              drugName: drugInfo.drugName,
              dose: drugInfo.strength || 'As prescribed',
              frequency: 'As prescribed', // Can be inferred from claims pattern
              lastFillDate: claimWithNdc.fillDate,
              ndcCode: claimWithNdc.ndcCode,
            };
          }
        }
      }

      // Store claims biologic for override detection
      setClaimsBiologic(biologicFromClaims);

      // Auto-populate form with claims data if available
      if (biologicFromClaims) {
        setFormData(prev => ({
          ...prev,
          patientId,
          currentBiologic: biologicFromClaims.drugName,
          dose: biologicFromClaims.dose,
          frequency: biologicFromClaims.frequency,
        }));
      } else if (patientData.currentBiologics && patientData.currentBiologics.length > 0) {
        // Fall back to manual entry if no claims data
        const currentBio = patientData.currentBiologics[0];
        setFormData(prev => ({
          ...prev,
          patientId,
          currentBiologic: currentBio.drugName,
          dose: currentBio.dose,
          frequency: currentBio.frequency,
        }));
      } else {
        // No biologic data at all
        setFormData(prev => ({
          ...prev,
          patientId,
        }));
      }
    } catch (error) {
      console.error('Error fetching patient data:', error);
      setFormData({ ...formData, patientId });
    }
  };

  // Handle biologic change with override warning
  const handleBiologicChange = (newDrugName: string) => {
    // Check if this differs from claims data
    if (claimsBiologic && newDrugName.toLowerCase().trim() !== claimsBiologic.drugName.toLowerCase().trim()) {
      // Show override warning
      setPendingBiologicChange(newDrugName);
      setShowOverrideWarning(true);
    } else {
      // No conflict, just update
      setFormData(prev => ({ ...prev, currentBiologic: newDrugName }));
    }
  };

  // Confirm override
  const confirmOverride = () => {
    if (pendingBiologicChange !== null) {
      setFormData(prev => ({ ...prev, currentBiologic: pendingBiologicChange }));
    }
    setShowOverrideWarning(false);
    setPendingBiologicChange(null);
  };

  // Cancel override, keep claims data
  const cancelOverride = () => {
    setShowOverrideWarning(false);
    setPendingBiologicChange(null);
    // Revert to claims data
    if (claimsBiologic) {
      setFormData(prev => ({
        ...prev,
        currentBiologic: claimsBiologic.drugName,
        dose: claimsBiologic.dose,
        frequency: claimsBiologic.frequency,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First, create/update current biologic (skip if not on biologic)
      if (!formData.notOnBiologic && formData.currentBiologic) {
        // Determine if this is an override
        const isOverride = claimsBiologic &&
          formData.currentBiologic.toLowerCase().trim() !== claimsBiologic.drugName.toLowerCase().trim();

        await fetch('/api/patients/' + formData.patientId + '/biologic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drugName: formData.currentBiologic,
            dose: formData.dose,
            frequency: formData.frequency,
            // Pass override tracking data
            isManualOverride: isOverride,
            claimsDrugName: claimsBiologic?.drugName || null,
            claimsDose: claimsBiologic?.dose || null,
            claimsFrequency: claimsBiologic?.frequency || null,
          }),
        });
      }

      // Create/update contraindications
      await fetch('/api/patients/' + formData.patientId + '/contraindications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contraindications: formData.contraindications,
        }),
      });

      // Create assessment and generate recommendations
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: formData.patientId,
          diagnosis: formData.diagnosis,
          hasPsoriaticArthritis: formData.hasPsoriaticArthritis,
          dlqiScore: formData.dlqiScore,
          monthsStable: formData.monthsStable,
          additionalNotes: formData.additionalNotes,
        }),
      });

      const data = await res.json();

      if (data.assessmentId) {
        router.push(`/recommendations/${data.assessmentId}`);
      }
    } catch (error) {
      console.error('Error creating assessment:', error);
      alert('Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  const toggleContraindication = (type: string) => {
    setFormData(prev => ({
      ...prev,
      contraindications: prev.contraindications.includes(type)
        ? prev.contraindications.filter(c => c !== type)
        : [...prev.contraindications, type],
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="mb-2">New Patient Assessment</h1>
      <p className="text-gray-600 mb-8">
        Complete this simplified form to generate cost-saving recommendations
      </p>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Patient Selection */}
        <div>
          <label className="label">Patient *</label>

          {/* High Cost Filter Checkbox */}
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showHighCostOnly}
                onChange={(e) => setShowHighCostOnly(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-amber-900">
                Show High Cost Patients Only
              </span>
            </label>
            <p className="text-xs text-amber-700 mt-1 ml-6">
              Only high cost patients are eligible for this optimization service
            </p>
          </div>

          <select
            className="input w-full"
            value={formData.patientId}
            onChange={(e) => handlePatientChange(e.target.value)}
            required
          >
            <option value="">Select a patient</option>
            {Array.isArray(patients) &&
              patients
                .filter(p => !showHighCostOnly || p.costDesignation === 'HIGH_COST')
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} {p.externalId ? `(${p.externalId})` : ''}
                    {p.costDesignation === 'HIGH_COST' ? ' [HIGH COST]' : ''}
                  </option>
                ))
            }
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Auto-fills claims data, health plan, and formulary information
          </p>
        </div>

        {/* Current Biologic */}
        <div>
          <label className="flex items-center mb-3">
            <input
              type="checkbox"
              checked={formData.notOnBiologic}
              onChange={(e) => setFormData({ ...formData, notOnBiologic: e.target.checked, currentBiologic: '', dose: '', frequency: '' })}
              className="mr-2"
            />
            Patient not currently on biologic
          </label>

          {!formData.notOnBiologic && (
            <>
              {claimsBiologic && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Claims data:</strong> {claimsBiologic.drugName} {claimsBiologic.dose} {claimsBiologic.frequency}
                    <br />
                    <span className="text-xs text-blue-600">
                      Last fill: {new Date(claimsBiologic.lastFillDate).toLocaleDateString()}
                    </span>
                  </p>
                </div>
              )}
              <BiologicInput
                value={{
                  drugName: formData.currentBiologic,
                  dose: formData.dose,
                  frequency: formData.frequency,
                }}
                onChange={(value) => {
                  // Check if drug name changed (trigger override warning)
                  if (value.drugName !== formData.currentBiologic) {
                    handleBiologicChange(value.drugName);
                  }
                  // Update dose and frequency without warning
                  setFormData(prev => ({
                    ...prev,
                    dose: value.dose,
                    frequency: value.frequency,
                  }));
                }}
                required={!formData.notOnBiologic}
              />
            </>
          )}
        </div>

        {/* Indication */}
        <div>
          <label className="label">Indication *</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="diagnosis"
                value="PSORIASIS"
                checked={formData.diagnosis === 'PSORIASIS'}
                onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value as any })}
                className="mr-2"
              />
              Psoriasis
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="diagnosis"
                value="ATOPIC_DERMATITIS"
                checked={formData.diagnosis === 'ATOPIC_DERMATITIS'}
                onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value as any })}
                className="mr-2"
              />
              Atopic Dermatitis (Eczema)
            </label>
          </div>
        </div>

        {/* Psoriatic Arthritis */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.hasPsoriaticArthritis}
              onChange={(e) => setFormData({ ...formData, hasPsoriaticArthritis: e.target.checked })}
              className="mr-2"
            />
            Psoriatic Arthritis present
          </label>
        </div>

        {/* Contraindications */}
        <div>
          <label className="label">Contraindications (select all that apply)</label>
          <div className="space-y-2">
            {[
              { value: 'DRUG_ALLERGY', label: 'Drug allergies' },
              { value: 'HEART_FAILURE', label: 'Heart failure' },
              { value: 'MULTIPLE_SCLEROSIS', label: 'Multiple sclerosis' },
              { value: 'INFLAMMATORY_BOWEL_DISEASE', label: 'Inflammatory bowel disease' },
              { value: 'ACTIVE_INFECTION', label: 'Active infection' },
              { value: 'PREGNANCY', label: 'Pregnancy/planning pregnancy' },
            ].map(({ value, label }) => (
              <label key={value} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.contraindications.includes(value)}
                  onChange={() => toggleContraindication(value)}
                  className="mr-2"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* DLQI Score */}
        <div>
          <label className="label">Disease Severity (DLQI) *</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="30"
              value={formData.dlqiScore}
              onChange={(e) => setFormData({ ...formData, dlqiScore: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="font-semibold text-lg w-16 text-center">{formData.dlqiScore}/30</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            0-1: No impact | 2-5: Small impact | 6-10: Moderate impact | 11-20: Large impact | 21-30: Extremely large
          </p>
        </div>

        {/* Time at Stability */}
        <div>
          <label className="label">Time at Current Stability (months) *</label>
          <input
            type="number"
            min="0"
            max="120"
            className="input w-full"
            value={formData.monthsStable}
            onChange={(e) => setFormData({ ...formData, monthsStable: Number(e.target.value) })}
            required
          />
        </div>

        {/* Additional Notes */}
        <div>
          <label className="label">Additional Notes (optional)</label>
          <textarea
            className="input w-full"
            rows={4}
            value={formData.additionalNotes}
            onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
            placeholder="Any additional clinical context..."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="spinner w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating Recommendations...
              </>
            ) : (
              <>
                Generate Recommendations
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Override Warning Dialog */}
      {showOverrideWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Override Claims Data?
            </h3>
            <div className="space-y-3 mb-6">
              <p className="text-sm text-gray-700">
                You're trying to change the biologic to <strong>{pendingBiologicChange}</strong>,
                but claims data shows the patient is currently on <strong>{claimsBiologic?.drugName}</strong>.
              </p>
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-xs text-yellow-800">
                  <strong>Claims data (last fill {claimsBiologic && new Date(claimsBiologic.lastFillDate).toLocaleDateString()}):</strong>
                  <br />
                  {claimsBiologic?.drugName} {claimsBiologic?.dose} {claimsBiologic?.frequency}
                </p>
              </div>
              <p className="text-sm text-gray-600">
                Do you want to override the claims data for this patient?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={cancelOverride}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                No, Keep Claims Data
              </button>
              <button
                onClick={confirmOverride}
                className="flex-1 px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                Yes, Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
