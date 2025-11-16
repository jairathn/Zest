'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save } from 'lucide-react';
import Link from 'next/link';
import BiologicInput from '@/components/BiologicInput';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  externalId: string | null;
  pharmacyInsuranceId: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  employer: string | null;
  email: string | null;
  phone: string | null;
  costDesignation: string | null;
  benchmarkCost: number | null;
  currentBiologics: Array<{
    id: string;
    drugName: string;
    dose: string;
    frequency: string;
  }>;
  contraindications: Array<{
    id: string;
    type: string;
  }>;
}

interface PageProps {
  params: { id: string };
}

export default function EditPatientPage({ params }: PageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    externalId: '',
    pharmacyInsuranceId: '',
    streetAddress: '',
    city: '',
    state: '',
    employer: '',
    email: '',
    phone: '',
    currentBiologic: '',
    dose: '',
    frequency: '',
    contraindications: [] as string[],
  });

  useEffect(() => {
    loadPatient();
  }, [params.id]);

  const loadPatient = async () => {
    try {
      const res = await fetch(`/api/patients/${params.id}`);
      const data = await res.json();
      setPatient(data);

      // Populate form
      const biologic = data.currentBiologics[0];
      setFormData({
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth.split('T')[0],
        externalId: data.externalId || '',
        pharmacyInsuranceId: data.pharmacyInsuranceId || '',
        streetAddress: data.streetAddress || '',
        city: data.city || '',
        state: data.state || '',
        employer: data.employer || '',
        email: data.email || '',
        phone: data.phone || '',
        currentBiologic: biologic?.drugName || '',
        dose: biologic?.dose || '',
        frequency: biologic?.frequency || '',
        contraindications: data.contraindications.map((c: any) => c.type),
      });
    } catch (error) {
      console.error('Error loading patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Update patient basic info
      await fetch(`/api/patients/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          dateOfBirth: formData.dateOfBirth,
          externalId: formData.externalId || null,
          pharmacyInsuranceId: formData.pharmacyInsuranceId || null,
          streetAddress: formData.streetAddress || null,
          city: formData.city || null,
          state: formData.state || null,
          employer: formData.employer || null,
          email: formData.email || null,
          phone: formData.phone || null,
        }),
      });

      // Update biologic if provided
      if (formData.currentBiologic) {
        await fetch(`/api/patients/${params.id}/biologic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drugName: formData.currentBiologic,
            dose: formData.dose,
            frequency: formData.frequency,
          }),
        });
      }

      // Update contraindications
      await fetch(`/api/patients/${params.id}/contraindications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contraindications: formData.contraindications,
        }),
      });

      router.push('/patients');
    } catch (error) {
      console.error('Error updating patient:', error);
      alert('Failed to update patient');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-gray-500">Loading patient...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <p className="text-gray-500">Patient not found</p>
          <Link href="/patients" className="btn btn-secondary mt-4">
            Back to Patients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link href="/patients" className="text-primary-600 hover:text-primary-700 inline-flex items-center text-sm mb-4">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Patients
        </Link>
        <h1 className="mb-2">Edit Patient</h1>
        <p className="text-gray-600">
          Update patient demographics and clinical information
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Basic Info */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">First Name *</label>
            <input
              type="text"
              className="input w-full"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input
              type="text"
              className="input w-full"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Date of Birth *</label>
            <input
              type="date"
              className="input w-full"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">External ID</label>
            <input
              type="text"
              className="input w-full"
              value={formData.externalId}
              onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
              placeholder="e.g., MRN or Member ID"
            />
          </div>
        </div>

        <div>
          <label className="label">Pharmacy Insurance ID</label>
          <input
            type="text"
            className="input w-full"
            value={formData.pharmacyInsuranceId}
            onChange={(e) => setFormData({ ...formData, pharmacyInsuranceId: e.target.value })}
            placeholder="e.g., Insurance ID from pharmacy claims"
          />
        </div>

        {/* Contact & Address Information */}
        <div className="pt-4">
          <h3 className="text-lg font-semibold mb-3">Contact & Address</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input w-full"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                className="input w-full"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="label">Street Address</label>
            <input
              type="text"
              className="input w-full"
              value={formData.streetAddress}
              onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
              placeholder="123 Main St"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="label">City</label>
              <input
                type="text"
                className="input w-full"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="San Francisco"
              />
            </div>
            <div>
              <label className="label">State</label>
              <input
                type="text"
                className="input w-full"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="CA"
                maxLength={2}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="label">Employer</label>
            <input
              type="text"
              className="input w-full"
              value={formData.employer}
              onChange={(e) => setFormData({ ...formData, employer: e.target.value })}
              placeholder="Company Name"
            />
          </div>
        </div>

        {/* Current Biologic */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Current Biologic</h3>
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
          />
        </div>

        {/* Contraindications */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Contraindications</h3>
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

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <Link href="/patients" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary flex items-center"
          >
            {saving ? 'Saving...' : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
