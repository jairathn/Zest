'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Global navigation loading indicator
 * Shows a progress bar at the top of the page during navigation
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Show loading when route changes
    setLoading(true);

    // Hide loading after a short delay (navigation has completed)
    const timer = setTimeout(() => {
      setLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="h-1 bg-blue-600 animate-pulse"
           style={{
             animation: 'progress 1s ease-in-out infinite',
             background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%)',
             backgroundSize: '200% 100%'
           }}
      />
    </div>
  );
}
