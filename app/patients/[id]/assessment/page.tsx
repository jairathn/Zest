'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

const assessmentSchema = z.object({
  diagnosis: z.enum(['PSORIASIS', 'ECZEMA', 'HIDRADENITIS_SUPPURATIVA', 'OTHER']),
  severityScoreType: z.enum(['PASI', 'EASI', 'IGA', 'PGA']),
  severityScore: z.coerce.number().min(0),
  assessmentDate: z.string(),
  severityDurationMonths: z.coerce.number().int().min(0),
  dlqiScore: z.coerce.number().int().min(0).max(30),
  adverseEvents: z.string().optional(),
  comorbidities: z.array(z.string()).optional(),
  providerNotes: z.string().optional()
});

type AssessmentForm = z.infer<typeof assessmentSchema>;

const severityHints: Record<string, string> = {
  PASI: '0-72 (Psoriasis Area Severity Index)',
  EASI: '0-72 (Eczema Area and Severity Index)',
  IGA: '0-4 (Investigator Global Assessment)',
  PGA: '0-4 (Physician Global Assessment)'
};

export default function AssessmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', params.id],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${params.id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch patient');
      const payload = await response.json();
      return payload.data as {
        firstName: string;
        lastName: string;
        currentMedication: { drugName: string; frequency: string; dose: string } | null;
        insurancePlan: { planName: string };
      };
    }
  });

  const form = useForm<AssessmentForm>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: {
      diagnosis: 'PSORIASIS',
      severityScoreType: 'PASI',
      assessmentDate: format(new Date(), 'yyyy-MM-dd'),
      severityScore: 0,
      severityDurationMonths: 0,
      dlqiScore: 0,
      comorbidities: []
    }
  });

  const mutation = useMutation({
    mutationFn: async (values: AssessmentForm) => {
      const response = await fetch(`/api/patients/${params.id}/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        throw new Error('Assessment submission failed');
      }
      return response.json();
    },
    onSuccess: (payload) => {
      router.push(`/patients/${params.id}/recommendations/${payload.recommendation.id}`);
    }
  });

  const comorbidityOptions = useMemo(
    () => [
      { label: 'Renal impairment', value: 'RENAL' },
      { label: 'Hepatic impairment', value: 'HEPATIC' },
      { label: 'Pregnancy/planning', value: 'PREGNANCY' },
      { label: 'Active infection', value: 'INFECTION' },
      { label: 'Immunocompromised', value: 'IMMUNOCOMPROMISED' }
    ],
    []
  );

  const selectedComorbidities = form.watch('comorbidities') ?? [];

  if (isLoading || !patient) {
    return <Skeleton className="h-[600px]" />;
  }

  const currentMedLabel = patient.currentMedication
    ? `${patient.currentMedication.drugName} • ${patient.currentMedication.dose} • ${patient.currentMedication.frequency}`
    : 'No current biologic';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Clinical Assessment: {patient.firstName} {patient.lastName}</h1>
        <p className="text-sm text-slate-600">Current: {currentMedLabel}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Assessment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
            <section className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Diagnosis *</Label>
                <RadioGroup
                  className="grid gap-2 md:grid-cols-2"
                  value={form.watch('diagnosis')}
                  onValueChange={(value) => form.setValue('diagnosis', value as AssessmentForm['diagnosis'])}
                >
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <RadioGroupItem value="PSORIASIS" /> Psoriasis
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <RadioGroupItem value="ECZEMA" /> Eczema
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <RadioGroupItem value="HIDRADENITIS_SUPPURATIVA" /> Hidradenitis Suppurativa
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <RadioGroupItem value="OTHER" /> Other
                  </label>
                </RadioGroup>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Score Type *</Label>
                <Select
                  value={form.watch('severityScoreType')}
                  onValueChange={(value) => form.setValue('severityScoreType', value as AssessmentForm['severityScoreType'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select score" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASI">PASI</SelectItem>
                    <SelectItem value="EASI">EASI</SelectItem>
                    <SelectItem value="IGA">IGA</SelectItem>
                    <SelectItem value="PGA">PGA</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">{severityHints[form.watch('severityScoreType')]}</p>
              </div>
              <div className="space-y-2">
                <Label>Score *</Label>
                <Input type="number" step="0.1" {...form.register('severityScore')} />
              </div>
              <div className="space-y-2">
                <Label>Assessment Date *</Label>
                <Input type="date" {...form.register('assessmentDate')} />
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>How long at this severity level? *</Label>
                <Input type="number" min={0} {...form.register('severityDurationMonths')} />
                <p className="text-xs text-slate-500">Months</p>
              </div>
              <div className="space-y-2">
                <Label>DLQI Score *</Label>
                <Input type="number" min={0} max={30} {...form.register('dlqiScore')} />
                <p className="text-xs text-slate-500">0 (no impact) to 30 (severe impact)</p>
              </div>
            </section>

            <section>
              <Label>Clinical Considerations</Label>
              <Textarea placeholder="Adverse events, tolerability concerns, patient requests" {...form.register('adverseEvents')} />
            </section>

            <section className="space-y-3">
              <Label>Relevant Comorbidities</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {comorbidityOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <Checkbox
                      checked={selectedComorbidities.includes(option.value)}
                      onCheckedChange={(checked) => {
                        const current = new Set(selectedComorbidities);
                        if (checked === true) current.add(option.value);
                        else current.delete(option.value);
                        form.setValue('comorbidities', Array.from(current));
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <Label>Additional Notes</Label>
              <Textarea rows={4} placeholder="Add any context that should inform recommendations." {...form.register('providerNotes')} />
            </section>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Generating...' : 'Generate Recommendations'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
