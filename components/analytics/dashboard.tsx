'use client';

import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const COLORS = ['#0A9396', '#EE9B00', '#BB3E03', '#94D2BD', '#005F73'];

interface AnalyticsData {
  totalRecommendations: number;
  acceptedCount: number;
  tierBuckets: { tier1: number; tier2: number; tier3plus: number };
  totalSavings: number;
  recommendationTypeStats: Record<string, { accepted: number; rejected: number }>;
  rejectionReasons: Record<string, number>;
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const acceptanceRate = data.totalRecommendations === 0 ? 0 : Math.round((data.acceptedCount / data.totalRecommendations) * 100);
  const avgSavings = data.totalRecommendations === 0 ? 0 : Math.round(data.totalSavings / Math.max(data.totalRecommendations, 1));

  const tierData = [
    { name: 'Tier 1', value: data.tierBuckets.tier1 },
    { name: 'Tier 2', value: data.tierBuckets.tier2 },
    { name: 'Tier 3+', value: data.tierBuckets.tier3plus }
  ];

  const recommendationPerformance = Object.entries(data.recommendationTypeStats).map(([type, stats]) => ({
    type,
    accepted: stats.accepted,
    rejected: stats.rejected
  }));

  const rejectionReasonData = Object.entries(data.rejectionReasons).map(([reason, count], index) => ({
    name: reason,
    value: count,
    fill: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Analytics Dashboard</h1>
          <p className="text-sm text-slate-600">Monitor formulary alignment and recommendation performance.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-slate-500">Formulary Alignment</p>
            <p className="mt-2 text-3xl font-semibold text-primary">{tierData[0].value + tierData[1].value}</p>
            <p className="text-xs text-slate-500">Patients on Tier 1-2 therapies</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-slate-500">Acceptance Rate</p>
            <p className="mt-2 text-3xl font-semibold text-primary">{acceptanceRate}%</p>
            <p className="text-xs text-slate-500">Provider acceptance of AI guidance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Savings</p>
            <p className="mt-2 text-3xl font-semibold text-primary">${Math.max(data.totalSavings, 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500">Projected annual savings (qualitative if costs missing)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-slate-500">Avg Savings / Patient</p>
            <p className="mt-2 text-3xl font-semibold text-primary">${Math.max(avgSavings, 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500">Value assumes provided cost data</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Formulary Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tierData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#0A9396" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recommendation Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recommendationPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="accepted" fill="#005F73" radius={[8, 8, 0, 0]} />
                <Bar dataKey="rejected" fill="#EE9B00" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Rejection Reasons</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rejectionReasonData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={120} label>
                  {rejectionReasonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
