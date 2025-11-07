import { prisma } from '@/lib/db';
import AnalyticsDashboard from '@/components/analytics/dashboard';

export default async function AnalyticsPage() {
  const recommendations = await prisma.recommendation.findMany({
    include: {
      feedback: true
    }
  });

  const totalRecommendations = recommendations.length;
  const acceptedCount = recommendations.filter((rec) => rec.providerDecision === 'ACCEPTED').length;

  const tierBuckets = { tier1: 0, tier2: 0, tier3plus: 0 };
  let totalSavings = 0;

  const recommendationTypeStats: Record<string, { accepted: number; rejected: number }> = {};
  const rejectionReasons: Record<string, number> = {};

  recommendations.forEach((rec) => {
    const topRecommendation = (rec.recommendationsJson as any[])[0];
    if (topRecommendation?.formulary_tier) {
      if (topRecommendation.formulary_tier === 1) tierBuckets.tier1 += 1;
      else if (topRecommendation.formulary_tier === 2) tierBuckets.tier2 += 1;
      else tierBuckets.tier3plus += 1;
    }

    if (typeof topRecommendation?.savings_annual === 'number') {
      totalSavings += topRecommendation.savings_annual;
    }

    const recommendationType = topRecommendation?.recommendation_type ?? 'unknown';
    if (!recommendationTypeStats[recommendationType]) {
      recommendationTypeStats[recommendationType] = { accepted: 0, rejected: 0 };
    }
    if (rec.providerDecision === 'ACCEPTED') {
      recommendationTypeStats[recommendationType].accepted += 1;
    } else if (rec.providerDecision === 'REJECTED') {
      recommendationTypeStats[recommendationType].rejected += 1;
    }

    if (rec.feedback) {
      const reasons = rec.feedback.reasons as Array<{ type: string }>;
      reasons?.forEach((reason) => {
        rejectionReasons[reason.type] = (rejectionReasons[reason.type] ?? 0) + 1;
      });
    }
  });

  const analyticsData = {
    totalRecommendations,
    acceptedCount,
    tierBuckets,
    totalSavings,
    recommendationTypeStats,
    rejectionReasons
  };

  return <AnalyticsDashboard data={analyticsData} />;
}
