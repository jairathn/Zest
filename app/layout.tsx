import type { Metadata } from 'next';
import './globals.css';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TopNav } from '@/components/navigation/top-nav';
import { QueryProvider } from '@/components/providers/query-provider';

export const metadata: Metadata = {
  title: 'Zest Health - Biologics Decision Support',
  description: 'Clinical decision support tool for dermatology biologics'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-slate-50">
      <body className={cn('min-h-screen bg-slate-50 antialiased')}>
        <QueryProvider>
          <TopNav />
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">{children}</div>
        </QueryProvider>
      </body>
    </html>
  );
}
