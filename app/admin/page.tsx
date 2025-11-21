'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Database, Users, BookOpen, FolderOpen, X } from 'lucide-react';
import Link from 'next/link';

type UploadType = 'formulary' | 'claims' | 'eligibility' | 'knowledge';

interface UploadResult {
  success: boolean;
  rowsProcessed?: number;
  rowsFailed?: number;
  errors?: Array<{ row: number, error: string }>;
  message?: string;
}

interface InsurancePlan {
  id: string;
  planName: string;
  payerName: string;
}

export default function AdminPage() {
  const [uploading, setUploading] = useState<UploadType | null>(null);
  const [results, setResults] = useState<Record<string, UploadResult>>({});
  const [showModal, setShowModal] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ type: UploadType, files: FileList } | null>(null);
  const [datasetLabel, setDatasetLabel] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [insurancePlans, setInsurancePlans] = useState<InsurancePlan[]>([]);
  const [creatingNewPlan, setCreatingNewPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPayerName, setNewPayerName] = useState('');
  const [submittingModal, setSubmittingModal] = useState(false);

  useEffect(() => {
    loadInsurancePlans();
  }, []);

  const loadInsurancePlans = async () => {
    try {
      const res = await fetch('/api/insurance-plans');
      const data = await res.json();
      setInsurancePlans(data);
    } catch (error) {
      console.error('Error loading insurance plans:', error);
    }
  };

  const handleFileSelected = (type: UploadType, files: FileList) => {
    if (type === 'formulary' || type === 'claims') {
      // Show modal for dataset labeling
      setPendingUpload({ type, files });
      setDatasetLabel('');
      setSelectedPlanId('');
      setCreatingNewPlan(false);
      setShowModal(true);
    } else {
      // No labeling needed for eligibility and knowledge
      handleUpload(type, files, null, null);
    }
  };

  const handleModalSubmit = async () => {
    if (!pendingUpload) return;

    setSubmittingModal(true);
    let planId = selectedPlanId;

    // Create new plan if needed
    if (creatingNewPlan && newPlanName && newPayerName) {
      try {
        const res = await fetch('/api/insurance-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planName: newPlanName,
            payerName: newPayerName,
          }),
        });
        const newPlan = await res.json();
        planId = newPlan.id;
        await loadInsurancePlans();
      } catch (error) {
        alert('Failed to create new insurance plan');
        setSubmittingModal(false);
        return;
      }
    }

    setShowModal(false);
    setSubmittingModal(false);
    handleUpload(pendingUpload.type, pendingUpload.files, datasetLabel, planId);
    setPendingUpload(null);
  };

  const handleUpload = async (type: UploadType, files: FileList, label: string | null, planId: string | null) => {
    setUploading(type);

    // For knowledge base, support multiple files
    if (type === 'knowledge' && files.length > 1) {
      const results: UploadResult[] = [];
      let totalProcessed = 0;
      let totalFailed = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          const result = await res.json();
          results.push(result);
          if (result.success) {
            totalProcessed += result.rowsProcessed || 0;
          } else {
            totalFailed++;
          }
        } catch (error: any) {
          totalFailed++;
          results.push({ success: false, message: `${file.name}: ${error.message}` });
        }
      }

      setResults(prev => ({
        ...prev,
        [type]: {
          success: totalFailed < files.length,
          rowsProcessed: totalProcessed,
          rowsFailed: totalFailed,
          message: `Uploaded ${totalProcessed} files (${totalFailed} failed)`
        }
      }));
    } else {
      // Single file upload
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      if (label) formData.append('datasetLabel', label);
      if (planId) formData.append('planId', planId);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await res.json();
        setResults(prev => ({ ...prev, [type]: result }));
      } catch (error: any) {
        setResults(prev => ({
          ...prev,
          [type]: { success: false, message: error.message }
        }));
      }
    }

    setUploading(null);
  };

  const getDatasetLabelGuidance = (type: UploadType) => {
    if (type === 'formulary') {
      return 'e.g., "Aetna December 2024 Formulary" (Insurance Plan + Month + Year)';
    } else if (type === 'claims') {
      return 'e.g., "Molina Q1 2024 claims" (Insurance + Quarter + Year)';
    }
    return '';
  };

  const UploadCard = ({
    type,
    title,
    description,
    icon: Icon,
    acceptedFormats,
  }: {
    type: UploadType;
    title: string;
    description: string;
    icon: any;
    acceptedFormats: string;
  }) => {
    const result = results[type];
    const isUploading = uploading === type;

    return (
      <div className="card">
        <div className="flex items-start mb-4">
          <Icon className="w-10 h-10 text-primary-600 mr-4" />
          <div className="flex-1">
            <h3 className="mb-1">{title}</h3>
            <p className="text-sm text-gray-600 mb-3">{description}</p>
            <p className="text-xs text-gray-500 mb-4">Accepted: {acceptedFormats}</p>

            <label className={`btn btn-primary cursor-pointer inline-flex items-center ${isUploading ? 'cursor-wait' : ''}`}>
              {isUploading ? (
                <>
                  <svg className="spinner w-4 h-4 inline mr-2" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 inline mr-2" />
                  Choose File
                </>
              )}
              <input
                type="file"
                className="hidden"
                accept={acceptedFormats}
                multiple={type === 'knowledge'}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) handleFileSelected(type, files);
                }}
                disabled={isUploading}
              />
            </label>

            {result && (
              <div className={`mt-4 p-3 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-start">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    {result.success ? (
                      <>
                        <p className="text-sm font-medium text-green-900">Upload successful</p>
                        {result.rowsProcessed !== undefined && (
                          <p className="text-xs text-green-700 mt-1">
                            Processed: {result.rowsProcessed} rows
                            {result.rowsFailed ? ` (${result.rowsFailed} failed)` : ''}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-red-900">Upload failed</p>
                        <p className="text-xs text-red-700 mt-1">{result.message}</p>
                      </>
                    )}
                    {result.errors && result.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-700 cursor-pointer">
                          View errors ({result.errors.length})
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs text-red-600 max-h-40 overflow-y-auto">
                          {result.errors.slice(0, 10).map((err, i) => (
                            <li key={i}>Row {err.row}: {err.error}</li>
                          ))}
                          {result.errors.length > 10 && (
                            <li className="italic">...and {result.errors.length - 10} more</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-2">Data Upload</h1>
          <p className="text-gray-600">
            Upload CSV files for formulary data, pharmacy claims, and patient eligibility
          </p>
        </div>
        <Link
          href="/admin/data"
          className="btn btn-secondary inline-flex items-center"
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          Manage Data
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <UploadCard
          type="formulary"
          title="Formulary Data"
          description="Upload drug formulary with tiers, costs, and PA requirements"
          icon={FileSpreadsheet}
          acceptedFormats=".csv"
        />

        <UploadCard
          type="claims"
          title="Pharmacy Claims"
          description="Upload historical pharmacy claims data"
          icon={Database}
          acceptedFormats=".csv"
        />

        <UploadCard
          type="eligibility"
          title="Patient Eligibility"
          description="Upload patient demographics and plan enrollment"
          icon={Users}
          acceptedFormats=".csv"
        />

        <UploadCard
          type="knowledge"
          title="Knowledge Base"
          description="Upload clinical guidelines and evidence documents (supports multiple files)"
          icon={BookOpen}
          acceptedFormats=".pdf,.md,.txt"
        />
      </div>

      <div className="mt-8 card">
        <h3 className="mb-4">Expected CSV Formats</h3>
        <div className="space-y-6 text-sm">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Formulary CSV</h4>
            <p className="text-xs text-gray-600 mb-2">Required columns: Drug Name, Drug Class, Tier (1-5)</p>
            <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto mb-2">
              Drug Name, Generic Name, Drug Class, Tier, Requires PA, FDA Indications, Biosimilar Of
            </code>
            <p className="text-xs text-gray-500">
              Optional: Formulation, Strength, Step Therapy, Restrictions, Quantity Limit, NDC Code
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Claims CSV</h4>
            <p className="text-xs text-gray-600 mb-2">Required columns: Patient ID, Drug Name, Fill Date, Days Supply, Quantity</p>
            <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto mb-2">
              Patient ID, Drug Name, Fill Date, Days Supply, Quantity, Out of Pocket, Plan Paid
            </code>
            <p className="text-xs text-gray-500">
              Optional: NDC Code, True Drug Cost
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Eligibility CSV</h4>
            <p className="text-xs text-gray-600 mb-2">Required columns: First Name, Last Name, Date of Birth</p>
            <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto mb-2">
              Patient ID, First Name, Last Name, Date of Birth, Formulary Plan, Employer, City, State
            </code>
            <p className="text-xs text-gray-500">
              Optional: Street Address, Email, Phone, Eligibility Start/End Date, Cost Designation
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Column names are flexible. The system recognizes common variations
              (e.g., "Drug Name", "DrugName", "drug_name" all work). See parser documentation for full list.
            </p>
          </div>
        </div>
      </div>

      {/* Dataset Labeling Modal */}
      {showModal && pendingUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold">Label Your Dataset</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Please provide a label for this dataset to help you manage multiple uploads.
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">Dataset Label *</label>
                <input
                  type="text"
                  className="input w-full"
                  value={datasetLabel}
                  onChange={(e) => setDatasetLabel(e.target.value)}
                  placeholder={getDatasetLabelGuidance(pendingUpload.type)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {getDatasetLabelGuidance(pendingUpload.type)}
                </p>
              </div>

              {pendingUpload.type === 'formulary' && (
                <div>
                  <label className="label">Insurance Plan *</label>
                  {!creatingNewPlan ? (
                    <>
                      <select
                        className="input w-full"
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        required
                      >
                        <option value="">Select a plan</option>
                        {insurancePlans.map(plan => (
                          <option key={plan.id} value={plan.id}>
                            {plan.planName} ({plan.payerName})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setCreatingNewPlan(true)}
                        className="text-sm text-primary-600 hover:text-primary-700 mt-2"
                      >
                        + Create New Plan
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        className="input w-full"
                        value={newPlanName}
                        onChange={(e) => setNewPlanName(e.target.value)}
                        placeholder="Plan Name (e.g., Aetna)"
                        required
                      />
                      <input
                        type="text"
                        className="input w-full"
                        value={newPayerName}
                        onChange={(e) => setNewPayerName(e.target.value)}
                        placeholder="Payer Name (e.g., Aetna Inc.)"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setCreatingNewPlan(false)}
                        className="text-sm text-gray-600 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={submittingModal}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalSubmit}
                disabled={submittingModal || !datasetLabel || (pendingUpload.type === 'formulary' && !selectedPlanId && !creatingNewPlan)}
                className="btn btn-primary flex-1 disabled:cursor-wait inline-flex items-center justify-center"
              >
                {submittingModal ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Upload'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
