'use client';

import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Database, Users, BookOpen } from 'lucide-react';

type UploadType = 'formulary' | 'claims' | 'eligibility' | 'knowledge';

interface UploadResult {
  success: boolean;
  rowsProcessed?: number;
  rowsFailed?: number;
  errors?: Array<{ row: number, error: string }>;
  message?: string;
}

export default function AdminPage() {
  const [uploading, setUploading] = useState<UploadType | null>(null);
  const [results, setResults] = useState<Record<string, UploadResult>>({});

  const handleUpload = async (type: UploadType, files: FileList) => {
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
      // Single file upload for CSVs or single knowledge file
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

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

            <label className="btn btn-primary cursor-pointer inline-block">
              {isUploading ? (
                <span>Uploading...</span>
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
                  if (files && files.length > 0) handleUpload(type, files);
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
      <div className="mb-8">
        <h1 className="mb-2">Data Upload</h1>
        <p className="text-gray-600">
          Upload CSV files for formulary data, pharmacy claims, and patient eligibility
        </p>
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
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">Formulary CSV</h4>
            <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto">
              Drug Name, Generic Name, Drug Class, Tier, Annual Cost, Copay T1, Copay T2, Copay T3, PA Required
            </code>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">Claims CSV</h4>
            <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto">
              Patient ID, Drug Name, Fill Date, Days Supply, Quantity, Out of Pocket, Plan Paid
            </code>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">Eligibility CSV</h4>
            <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto">
              Patient ID, First Name, Last Name, Date of Birth, Plan ID
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
