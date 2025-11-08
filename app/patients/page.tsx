import { prisma } from '@/lib/db';
import Link from 'next/link';
import { ChevronRight, User } from 'lucide-react';

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
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Plan</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Current Biologic</th>
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
                      {patient.externalId || '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.plan.planName}
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
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {lastAssessment ? (
                        new Date(lastAssessment.assessedAt).toLocaleDateString()
                      ) : (
                        <span className="text-gray-400">No assessments</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/assess?patientId=${patient.id}`}
                        className="text-primary-600 hover:text-primary-700 inline-flex items-center text-sm font-medium"
                      >
                        New Assessment
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
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
