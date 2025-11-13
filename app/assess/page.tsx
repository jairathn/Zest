'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import BiologicInput from '@/components/BiologicInput';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  externalId: string | null;
}

export default function AssessmentPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First, create/update current biologic (skip if not on biologic)
      if (!formData.notOnBiologic && formData.currentBiologic) {
        await fetch('/api/patients/' + formData.patientId + '/biologic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drugName: formData.currentBiologic,
            dose: formData.dose,
            frequency: formData.frequency,
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
          <select
            className="input w-full"
            value={formData.patientId}
            onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
            required
          >
            <option value="">Select a patient</option>
            {Array.isArray(patients) && patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName} {p.externalId ? `(${p.externalId})` : ''}
              </option>
            ))}
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
            <BiologicInput
              value={{
                drugName: formData.currentBiologic,
                dose: formData.dose,
                frequency: formData.frequency,
              }}
              onChange={(value) => setFormData({
                ...formData,
                currentBiologic: value.drugName,
                dose: value.dose,
                frequency: value.frequency,
              })}
              required={!formData.notOnBiologic}
            />
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
    </div>
  );
}
