'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';

interface PatientDetailResponse {
  data: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    insurancePlan: {
      planName: string;
      formularyDrugs: Array<{ id: string; drugName: string; tier: number; requiresPA: boolean }>;
    };
    currentMedication: {
      drugName: string;
      dose: string;
      frequency: string;
      startDate: string;
      lastFillDate: string | null;
      adherencePDC: string;
    } | null;
    claimsHistory: Array<{
      id: string;
      drugName: string;
      startDate: string;
      endDate: string | null;
      reasonDiscontinued: string | null;
    }>;
    pharmacyClaims: Array<{
      id: string;
      drugName: string;
      fillDate: string;
      daysSupply: number;
      outOfPocket: string | null;
    }>;
    insurancePlanId: string;
  };
}

function tierBadge(tier?: number) {
  if (!tier) return <Badge variant="outline">Unknown tier</Badge>;
  if (tier === 1) return <Badge variant="success">Tier 1</Badge>;
  if (tier === 2) return <Badge variant="warning">Tier 2</Badge>;
  return <Badge variant="destructive">Tier {tier}</Badge>;
}

function formatMonthsSince(date: string | null) {
  if (!date) return 'N/A';
  const start = new Date(date);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  return `${months} months ago`;
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['patient', params.id],
    queryFn: async (): Promise<PatientDetailResponse['data']> => {
      const response = await fetch(`/api/patients/${params.id}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load patient');
      }
      const payload: PatientDetailResponse = await response.json();
      return payload.data;
    },
    staleTime: 1000 * 30
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const currentMedication = data.currentMedication;
  const currentFill = data.pharmacyClaims[0];

  return (
    <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-slate-900">
            {data.firstName} {data.lastName} • DOB: {format(new Date(data.dateOfBirth), 'MM/dd/yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Current Medication</h3>
                {currentMedication ? (
                  <p className="text-sm text-slate-600">
                    {currentMedication.drugName} • {currentMedication.dose} • {currentMedication.frequency}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">No active biologic</p>
                )}
              </div>
              {tierBadge(currentMedication ? data.insurancePlan.formularyDrugs.find((drug) => drug.drugName.toLowerCase() === currentMedication.drugName.toLowerCase())?.tier : undefined)}
            </div>
            {currentMedication && (
              <dl className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-500 sm:grid-cols-4">
                <div>
                  <dt className="font-semibold text-slate-700">Started</dt>
                  <dd>{format(new Date(currentMedication.startDate), 'MM/dd/yyyy')}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700">Last fill</dt>
                  <dd>{currentMedication.lastFillDate ? format(new Date(currentMedication.lastFillDate), 'MM/dd/yyyy') : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700">Duration</dt>
                  <dd>{formatMonthsSince(currentMedication.startDate)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700">Adherence (PDC)</dt>
                  <dd>{Number(currentMedication.adherencePDC).toFixed(0)}%</dd>
                </div>
              </dl>
            )}
            {currentFill && (
              <p className="mt-4 text-xs text-slate-500">
                Recent fill: {format(new Date(currentFill.fillDate), 'MM/dd/yyyy')} • {currentFill.daysSupply} days • Patient OOP:{' '}
                {formatCurrency(currentFill.outOfPocket ? Number(currentFill.outOfPocket) : undefined)}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Medication History</h3>
            <div className="mt-3 space-y-2">
              {data.claimsHistory.map((claim) => (
                <div key={claim.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between text-sm text-slate-800">
                    <span>{claim.drugName}</span>
                    <span className="text-xs text-slate-500">
                      {format(new Date(claim.startDate), 'MM/yyyy')} - {claim.endDate ? format(new Date(claim.endDate), 'MM/yyyy') : 'Present'}
                    </span>
                  </div>
                  {claim.reasonDiscontinued && (
                    <p className="mt-1 text-xs text-slate-500">Reason: {claim.reasonDiscontinued}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Recent Fills</h3>
            <div className="mt-3 space-y-2">
              {data.pharmacyClaims.slice(0, 6).map((fill) => (
                <div key={fill.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
                  <span>{format(new Date(fill.fillDate), 'MM/dd/yyyy')}</span>
                  <span>{fill.daysSupply} days</span>
                  <span>{formatCurrency(fill.outOfPocket ? Number(fill.outOfPocket) : undefined)}</span>
                </div>
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardContent className="flex flex-col gap-4 p-6">
          <h3 className="text-lg font-semibold text-slate-900">Clinical Actions</h3>
          <p className="text-sm text-slate-600">
            Generate an updated assessment to produce formulary-optimized guidance for this patient.
          </p>
          <Button onClick={() => router.push(`/patients/${data.id}/assessment`)} size="lg">
            New Clinical Assessment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
