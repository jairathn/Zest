'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { MapPin, TrendingUp, DollarSign, CheckCircle } from 'lucide-react';

interface StateAnalytics {
  state: string;
  totalPatients: number;
  highCostCount: number;
  highCostRate: number;
  recommendationsCount: number;
  acceptedCount: number;
  successRate: number;
}

interface CityData {
  city: string;
  state: string;
  patientCount: number;
}

interface AnalyticsData {
  stateAnalytics: StateAnalytics[];
  topCities: CityData[];
}

export default function GeographicAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics/geographic');
      const analytics = await res.json();
      setData(analytics);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="mb-2">Geographic Analytics</h1>
        <p className="text-gray-600">
          Analyze program success rates and patient demographics by location
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total States</p>
              <p className="text-2xl font-bold text-gray-900">{data?.stateAnalytics.length || 0}</p>
            </div>
            <MapPin className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Patients</p>
              <p className="text-2xl font-bold text-gray-900">
                {data?.stateAnalytics.reduce((sum, s) => sum + s.totalPatients, 0) || 0}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {data?.stateAnalytics.length
                  ? Math.round(
                      data.stateAnalytics.reduce((sum, s) => sum + s.successRate, 0) /
                        data.stateAnalytics.filter(s => s.successRate > 0).length
                    )
                  : 0}%
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">High Cost Patients</p>
              <p className="text-2xl font-bold text-gray-900">
                {data?.stateAnalytics.reduce((sum, s) => sum + s.highCostCount, 0) || 0}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* State Performance Table */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Performance by State</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-sm font-semibold">State</th>
                  <th className="text-right py-2 px-2 text-sm font-semibold">Patients</th>
                  <th className="text-right py-2 px-2 text-sm font-semibold">High Cost %</th>
                  <th className="text-right py-2 px-2 text-sm font-semibold">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {data?.stateAnalytics
                  .sort((a, b) => b.successRate - a.successRate)
                  .map((state) => (
                    <tr key={state.state} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2 font-medium">{state.state}</td>
                      <td className="py-2 px-2 text-right text-sm">{state.totalPatients}</td>
                      <td className="py-2 px-2 text-right text-sm">
                        <span className={`${state.highCostRate > 50 ? 'text-red-600' : 'text-green-600'}`}>
                          {state.highCostRate}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-sm">
                        {state.successRate > 0 ? (
                          <span className={`font-medium ${
                            state.successRate >= 70 ? 'text-green-600' :
                            state.successRate >= 50 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {state.successRate}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(!data?.stateAnalytics || data.stateAnalytics.length === 0) && (
              <div className="text-center py-8 text-gray-500">
                No geographic data available
              </div>
            )}
          </div>
        </div>

        {/* Top Cities */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Top Cities by Patient Volume</h2>
          <div className="space-y-3">
            {data?.topCities.map((city, index) => (
              <div key={`${city.city}-${city.state}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold text-sm mr-3">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{city.city}</div>
                    <div className="text-xs text-gray-500">{city.state}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{city.patientCount}</div>
                  <div className="text-xs text-gray-500">patients</div>
                </div>
              </div>
            ))}
            {(!data?.topCities || data.topCities.length === 0) && (
              <div className="text-center py-8 text-gray-500">
                No city data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="mt-6 card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold mb-3 text-blue-900">Geographic Insights</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p><strong>Purpose:</strong> Use this data to identify geographic patterns in program success.</p>
          <p><strong>Key Questions to Explore:</strong></p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Which states have the highest success rates for recommendations?</li>
            <li>Are high-cost patients concentrated in certain regions?</li>
            <li>Do urban vs. rural areas show different adoption patterns?</li>
            <li>Are there regional differences in payer policies affecting outcomes?</li>
          </ul>
          <p><strong>Next Steps:</strong> Consider correlating this data with factors like provider networks, formulary restrictions, or regional cost of living to understand drivers of success.</p>
        </div>
      </div>
    </div>
  );
}
