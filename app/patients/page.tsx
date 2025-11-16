import { prisma } from '@/lib/db';
import Link from 'next/link';
import { ChevronRight, User, Edit, Trash2 } from 'lucide-react';
import DeletePatientButton from './DeletePatientButton';

export default async function PatientsPage() {
  const patients = await prisma.patient.findMany({
    include: {
      currentBiologics: true,
      plan: true,
      assessments: {
        orderBy: { assessedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ],
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1>Patients</h1>
        <Link href="/assess" className="btn btn-primary">
          New Assessment
        </Link>
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
              {patients.map((patient) => {
                const biologic = patient.currentBiologics[0];
                const lastAssessment = patient.assessments[0];

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
                      {biologic ? (
                        <div>
                          <div className="text-sm font-medium">{biologic.drugName}</div>
                          <div className="text-xs text-gray-500">
                            {biologic.dose} {biologic.frequency}
                          </div>
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

          {patients.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No patients found</p>
              <p className="text-sm text-gray-400">
                Upload patient eligibility data in the admin panel to get started
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
