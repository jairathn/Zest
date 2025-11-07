'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation } from '@tanstack/react-query';

const REASONS = [
  { id: 'TRIED_MED', label: 'Patient has already tried the recommended medication' },
  { id: 'ALLERGY', label: 'Patient has an allergy or contraindication' },
  { id: 'CLINICAL_CONCERN', label: 'Clinical concern not captured by the tool' },
  { id: 'PATIENT_PREFERENCE', label: 'Patient strongly prefers current medication' },
  { id: 'POOR_OUTCOME', label: 'I have had poor outcomes with recommended drug' },
  { id: 'FORMULARY_ERROR', label: 'Formulary information appears incorrect' },
  { id: 'PA_CONCERN', label: 'Insurance/PA concern not addressed' },
  { id: 'COST_INACCURATE', label: 'Cost estimate seems inaccurate' },
  { id: 'OTHER', label: 'Other reason' }
];

interface RejectionFeedbackModalProps {
  recommendationId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

export function RejectionFeedbackModal({ recommendationId, open, onOpenChange }: RejectionFeedbackModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('TRIED_MED');
  const [details, setDetails] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        reasons: [
          {
            type: selectedReason,
            details: selectedReason === 'TRIED_MED'
              ? [`When: ${details['TRIED_MED_WHEN'] ?? ''}`, `Reason: ${details['TRIED_MED_REASON'] ?? ''}`].join('
')
              : details[selectedReason] ?? ''
          }
        ]
      };
      const response = await fetch(`/api/recommendations/${recommendationId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }
      return response.json();
    },
    onSuccess: () => {
      onOpenChange(false);
    }
  });

  const detailField = (id: string) => {
    switch (id) {
      case 'TRIED_MED':
        return (
          <div className="space-y-2">
            <Label>When?</Label>
            <Input
              placeholder="e.g., Jan 2023"
              value={details['TRIED_MED_WHEN'] ?? ''}
              onChange={(event) => setDetails((prev) => ({ ...prev, TRIED_MED_WHEN: event.target.value }))}
            />
            <Label>Why discontinued?</Label>
            <Textarea
              rows={3}
              value={details['TRIED_MED_REASON'] ?? ''}
              onChange={(event) => setDetails((prev) => ({ ...prev, TRIED_MED_REASON: event.target.value }))}
            />
          </div>
        );
      case 'ALLERGY':
        return (
          <div className="space-y-2">
            <Label>Specify</Label>
            <Textarea
              rows={3}
              value={details[id] ?? ''}
              onChange={(event) => setDetails((prev) => ({ ...prev, [id]: event.target.value }))}
            />
          </div>
        );
      case 'CLINICAL_CONCERN':
      case 'POOR_OUTCOME':
      case 'PA_CONCERN':
      case 'COST_INACCURATE':
      case 'OTHER':
        return (
          <div className="space-y-2">
            <Label>Details</Label>
            <Textarea
              rows={4}
              value={details[id] ?? ''}
              onChange={(event) => setDetails((prev) => ({ ...prev, [id]: event.target.value }))}
            />
          </div>
        );
      case 'PATIENT_PREFERENCE':
      case 'FORMULARY_ERROR':
        return (
          <div className="space-y-2">
            <Label>Explain</Label>
            <Textarea
              rows={3}
              value={details[id] ?? ''}
              onChange={(event) => setDetails((prev) => ({ ...prev, [id]: event.target.value }))}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Help Us Improve</DialogTitle>
          <DialogDescription>
            We want to understand why the recommendations don&apos;t fit. Your feedback helps improve future guidance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={selectedReason} onValueChange={setSelectedReason} className="space-y-3">
            {REASONS.map((reason) => (
              <label key={reason.id} className="flex cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={reason.id} />
                  <span className="font-medium text-slate-800">{reason.label}</span>
                </div>
                {selectedReason === reason.id && <div className="pl-6 text-xs text-slate-500">{detailField(reason.id)}</div>}
              </label>
            ))}
          </RadioGroup>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting...' : 'Submit Feedback & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
