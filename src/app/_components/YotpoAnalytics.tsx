'use client';

import { useState, useEffect } from 'react';
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface YotpoAnalyticsData {
  overview: {
    totalCompleted: number;
    totalCompletedToday: number;
    avgHandleTime: number;
  };
  issueTopicBreakdown: Array<{
    topic: string;
    count: number;
    avgDuration: number;
  }>;
  dispositionBreakdown: Array<{
    disposition: string;
    count: number;
    avgDuration: number;
  }>;
  agentPerformance: Array<{
    agentId: string;
    agentName: string;
    agentEmail: string;
    count: number;
    avgDuration: number;
  }>;
  rawData: Array<{
    id: string;
    brand: string;
    customerName: string;
    email: string;
    product: string;
    issueTopic: string;
    review: string;
    agent: string;
    agentName: string;
    agentEmail: string;
    startTime: string;
    endTime: string;
    durationSec: number;
    disposition: string;
    sfOrderLink: string;
  }>;
}

export default function YotpoAnalytics() {
  const [data, setData] = useState<YotpoAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showRawData, setShowRawData] = useState(false);

  // Format duration in seconds to "Xm Ys" format (matching Text Club)
  const formatDuration = (seconds: number) => {
    if (!seconds) return "0m 0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Download CSV function
  const downloadCSV = () => {
    if (!data?.rawData) return;

    const headers = ['Brand', 'Customer Name', 'Email', 'Product', 'Issue Topic', 'Agent', 'Start Time', 'End Time', 'Duration', 'Disposition', 'SF Order Link'];
    const rows = data.rawData.map(task => [
      task.brand,
      task.customerName,
      task.email,
      task.product,
      task.issueTopic,
      `${task.agentName} (${task.agentEmail})`,
      new Date(task.startTime).toLocaleString(),
      new Date(task.endTime).toLocaleString(),
      formatDuration(task.durationSec),
      task.disposition,
      task.sfOrderLink
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yotpo-analytics-${startDate}-to-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    // Initialize to current month
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(startOfMonth.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      loadAnalytics();
    }
  }, [startDate, endDate]);

  const loadAnalytics = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/yotpo?startDate=${startDate}&endDate=${endDate}`);
      const result = await res.json();
      
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error loading Yotpo analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const setDateRange = (range: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear') => {
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (range) {
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold text-white mb-4">⭐ Yotpo Analytics</h2>
        <p className="text-white/60 mb-6">Issue Topic tracking and performance metrics</p>

        {/* Date Range Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 bg-white/10 border border-white/10 text-white rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 bg-white/10 border border-white/10 text-white rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={loadAnalytics}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-md font-medium hover:from-blue-700 hover:to-blue-800"
            >
              Load Analytics
            </button>
          </div>
        </div>

        {/* Quick Date Selectors */}
        <div className="flex gap-2">
          <button onClick={() => setDateRange('thisMonth')} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white">
            This Month
          </button>
          <button onClick={() => setDateRange('lastMonth')} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white">
            Last Month
          </button>
          <button onClick={() => setDateRange('thisQuarter')} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white">
            This Quarter
          </button>
          <button onClick={() => setDateRange('thisYear')} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white">
            This Year
          </button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mr-2"></div>
            <span className="text-white/60">Loading analytics...</span>
          </div>
        </Card>
      ) : data ? (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30">
              <div className="text-blue-400 text-sm font-medium mb-1">Completed Today</div>
              <div className="text-3xl font-bold text-white">{data.overview.totalCompletedToday}</div>
            </Card>
            <Card className="p-6 bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/30">
              <div className="text-green-400 text-sm font-medium mb-1">Total Completed</div>
              <div className="text-3xl font-bold text-white">{data.overview.totalCompleted}</div>
            </Card>
            <Card className="p-6 bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-yellow-500/30">
              <div className="text-yellow-400 text-sm font-medium mb-1">Avg Handle Time</div>
              <div className="text-3xl font-bold text-white">{formatDuration(data.overview.avgHandleTime)}</div>
            </Card>
          </div>

          {/* Issue Topic Breakdown (PRIMARY) */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">🏷️ Issue Topic Breakdown</h3>
            <p className="text-sm text-white/60 mb-4">Performance by issue category</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.issueTopicBreakdown.map((item, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="text-sm font-medium text-white/90 mb-2">{item.topic}</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">{item.count}</div>
                      <div className="text-xs text-white/50">tasks</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-yellow-400">{formatDuration(item.avgDuration)}</div>
                      <div className="text-xs text-white/50">avg time</div>
                    </div>
                  </div>
                </div>
              ))}
              {data.issueTopicBreakdown.length === 0 && (
                <div className="col-span-full text-center text-white/50 py-8">
                  No Issue Topic data available for this period
                </div>
              )}
            </div>
          </Card>

          {/* Disposition Breakdown (Secondary) */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">📋 Disposition Breakdown</h3>
            <p className="text-sm text-white/60 mb-4">All 26 Yotpo dispositions</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.dispositionBreakdown.map((item, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-white/80 mb-1">{item.disposition}</div>
                      <div className="text-sm text-white/60">
                        <span className="font-semibold text-white">{item.count}</span> tasks • 
                        <span className="text-yellow-400 ml-1">{formatDuration(item.avgDuration)} avg</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {data.dispositionBreakdown.length === 0 && (
                <div className="col-span-full text-center text-white/50 py-8">
                  No disposition data available for this period
                </div>
              )}
            </div>
          </Card>

          {/* Agent Performance */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">👥 Agent Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="text-left text-white/60">
                    <th className="px-4 py-2">Agent</th>
                    <th className="px-4 py-2 text-right">Completed</th>
                    <th className="px-4 py-2 text-right">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.agentPerformance.map((agent, idx) => (
                    <tr key={idx} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{agent.agentName}</div>
                        <div className="text-xs text-white/50">{agent.agentEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-lg font-semibold text-white">{agent.count}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-lg font-semibold text-yellow-400">{formatDuration(agent.avgDuration)}</div>
                      </td>
                    </tr>
                  ))}
                  {data.agentPerformance.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-white/50">
                        No agent performance data available for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Raw Data from selected source */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">📋 Raw Data from selected source</h3>
              <div className="flex gap-2">
                <SmallButton onClick={downloadCSV} className="bg-orange-500 hover:bg-orange-600">
                  📥 Download CSV
                </SmallButton>
                <SmallButton 
                  onClick={() => setShowRawData(!showRawData)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {showRawData ? 'Hide Data' : 'Show Data'}
                </SmallButton>
              </div>
            </div>

            {showRawData && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.04]">
                    <tr className="text-left text-white/60">
                      <th className="px-3 py-2">Brand</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Agent</th>
                      <th className="px-3 py-2">Start Time</th>
                      <th className="px-3 py-2">End Time</th>
                      <th className="px-3 py-2">Duration</th>
                      <th className="px-3 py-2">Disposition</th>
                      <th className="px-3 py-2">SF Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.rawData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-white/40">
                          No data found for selected criteria
                        </td>
                      </tr>
                    ) : (
                      data.rawData.slice(0, 100).map((task) => (
                        <tr key={task.id} className="hover:bg-white/5">
                          <td className="px-3 py-2">
                            <div className="font-medium">{task.brand}</div>
                            <div className="text-xs text-white/50 truncate max-w-48">
                              {task.issueTopic}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{task.customerName}</div>
                            <div className="text-xs text-white/50">{task.email}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{task.agentName}</div>
                            <div className="text-xs text-white/50">{task.agentEmail}</div>
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {new Date(task.startTime).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {new Date(task.endTime).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-sm">
                            {formatDuration(task.durationSec)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-900/30 text-green-300 border border-green-700 text-xs">
                              {task.disposition}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {task.sfOrderLink ? (
                              <a 
                                href={task.sfOrderLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs underline"
                              >
                                View Order
                              </a>
                            ) : (
                              <span className="text-white/40">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {data.rawData.length > 100 && (
                  <p className="text-center text-white/60 mt-4 text-sm">
                    Showing first 100 of {data.rawData.length} records • Download CSV for complete data
                  </p>
                )}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-6">
          <div className="text-center text-white/60 py-12">
            Select a date range and click "Load Analytics" to view Yotpo performance data
          </div>
        </Card>
      )}
    </div>
  );
}

