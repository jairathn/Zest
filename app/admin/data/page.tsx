'use client';

import { useState, useEffect } from 'react';
import { Trash2, FileText, Database, Users, BookOpen, Calendar, AlertCircle, CheckCircle } from 'lucide-react';

type DataTab = 'knowledge' | 'formulary' | 'claims' | 'uploads';

interface KnowledgeDoc {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: Date;
  chunkCount: number;
}

interface FormularyDrug {
  id: string;
  drugName: string;
  genericName: string;
  tier: number;
  drugClass: string;
  annualCostWAC: number;
  requiresPA: boolean;
}

interface Claim {
  id: string;
  patientId: string;
  drugName: string;
  fillDate: Date;
  daysSupply: number;
  outOfPocket: number;
}

interface UploadLog {
  id: string;
  uploadType: string;
  fileName: string;
  uploadedAt: Date;
  rowsProcessed: number;
  rowsFailed: number;
}

export default function DataManagementPage() {
  const [activeTab, setActiveTab] = useState<DataTab>('knowledge');
  const [knowledge, setKnowledge] = useState<KnowledgeDoc[]>([]);
  const [formulary, setFormulary] = useState<FormularyDrug[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [uploads, setUploads] = useState<UploadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/data?type=${activeTab}`);
      const data = await res.json();

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
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, type: DataTab) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/data?type=${type}&id=${id}`, {
        method: 'DELETE',
      });

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

  const tabs = [
    { id: 'knowledge' as DataTab, label: 'Knowledge Base', icon: BookOpen, count: knowledge.length },
    { id: 'formulary' as DataTab, label: 'Formulary', icon: Database, count: formulary.length },
    { id: 'claims' as DataTab, label: 'Claims', icon: FileText, count: claims.length },
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
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4 inline" />
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

            {/* Formulary Table */}
            {activeTab === 'formulary' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Drug Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Generic
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tier
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Annual Cost
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {formulary.map((drug) => (
                      <tr key={drug.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {drug.drugName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {drug.genericName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {drug.drugClass.replace(/_/g, ' ')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            drug.tier === 1 ? 'bg-green-100 text-green-800' :
                            drug.tier === 2 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            Tier {drug.tier}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${drug.annualCostWAC?.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDelete(drug.id, 'formulary')}
                            disabled={deleting === drug.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {formulary.length === 0 && (
                  <div className="text-center py-12">
                    <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No formulary data uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Claims Table */}
            {activeTab === 'claims' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Drug Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fill Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Days Supply
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Out of Pocket
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {claims.slice(0, 100).map((claim) => (
                      <tr key={claim.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {claim.drugName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(claim.fillDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {claim.daysSupply} days
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${claim.outOfPocket?.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDelete(claim.id, 'claims')}
                            disabled={deleting === claim.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {claims.length > 100 && (
                  <div className="px-6 py-4 bg-gray-50 text-sm text-gray-500">
                    Showing first 100 of {claims.length} claims
                  </div>
                )}
                {claims.length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No claims data uploaded</p>
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
          </>
        )}
      </div>
    </div>
  );
}
