'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { RejectionFeedbackModal } from '@/components/recommendations/rejection-feedback-modal';

interface RecommendationResponse {
  data: {
    id: string;
    patientId: string;
    assessment: {
      diagnosis: string;
      severityScoreType: string;
      severityScore: string;
      severityDurationMonths: number;
      dlqiScore: number;
    };
    recommendationsJson: Array<{
      rank: number;
      drug_name: string;
      dose: string;
      frequency: string;
      recommendation_type: string;
      clinical_rationale: string;
      evidence: string[];
      cost_current_annual: number | null;
      cost_recommended_annual: number | null;
      savings_annual: number | null;
      savings_percent: number | null;
      formulary_tier: number | null;
      requires_pa: boolean | null;
      patient_oop_current_monthly: number | null;
      patient_oop_recommended_monthly: number | null;
      monitoring_plan: string;
    }>;
    quadrant: string;
    stabilityStatus: string;
    formularyStatus: string;
  };
}

function statusBadge(status: string) {
  if (status === 'STABLE') return <Badge variant="success">Stable</Badge>;
  return <Badge variant="destructive">Unstable</Badge>;
}

function formularyStatusBadge(status: string) {
  if (status === 'OPTIMAL') return <Badge variant="success">Formulary aligned</Badge>;
  if (status === 'SUBOPTIMAL') return <Badge variant="warning">Suboptimal tier</Badge>;
  return <Badge variant="destructive">Non-formulary</Badge>;
}

export default function RecommendationPage() {
  const params = useParams<{ id: string; recommendationId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['recommendation', params.recommendationId],
    queryFn: async (): Promise<RecommendationResponse['data']> => {
      const response = await fetch(`/api/recommendations/${params.recommendationId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load recommendation');
      const payload: RecommendationResponse = await response.json();
      return payload.data;
    }
  });

  const acceptMutation = useMutation({
    mutationFn: async (acceptedIndex: number) => {
      const response = await fetch(`/api/recommendations/${params.recommendationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerDecision: 'ACCEPTED', acceptedRecommendationIndex: acceptedIndex })
      });
      if (!response.ok) throw new Error('Failed to update recommendation');
      return response.json();
    },
    onSuccess: (payload, acceptedIndex) => {
      queryClient.invalidateQueries({ queryKey: ['recommendation', params.recommendationId] });
      router.push(`/patients/${params.id}/recommendations/${params.recommendationId}/success?selected=${acceptedIndex}`);
    }
  });

  if (isLoading || !data) {
    return <Skeleton className="h-[600px]" />;
  }

  const assessment = data.assessment;

  const quadrantDescription: Record<string, string> = {
    stable_formulary_aligned: 'Stable + Formulary-aligned → Consider dose reduction',
    stable_non_formulary: 'Stable + Non-formulary → Switch to preferred agent',
    unstable_formulary_aligned: 'Unstable + Formulary-aligned → Optimize current therapy',
    unstable_non_formulary: 'Unstable + Non-formulary → Switch mechanism with formulary alignment'
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI-Generated Recommendations</h1>
        <p className="text-sm text-slate-600">
          Current status: {statusBadge(data.stabilityStatus)} • {formularyStatusBadge(data.formularyStatus)}
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Clinical Assessment</h3>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>
                Diagnosis: <span className="font-medium text-slate-800">{assessment.diagnosis}</span>
              </li>
              <li>
                Severity: {assessment.severityScoreType} {Number(assessment.severityScore).toFixed(1)} maintained for{' '}
                {assessment.severityDurationMonths} months
              </li>
              <li>DLQI score: {assessment.dlqiScore}</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Formulary Status</h3>
            <p className="mt-2 text-xs text-slate-600">{quadrantDescription[data.quadrant] ?? 'Review formulary alignment.'}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {data.recommendationsJson.map((recommendation, index) => (
          <Card key={recommendation.rank} className={index === 0 ? 'border-primary shadow-lg' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span>
                  #{recommendation.rank} • {recommendation.drug_name}
                </span>
                {recommendation.formulary_tier ? (
                  <Badge variant={recommendation.formulary_tier <= 2 ? 'success' : recommendation.formulary_tier === 3 ? 'warning' : 'destructive'}>
                    Tier {recommendation.formulary_tier}
                  </Badge>
                ) : (
                  <Badge variant="outline">Tier unknown</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Clinical Rationale</p>
                  <p>{recommendation.clinical_rationale}</p>
                  {recommendation.evidence.length > 0 && (
                    <p className="text-xs text-slate-500">Evidence: {recommendation.evidence.join(', ')}</p>
                  )}
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Monitoring Plan</p>
                  <p>{recommendation.monitoring_plan || 'Follow clinical judgment for monitoring cadence.'}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-900">Cost Impact</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Recommended</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-slate-700">Annual cost (if available)</TableCell>
                      <TableCell>
                        {recommendation.cost_current_annual !== null
                          ? formatCurrency(recommendation.cost_current_annual)
                          : 'Not available'}
                      </TableCell>
                      <TableCell>
                        {recommendation.cost_recommended_annual !== null
                          ? formatCurrency(recommendation.cost_recommended_annual)
                          : 'Not available'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-slate-700">Patient OOP / month</TableCell>
                      <TableCell>
                        {recommendation.patient_oop_current_monthly !== null
                          ? formatCurrency(recommendation.patient_oop_current_monthly)
                          : 'Not available'}
                      </TableCell>
                      <TableCell>
                        {recommendation.patient_oop_recommended_monthly !== null
                          ? formatCurrency(recommendation.patient_oop_recommended_monthly)
                          : 'Not available'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-slate-700">Estimated Savings</TableCell>
                      <TableCell colSpan={2}>
                        {recommendation.savings_annual !== null && recommendation.savings_percent !== null
                          ? `${formatCurrency(recommendation.savings_annual)} (${recommendation.savings_percent}% reduction)`
                          : 'Qualitative savings only — exact plan pricing unavailable.'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {recommendation.requires_pa === null
                    ? 'PA requirements unavailable.'
                    : recommendation.requires_pa
                    ? 'Prior authorization required.'
                    : 'No prior authorization required.'}
                </div>
                <Button onClick={() => acceptMutation.mutate(index)} disabled={acceptMutation.isPending}>
                  {acceptMutation.isPending ? 'Submitting...' : 'Select this recommendation'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => setFeedbackOpen(true)}>
          Reject All Recommendations
        </Button>
      </div>

      <RejectionFeedbackModal
        recommendationId={params.recommendationId}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />
    </div>
  );
}
