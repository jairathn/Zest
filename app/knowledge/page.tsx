'use client';

import { useState, useEffect } from 'react';
import { Upload, Trash2, CheckCircle, AlertCircle, FileText } from 'lucide-react';

interface KnowledgeStats {
  oldChunks: number;
  newFindings: number;
  reviewedFindings: number;
}

interface Finding {
  id: string;
  paperTitle: string;
  finding: string;
  citation: string;
  drug: string | null;
  indication: string | null;
  reviewed: boolean;
}

export default function KnowledgePage() {
  const [stats, setStats] = useState<KnowledgeStats>({ oldChunks: 0, newFindings: 0, reviewedFindings: 0 });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, findingsRes] = await Promise.all([
        fetch('/api/knowledge/stats'),
        fetch('/api/knowledge/findings?limit=20')
      ]);

      const statsData = await statsRes.json();
      const findingsData = await findingsRes.json();

      setStats(statsData);
      setFindings(findingsData.findings || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOldChunks = async () => {
    if (!confirm(`Are you sure you want to delete ${stats.oldChunks} old knowledge chunks? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/knowledge/delete-all', { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        alert(`✅ Deleted ${data.deletedCount} old chunks`);
        loadData();
      } else {
        alert('Error deleting chunks: ' + data.error);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error deleting chunks');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        alert(`✅ Extracted ${data.totalFindings} findings from ${data.filesProcessed} papers!\n\n⚠️ Review findings before using in production.`);
        loadData();
      } else {
        alert('Error uploading: ' + data.error);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error uploading files');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleReviewFinding = async (findingId: string, reviewed: boolean) => {
    try {
      const res = await fetch(`/api/knowledge/findings/${findingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed }),
      });

      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error('Error updating finding:', error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="mb-2">Knowledge Base Management</h1>
      <p className="text-gray-600 mb-8">
        Upload research papers to extract structured clinical findings for dose reduction recommendations
      </p>

      {/* Statistics */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Old Chunks (RAG)</h3>
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.oldChunks}</p>
          <p className="text-xs text-gray-500 mt-1">Legacy chunked documents</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">New Findings</h3>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.newFindings}</p>
          <p className="text-xs text-gray-500 mt-1">Structured findings extracted</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Reviewed</h3>
            <CheckCircle className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.reviewedFindings}</p>
          <p className="text-xs text-gray-500 mt-1">Human-verified findings</p>
        </div>
      </div>

      {/* Actions */}
      <div className="card mb-8">
        <h2 className="mb-4">Actions</h2>

        <div className="space-y-4">
          {/* Delete old chunks */}
          {stats.oldChunks > 0 && (
            <div className="flex items-start justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Delete Old Knowledge Chunks</h3>
                <p className="text-sm text-red-700">
                  Remove {stats.oldChunks} legacy RAG chunks to start fresh with structured findings.
                  This cannot be undone.
                </p>
              </div>
              <button
                onClick={handleDeleteOldChunks}
                disabled={deleting}
                className="btn btn-secondary flex items-center ml-4 bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          )}

          {/* Upload papers */}
          <div className="flex items-start justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">Upload Research Papers</h3>
              <p className="text-sm text-blue-700 mb-2">
                Upload PDF research papers. GPT-4 will automatically extract clinical findings as structured, physician-ready sentences.
              </p>
              <p className="text-xs text-blue-600">
                Supported: PDF files • Processing time: ~30 seconds per paper
              </p>
            </div>
            <label className="btn btn-primary flex items-center ml-4 cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload PDFs'}
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Recent Findings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2>Recent Findings</h2>
          <span className="text-sm text-gray-500">Showing {findings.length} most recent</span>
        </div>

        {findings.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-gray-600 mb-2">No Findings Yet</h3>
            <p className="text-sm text-gray-500">
              Upload research papers to extract clinical findings
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className={`p-4 border rounded-lg ${
                  finding.reviewed ? 'border-green-200 bg-green-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{finding.paperTitle}</h4>
                    <p className="text-sm text-gray-600 mb-2">{finding.citation}</p>
                  </div>
                  <button
                    onClick={() => handleReviewFinding(finding.id, !finding.reviewed)}
                    className={`ml-4 px-3 py-1 rounded text-sm font-medium ${
                      finding.reviewed
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {finding.reviewed ? '✓ Reviewed' : 'Mark Reviewed'}
                  </button>
                </div>

                <p className="text-sm text-gray-700 mb-3">{finding.finding}</p>

                <div className="flex gap-2 text-xs">
                  {finding.drug && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                      {finding.drug}
                    </span>
                  )}
                  {finding.indication && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                      {finding.indication}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
