'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Global navigation loading indicator
 * Shows a progress bar and spinner during navigation
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Show loading when route changes
    setLoading(true);

    // Hide loading after navigation completes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!loading) return null;

  return (
    <>
      {/* Progress bar at top */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-600 animate-pulse"
           style={{
             animation: 'indeterminate-progress 1.5s ease-in-out infinite',
             background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
             backgroundSize: '50% 100%',
           }}
      />

      {/* Overlay with spinner */}
      <div className="fixed inset-0 z-40 bg-white/50 backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          {/* Spinner */}
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700">Loading...</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes indeterminate-progress {
          0% {
            background-position: -50% 0;
          }
          100% {
            background-position: 150% 0;
          }
        }
      `}</style>
    </>
  );
}
