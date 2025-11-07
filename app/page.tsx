import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-200 p-8">
      <div className="max-w-3xl rounded-3xl bg-white p-12 shadow-2xl">
        <div className="space-y-6 text-center">
          <h1 className="text-4xl font-bold text-slate-900">
            Zest Health Biologics Decision Support
          </h1>
          <p className="text-lg text-slate-600">
            Provide formulary-aligned care without compromising clinical outcomes. Assess patient stability, review formulary coverage, and generate AI-guided recommendations in seconds.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full border-primary text-primary hover:bg-primary/10 sm:w-auto">
              <Link href="/analytics">View Analytics</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
