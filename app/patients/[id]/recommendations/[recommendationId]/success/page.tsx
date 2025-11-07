'use client';

import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export default function RecommendationSuccessPage() {
  const params = useParams<{ id: string; recommendationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedIndex = Number(searchParams.get('selected') ?? 0);

  const { data, isLoading } = useQuery({
    queryKey: ['recommendation', params.recommendationId],
    queryFn: async () => {
      const response = await fetch(`/api/recommendations/${params.recommendationId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load recommendation');
      return response.json() as Promise<{ data: { recommendationsJson: any[] } }>;
    }
  });

  if (isLoading || !data) {
    return <Skeleton className="h-[500px]" />;
  }

  const selected = data.data.recommendationsJson[selectedIndex];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
          <CardTitle className="text-2xl font-semibold text-slate-900">Success!</CardTitle>
          <p className="text-sm text-slate-600">You&apos;ve selected: {selected?.drug_name}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Next Steps</h3>
            <ul className="mt-2 space-y-3 text-sm text-slate-600">
              <li>
                ☐ Discuss therapy change with patient — highlight formulary alignment and expected qualitative cost savings.
              </li>
              <li>
                ☐ Send new prescription to specialty pharmacy (feature coming soon).
              </li>
              <li>
                ☐ Schedule 12-week follow-up visit to confirm disease control.
              </li>
              <li>
                ☐ Provide patient education materials (download center coming soon).
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Expected Impact</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-semibold">Formulary Compliance</p>
                <p>Tier status: {selected?.formulary_tier ? `Tier ${selected.formulary_tier}` : 'Unknown'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold">Cost Outlook</p>
                <p>
                  {selected?.savings_annual !== null && selected?.savings_percent !== null
                    ? `${formatCurrency(selected.savings_annual)} annual reduction (${selected.savings_percent}%)`
                    : 'Qualitative savings expected — verify with payer pricing.'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold">Clinical Outcomes</p>
                <p>Maintain current disease control with close monitoring.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold">Prior Authorization</p>
                <p>
                  {selected?.requires_pa === true
                    ? 'Prior authorization required — include clinical documentation.'
                    : selected?.requires_pa === false
                    ? 'No prior authorization required.'
                    : 'PA requirements unavailable.'}
                </p>
              </div>
            </div>
          </section>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => router.push(`/patients/${params.id}`)}>
              ← Back to Patient
            </Button>
            <Button onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
