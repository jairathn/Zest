'use client';

import { useState, useEffect } from 'react';
import { Trash2, FileText, Database, Users, BookOpen, Calendar, AlertCircle, CheckCircle, Eye, Building2 } from 'lucide-react';

type DataTab = 'knowledge' | 'formulary' | 'claims' | 'uploads' | 'plans';

interface KnowledgeDoc {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: Date;
  chunkCount: number;
}

interface FormularyDataset {
  id: string;
  datasetLabel: string;
  planName: string;
  payerName: string;
  drugCount: number;
  uploadedAt: Date;
  fileName: string;
}

interface ClaimDataset {
  id: string;
  datasetLabel: string;
  claimCount: number;
  uploadedAt: Date;
  fileName: string;
}

interface UploadLog {
  id: string;
  uploadType: string;
  fileName: string;
  uploadedAt: Date;
  rowsProcessed: number;
  rowsFailed: number;
}

interface InsurancePlan {
  id: string;
  planName: string;
  payerName: string;
  _count: {
    formularyDrugs: number;
  };
}

export default function DataManagementPage() {
  const [activeTab, setActiveTab] = useState<DataTab>('knowledge');
  const [knowledge, setKnowledge] = useState<KnowledgeDoc[]>([]);
  const [formulary, setFormulary] = useState<FormularyDataset[]>([]);
  const [claims, setClaims] = useState<ClaimDataset[]>([]);
  const [uploads, setUploads] = useState<UploadLog[]>([]);
  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      let res, data;

      if (activeTab === 'plans') {
        res = await fetch('/api/insurance-plans');
        data = await res.json();
        setPlans(data);
      } else {
        res = await fetch(`/api/admin/data?type=${activeTab}`);
        data = await res.json();

        switch (activeTab) {
          case 'knowledge':
            setKnowledge(data);
            break;
          case 'formulary':
            setFormulary(data);
            break;
          case 'claims':
            setClaims(data);
            break;
          case 'uploads':
            setUploads(data);
            break;
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, type: DataTab, forceDelete = false) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    setDeleting(id);
    try {
      let res;

      if (type === 'plans') {
        const url = forceDelete
          ? `/api/insurance-plans?id=${id}&force=true`
          : `/api/insurance-plans?id=${id}`;
        res = await fetch(url, {
          method: 'DELETE',
        });
      } else {
        res = await fetch(`/api/admin/data?type=${type}&id=${id}`, {
          method: 'DELETE',
        });
      }

      if (res.ok) {
        setMessage({ type: 'success', text: 'Item deleted successfully' });
        loadData();
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Failed to delete item' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete item' });
    } finally {
      setDeleting(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleForceDelete = async (id: string, planName: string, drugCount: number) => {
    const confirmed = confirm(
      `⚠️ WARNING: Force Delete\n\n` +
      `This will permanently delete "${planName}" and ALL ${drugCount} associated formulary drugs.\n\n` +
      `This is useful for cleaning up orphaned data that doesn't appear in the Formulary tab.\n\n` +
      `Are you sure you want to continue?`
    );

    if (confirmed) {
      handleDelete(id, 'plans', true);
    }
  };

  const handleView = (id: string, type: 'formulary' | 'claims') => {
    // Open CSV download in new window
    const url = `/api/admin/data?type=${type}&action=view&id=${id}`;
    window.open(url, '_blank');
  };

  const tabs = [
    { id: 'knowledge' as DataTab, label: 'Knowledge Base', icon: BookOpen, count: knowledge.length },
    { id: 'formulary' as DataTab, label: 'Formulary', icon: Database, count: formulary.length },
    { id: 'claims' as DataTab, label: 'Claims', icon: FileText, count: claims.length },
    { id: 'plans' as DataTab, label: 'Insurance Plans', icon: Building2, count: plans.length },
    { id: 'uploads' as DataTab, label: 'Upload History', icon: Calendar, count: uploads.length },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="mb-2">Data Management</h1>
        <p className="text-gray-600">
          View, manage, and delete uploaded data
        </p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-2" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm inline-flex items-center
                  ${activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-5 h-5 mr-2" />
                {tab.label}
                <span className="ml-2 py-0.5 px-2 rounded-full bg-gray-100 text-gray-600 text-xs">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="card">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-500">Loading...</p>
          </div>
        ) : (
          <>
            {/* Knowledge Base Table */}
            {activeTab === 'knowledge' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Chunks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {knowledge.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {doc.fileName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {doc.fileType.toUpperCase()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {doc.chunkCount} chunks
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(doc.uploadedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDelete(doc.id, 'knowledge')}
                            disabled={deleting === doc.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 transition-all duration-150 hover:scale-110 active:scale-95"
                          >
                            {deleting === doc.id ? (
                              <svg className="spinner w-4 h-4 inline" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <Trash2 className="w-4 h-4 inline" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {knowledge.length === 0 && (
                  <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No knowledge base documents uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Formulary Datasets Table */}
            {activeTab === 'formulary' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dataset Label
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Insurance Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Drugs
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {formulary.map((dataset) => (
                      <tr key={dataset.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {dataset.datasetLabel}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {dataset.planName}
                          {dataset.payerName && <span className="text-xs text-gray-400"> ({dataset.payerName})</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {dataset.drugCount} drugs
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(dataset.uploadedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleView(dataset.id, 'formulary')}
                            className="text-primary-600 hover:text-primary-900 mr-3 transition-all duration-150 hover:scale-110 active:scale-95"
                            title="View/Download dataset as CSV"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                          <button
                            onClick={() => handleDelete(dataset.id, 'formulary')}
                            disabled={deleting === dataset.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 transition-all duration-150 hover:scale-110 active:scale-95"
                            title="Delete entire dataset"
                          >
                            {deleting === dataset.id ? (
                              <svg className="spinner w-4 h-4 inline" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <Trash2 className="w-4 h-4 inline" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {formulary.length === 0 && (
                  <div className="text-center py-12">
                    <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No formulary datasets uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Claims Datasets Table */}
            {activeTab === 'claims' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dataset Label
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Claims
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {claims.map((dataset) => (
                      <tr key={dataset.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {dataset.datasetLabel}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {dataset.claimCount} claims
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(dataset.uploadedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleView(dataset.id, 'claims')}
                            className="text-primary-600 hover:text-primary-900 mr-3 transition-all duration-150 hover:scale-110 active:scale-95"
                            title="View/Download dataset as CSV"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                          <button
                            onClick={() => handleDelete(dataset.id, 'claims')}
                            disabled={deleting === dataset.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 transition-all duration-150 hover:scale-110 active:scale-95"
                            title="Delete entire dataset"
                          >
                            {deleting === dataset.id ? (
                              <svg className="spinner w-4 h-4 inline" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <Trash2 className="w-4 h-4 inline" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {claims.length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No claims datasets uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Upload History Table */}
            {activeTab === 'uploads' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rows Processed
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rows Failed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {uploads.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {log.uploadType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.fileName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.uploadedAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.rowsProcessed}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {log.rowsFailed > 0 ? (
                            <span className="text-red-600">{log.rowsFailed}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {uploads.length === 0 && (
                  <div className="text-center py-12">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No upload history</p>
                  </div>
                )}
              </div>
            )}

            {/* Insurance Plans Table */}
            {activeTab === 'plans' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Formulary Drugs
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {plans.map((plan) => (
                      <tr key={plan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {plan.planName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.payerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan._count.formularyDrugs > 0 ? (
                            <span className="text-gray-900">{plan._count.formularyDrugs} drugs</span>
                          ) : (
                            <span className="text-gray-400">Empty</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {plan._count.formularyDrugs > 0 ? (
                            <button
                              onClick={() => handleForceDelete(plan.id, plan.planName, plan._count.formularyDrugs)}
                              disabled={deleting === plan.id}
                              className="text-orange-600 hover:text-orange-900 disabled:opacity-50 transition-all duration-150 hover:scale-110 active:scale-95 font-medium"
                              title="Force delete plan and all formulary drugs"
                            >
                              {deleting === plan.id ? (
                                <svg className="spinner w-4 h-4 inline mr-1" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <AlertCircle className="w-4 h-4 inline mr-1" />
                              )}
                              Force Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDelete(plan.id, 'plans')}
                              disabled={deleting === plan.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50 transition-all duration-150 hover:scale-110 active:scale-95"
                              title="Delete insurance plan"
                            >
                              {deleting === plan.id ? (
                                <svg className="spinner w-4 h-4 inline" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <Trash2 className="w-4 h-4 inline" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plans.length === 0 && (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No insurance plans created</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
