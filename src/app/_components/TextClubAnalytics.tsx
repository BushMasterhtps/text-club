'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/app/_components/ui/card';
import { H2, H3 } from '@/app/_components/ui/typography';
import { SmallButton } from '@/app/_components/ui/button';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

interface TextClubAnalytics {
  totalCompleted: number;
  totalCompletedToday: number;
  avgHandleTime: number;
  dispositionBreakdown: Array<{
    disposition: string;
    count: number;
    avgDuration: number;
  }>;
  agentPerformance: Array<{
    agent: { name: string; email: string };
    completedCount: number;
    avgDuration: number;
  }>;
  dailyTrends: Array<{
    date: string;
    count: number;
    avgDuration: number;
  }>;
  rawData: Array<{
    id: string;
    brand: string;
    phone: string;
    agent: string;
    disposition: string;
    duration: number;
    completedAt: string;
  }>;
}

interface TextClubAnalyticsProps {
  startDate?: string;
  endDate?: string;
  agentFilter?: string;
  dispositionFilter?: string;
}

export default function TextClubAnalytics({ 
  startDate, 
  endDate, 
  agentFilter, 
  dispositionFilter 
}: TextClubAnalyticsProps) {
  const [analytics, setAnalytics] = useState<TextClubAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRawData, setShowRawData] = useState(false);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (agentFilter) params.set('agentFilter', agentFilter);
      if (dispositionFilter) params.set('dispositionFilter', dispositionFilter);

      const response = await fetch(`/api/analytics/text-club?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAnalytics(data.data);
        }
      }
    } catch (error) {
      console.error('Error loading Text Club analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [startDate, endDate, agentFilter, dispositionFilter]);

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0m";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getDispositionColor = (disposition: string) => {
    const colors: Record<string, string> = {
      "Answered in Attentive": "#10B981",
      "Answered in SF": "#3B82F6", 
      "Spam": "#EF4444",
      "Previously Assisted": "#F59E0B",
      "No Response Required": "#8B5CF6",
    };
    return colors[disposition] || "#6B7280";
  };

  const downloadCSV = () => {
    if (!analytics?.rawData) return;

    const headers = ['Brand', 'Phone', 'Agent', 'Disposition', 'Duration (min)', 'Completed At'];
    const rows = analytics.rawData.map(task => [
      task.brand,
      task.phone,
      task.agent,
      task.disposition,
      Math.round(task.duration / 60),
      new Date(task.completedAt).toLocaleString()
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `text_club_analytics_${startDate || 'all'}_to_${endDate || 'all'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <H3>Loading Text Club Analytics...</H3>
          </div>
        </div>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card className="p-6">
        <H3>No data available</H3>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium">Completed Today</p>
              <p className="text-2xl font-bold text-white mt-1">{analytics.totalCompletedToday}</p>
            </div>
            <div className="text-3xl">✅</div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-200 text-sm font-medium">Total Completed</p>
              <p className="text-2xl font-bold text-white mt-1">{analytics.totalCompleted.toLocaleString()}</p>
            </div>
            <div className="text-3xl">📈</div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-purple-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-200 text-sm font-medium">Avg Handle Time</p>
              <p className="text-2xl font-bold text-white mt-1">{formatDuration(analytics.avgHandleTime)}</p>
            </div>
            <div className="text-3xl">⏱️</div>
          </div>
        </Card>
      </div>

      {/* Disposition Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <H3 className="mb-4">📊 Disposition Breakdown</H3>
          <div className="space-y-3">
            {analytics.dispositionBreakdown.map((dispo) => (
              <div key={dispo.disposition} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: getDispositionColor(dispo.disposition) }}
                  ></div>
                  <span className="font-medium text-white">{dispo.disposition}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-white">{dispo.count}</div>
                  <div className="text-sm text-white/60">{formatDuration(dispo.avgDuration)} avg</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <H3 className="mb-4">📈 Disposition Distribution</H3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.dispositionBreakdown.map(dispo => ({
                    name: dispo.disposition,
                    value: dispo.count,
                    fill: getDispositionColor(dispo.disposition)
                  }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {analytics.dispositionBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getDispositionColor(entry.disposition)} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Agent Performance */}
      <Card className="p-6">
        <H3 className="mb-4">👥 Agent Performance</H3>
        <div className="space-y-3">
          {analytics.agentPerformance.map((agent) => (
            <div key={agent.agent.email} className="flex justify-between items-center p-4 bg-white/5 rounded-lg">
              <div>
                <div className="font-semibold text-white">{agent.agent.name}</div>
                <div className="text-sm text-white/60">{agent.agent.email}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-white">{agent.completedCount} completed</div>
                <div className="text-sm text-white/60">{formatDuration(agent.avgDuration)} avg</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Daily Trends */}
      {analytics.dailyTrends.length > 0 && (
        <Card className="p-6">
          <H3 className="mb-4">📈 Daily Trends</H3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.6)"
                  fontSize={12}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.6)"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Raw Data */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <H3>📋 Raw Data</H3>
          <div className="flex gap-2">
            <SmallButton onClick={downloadCSV} className="bg-green-600 hover:bg-green-700">
              📥 Download CSV
            </SmallButton>
            <SmallButton 
              onClick={() => setShowRawData(!showRawData)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {showRawData ? 'Hide' : 'Show'} Data
            </SmallButton>
          </div>
        </div>

        {showRawData && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left p-2 text-white/80">Brand</th>
                  <th className="text-left p-2 text-white/80">Phone</th>
                  <th className="text-left p-2 text-white/80">Agent</th>
                  <th className="text-left p-2 text-white/80">Disposition</th>
                  <th className="text-left p-2 text-white/80">Duration</th>
                  <th className="text-left p-2 text-white/80">Completed</th>
                </tr>
              </thead>
              <tbody>
                {analytics.rawData.slice(0, 50).map((task) => (
                  <tr key={task.id} className="border-b border-white/10">
                    <td className="p-2 text-white/90">{task.brand}</td>
                    <td className="p-2 text-white/90">{task.phone}</td>
                    <td className="p-2 text-white/90">{task.agent}</td>
                    <td className="p-2 text-white/90">{task.disposition}</td>
                    <td className="p-2 text-white/90">{formatDuration(task.duration)}</td>
                    <td className="p-2 text-white/90">{new Date(task.completedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analytics.rawData.length > 50 && (
              <p className="text-center text-white/60 mt-4">
                Showing first 50 of {analytics.rawData.length} records
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
