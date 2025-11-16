'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

interface Props {
  patientId: string;
  patientName: string;
}

export default function DeletePatientButton({ patientId, patientName }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${patientName}? This will also delete all assessments and recommendations for this patient.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.refresh();
      } else {
        const error = await res.json();
        alert(`Failed to delete patient: ${error.error}`);
      }
    } catch (error) {
      alert('Failed to delete patient');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-wait inline-flex items-center"
      title={deleting ? "Deleting..." : "Delete patient"}
    >
      {deleting ? (
        <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
      ) : (
        <Trash2 className="w-4 h-4" />
      )}
    </button>
  );
}
