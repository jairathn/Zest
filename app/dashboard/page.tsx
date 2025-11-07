'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardPatient {
  id: string;
  firstName: string;
  lastName: string;
  currentMedication: {
    drugName: string;
    dose: string;
    frequency: string;
  } | null;
  insurancePlan: {
    planName: string;
  };
  recommendations: Array<{
    id: string;
    quadrant: string;
    createdAt: string;
    formularyStatus: string;
  }>;
}

async function fetchPatients(query: string, statusFilter: string) {
  const response = await fetch(`/api/patients?page=1&pageSize=50`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load patients');
  }
  const payload = await response.json();
  const patients: DashboardPatient[] = payload.data ?? [];

  return patients.filter((patient) => {
    const name = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const matchesQuery = name.includes(query.toLowerCase());
    const lastRecommendation = patient.recommendations?.[0];
    const matchesStatus =
      statusFilter === 'ALL' || (lastRecommendation?.formularyStatus ?? 'UNKNOWN') === statusFilter;
    return matchesQuery && matchesStatus;
  });
}

function formularyBadge(status?: string) {
  switch (status) {
    case 'OPTIMAL':
      return <Badge variant="success">Tier 1-2</Badge>;
    case 'SUBOPTIMAL':
      return <Badge variant="warning">Tier 3</Badge>;
    case 'NON_FORMULARY':
      return <Badge variant="destructive">Tier 4+</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['patients', search, statusFilter],
    queryFn: () => fetchPatients(search, statusFilter)
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Patient Dashboard</h1>
          <p className="text-sm text-slate-600">Review dermatology patients and launch assessments.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Patients</CardTitle>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Input
              placeholder="Search patients..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="sm:w-64"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All formulary statuses</SelectItem>
                <SelectItem value="OPTIMAL">Formulary aligned</SelectItem>
                <SelectItem value="SUBOPTIMAL">Suboptimal</SelectItem>
                <SelectItem value="NON_FORMULARY">Non-formulary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No patients found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Current Medication</TableHead>
                  <TableHead>Formulary Status</TableHead>
                  <TableHead>Last Recommendation</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((patient) => {
                  const lastRecommendation = patient.recommendations?.[0];
                  return (
                    <TableRow key={patient.id} className="hover:bg-primary/5">
                      <TableCell className="font-semibold text-slate-900">
                        {patient.firstName} {patient.lastName}
                      </TableCell>
                      <TableCell>
                        {patient.currentMedication ? (
                          <div className="text-sm text-slate-600">
                            <div className="font-medium text-slate-800">{patient.currentMedication.drugName}</div>
                            <div className="text-xs text-slate-500">
                              {patient.currentMedication.dose} • {patient.currentMedication.frequency}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No active biologic</span>
                        )}
                      </TableCell>
                      <TableCell>{formularyBadge(lastRecommendation?.formularyStatus)}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {lastRecommendation ? new Date(lastRecommendation.createdAt).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          View →
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
