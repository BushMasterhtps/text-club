'use client';

import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface AnalyticsData {
  summary: {
    totalCompleted: number;
    completionRate: number;
    avgDuration: number;
    unableToComplete: number;
    completedTrend: { change: number; percentage: number };
    completionRateTrend: { change: number; percentage: number };
    durationTrend: { change: number; percentage: number };
    unableTrend: { change: number; percentage: number };
  };
  comparison: {
    completedChange: number;
    completionRateChange: number;
    durationChange: number;
  };
  charts: {
    trend: {
      labels: string[];
      completed: number[];
      unable: number[];
      previousCompleted: number[];
      previousUnable: number[];
    };
    dispositions: {
      labels: string[];
      data: number[];
    };
  };
  detailedUnableBreakdown: Record<string, number>;
  emailDetails: Array<{
    taskId: string;
    sfOrderNumber: string;
    email: string;
    agentName: string;
    disposition: string;
    notes: string;
    createdAt: string;
    duration: number | null;
    startTime: string | null;
    endTime: string | null;
  }>;
}

export default function EmailRequestsAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [comparePeriod, setComparePeriod] = useState('previous');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dispositionFilter, setDispositionFilter] = useState('all');

  useEffect(() => {
    // Initialize dates to current month
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(startOfMonth.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      loadAnalytics();
    }
  }, [startDate, endDate, comparePeriod]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadAnalytics();
      }, 30000); // 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, startDate, endDate, comparePeriod]);

  const loadAnalytics = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/manager/dashboard/email-requests-analytics?startDate=${startDate}&endDate=${endDate}&comparePeriod=${comparePeriod}`
      );
      
      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Email Requests Analytics API error:', response.status, errorText);
        setError(`Failed to fetch analytics (${response.status}): ${errorText.substring(0, 200)}`);
        return;
      }

      const data = await response.json();

      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
        setError(null);
      } else {
        const errorMsg = data.error || 'Failed to load analytics';
        console.error('Email Requests Analytics API returned error:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load analytics data';
      console.error('Error loading Email Requests analytics:', err);
      setError(`Failed to fetch analytics: ${errorMsg}`);
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
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const getFilteredEmailDetails = () => {
    if (!analytics?.emailDetails) return [];
    
    return analytics.emailDetails.filter(task => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'completed' && !task.disposition.toLowerCase().includes('completed')) {
          return false;
        }
        if (statusFilter === 'unable' && !task.disposition.toLowerCase().includes('unable')) {
          return false;
        }
        if (statusFilter === 'pending' && !task.disposition.toLowerCase().includes('pending')) {
          return false;
        }
      }
      
      // Disposition filter
      if (dispositionFilter !== 'all') {
        if (dispositionFilter === 'completed' && !task.disposition.toLowerCase().includes('completed')) {
          return false;
        }
        if (dispositionFilter === 'unable' && !task.disposition.toLowerCase().includes('unable')) {
          return false;
        }
        if (dispositionFilter === 'pending' && !task.disposition.toLowerCase().includes('pending')) {
          return false;
        }
      }
      
      return true;
    });
  };

  const downloadCSV = () => {
    const filteredDetails = getFilteredEmailDetails();
    if (!filteredDetails.length) return;

    const headers = [
      'SF Order #',
      'Agent Name',
      'Agent Email',
      'Disposition',
      'Notes',
      'Created',
      'Duration (min)',
      'Start Time',
      'End Time',
      'Task ID'
    ];

    const csvRows = filteredDetails.map(task => [
      task.sfOrderNumber || '',
      task.agentName || '',
      task.email || '',
      task.disposition || '',
      task.notes || '',
      task.createdAt ? new Date(task.createdAt).toLocaleDateString('en-US') : '',
      task.duration || '',
      task.startTime || '',
      task.endTime || '',
      task.taskId || ''
    ]);

    // Sort by disposition (Unable to Complete first) and then by date
    csvRows.sort((a, b) => {
      const dispositionA = (a[3] || '').toLowerCase();
      const dispositionB = (b[3] || '').toLowerCase();
      
      if (dispositionA.includes('unable') && !dispositionB.includes('unable')) return -1;
      if (!dispositionA.includes('unable') && dispositionB.includes('unable')) return 1;
      
      const dateA = new Date(a[5] || 0);
      const dateB = new Date(b[5] || 0);
      return dateB.getTime() - dateA.getTime();
    });

    const csvContent = [headers, ...csvRows]
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Create filename with filter info
    let filename = `Email_Request_Details_${startDate}_to_${endDate}`;
    if (statusFilter !== 'all') {
      filename += `_${statusFilter}`;
    }
    if (dispositionFilter !== 'all') {
      filename += `_${dispositionFilter}`;
    }
    filename += '.csv';
    
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatComparison = (value: number, isPercentage = false) => {
    if (value > 0) {
      return <span className="text-green-400">+{isPercentage ? value.toFixed(1) + '%' : value}</span>;
    } else if (value < 0) {
      return <span className="text-red-400">{isPercentage ? value.toFixed(1) + '%' : value}</span>;
    } else {
      return <span className="text-gray-400">0{isPercentage ? '%' : ''}</span>;
    }
  };

  const formatTrend = (trend: { change: number; percentage: number }, inverted = false) => {
    // For inverted metrics (like "Unable to Complete"), decrease is good (green), increase is bad (red)
    const isPositive = inverted ? trend.change < 0 : trend.change > 0;
    const isNegative = inverted ? trend.change > 0 : trend.change < 0;
    
    if (isPositive) {
      return <span className="text-green-400 text-sm">↗ {trend.change > 0 ? '+' : ''}{trend.percentage.toFixed(1)}%</span>;
    } else if (isNegative) {
      return <span className="text-red-400 text-sm">↘ {trend.percentage.toFixed(1)}%</span>;
    } else {
      return <span className="text-gray-400 text-sm">→ 0.0%</span>;
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-2 text-gray-300">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg shadow p-6">
        <div className="bg-red-900/20 border border-red-500/30 rounded-md p-4">
          <div className="text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">📧 Email Requests Analytics</h2>
          <p className="text-gray-300 mt-1">Month-over-month analysis and disposition tracking</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Compare With</label>
            <select
              value={comparePeriod}
              onChange={(e) => setComparePeriod(e.target.value)}
              className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="previous">Previous Period</option>
              <option value="same-last-year">Same Period Last Year</option>
              <option value="none">No Comparison</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadAnalytics}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-md font-medium hover:from-blue-700 hover:to-blue-800 transition-colors"
            >
              Load Analytics
            </button>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setDateRange('thisMonth')}
            className="bg-gray-600 text-gray-200 px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-500 transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => setDateRange('lastMonth')}
            className="bg-gray-600 text-gray-200 px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-500 transition-colors"
          >
            Last Month
          </button>
          <button
            onClick={() => setDateRange('thisQuarter')}
            className="bg-gray-600 text-gray-200 px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-500 transition-colors"
          >
            This Quarter
          </button>
          <button
            onClick={() => setDateRange('thisYear')}
            className="bg-gray-600 text-gray-200 px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-500 transition-colors"
          >
            This Year
          </button>
          <div className="ml-4 flex items-center">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="autoRefresh" className="text-sm text-gray-300">Auto-refresh (30s)</label>
          </div>
        </div>
      </div>

      {analytics && (
        <>
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg p-6 text-center">
              <div className="text-3xl font-bold mb-2">{analytics.summary?.totalCompleted || 0}</div>
              <div className="text-sm opacity-90 mb-1">Total Completed</div>
              {analytics.summary?.completedTrend ? formatTrend(analytics.summary.completedTrend) : <span className="text-gray-400 text-sm">→ 0%</span>}
            </div>
            <div className="bg-gradient-to-br from-green-600 to-green-700 text-white rounded-lg p-6 text-center">
              <div className="text-3xl font-bold mb-2">{(analytics.summary?.completionRate || 0).toFixed(1)}%</div>
              <div className="text-sm opacity-90 mb-1">Completion Rate</div>
              {analytics.summary?.completionRateTrend ? formatTrend(analytics.summary.completionRateTrend) : <span className="text-gray-400 text-sm">→ 0%</span>}
            </div>
            <div className="bg-gradient-to-br from-yellow-600 to-yellow-700 text-white rounded-lg p-6 text-center">
              <div className="text-3xl font-bold mb-2">{analytics.summary?.avgDuration || 0}</div>
              <div className="text-sm opacity-90 mb-1">Avg Duration (min)</div>
              {analytics.summary?.durationTrend ? formatTrend(analytics.summary.durationTrend) : <span className="text-gray-400 text-sm">→ 0%</span>}
            </div>
            <div className="bg-gradient-to-br from-red-600 to-red-700 text-white rounded-lg p-6 text-center">
              <div className="text-3xl font-bold mb-2">{analytics.summary?.unableToComplete || 0}</div>
              <div className="text-sm opacity-90 mb-1">Unable to Complete</div>
              {analytics.summary?.unableTrend ? formatTrend(analytics.summary.unableTrend, true) : <span className="text-gray-400 text-sm">→ 0%</span>}
            </div>
          </div>

          {/* Comparison Cards */}
          {analytics.comparison && (analytics.comparison.completedChange !== 0 || analytics.comparison.completionRateChange !== 0 || analytics.comparison.durationChange !== 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-4 text-center border border-gray-600">
                <div className="text-xl font-bold mb-1">{formatComparison(analytics.comparison.completedChange || 0)}</div>
                <div className="text-xs text-gray-300">Completed vs Previous</div>
              </div>
              <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-4 text-center border border-gray-600">
                <div className="text-xl font-bold mb-1">{formatComparison(analytics.comparison.completionRateChange || 0, true)}</div>
                <div className="text-xs text-gray-300">Completion Rate Change</div>
              </div>
              <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-4 text-center border border-gray-600">
                <div className="text-xl font-bold mb-1">{formatComparison(analytics.comparison.durationChange || 0)}</div>
                <div className="text-xs text-gray-300">Duration Change (min)</div>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg shadow p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-white">Monthly Trend</h3>
              <Line
                data={{
                  labels: analytics.charts?.trend?.labels || [],
                  datasets: [
                    {
                      label: 'Completed',
                      data: analytics.charts?.trend?.completed || [],
                      borderColor: 'rgba(34, 197, 94, 1)',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      tension: 0.4,
                      borderWidth: 3
                    },
                    {
                      label: 'Unable to Complete',
                      data: analytics.charts?.trend?.unable || [],
                      borderColor: 'rgba(239, 68, 68, 1)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      tension: 0.4,
                      borderWidth: 3
                    },
                    ...(analytics.charts?.trend?.previousCompleted?.length > 0 ? [
                      {
                        label: 'Previous Period - Completed',
                        data: analytics.charts.trend.previousCompleted,
                        borderColor: 'rgba(34, 197, 94, 0.5)',
                        backgroundColor: 'rgba(34, 197, 94, 0.05)',
                        tension: 0.4,
                        borderWidth: 2,
                        borderDash: [5, 5]
                      },
                      {
                        label: 'Previous Period - Unable',
                        data: analytics.charts.trend.previousUnable,
                        borderColor: 'rgba(239, 68, 68, 0.5)',
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        tension: 0.4,
                        borderWidth: 2,
                        borderDash: [5, 5]
                      }
                    ] : [])
                  ]
                }}
                options={{
                  responsive: true,
                  scales: {
                    y: {
                      beginAtZero: true
                    }
                  }
                }}
              />
            </div>
            <div className="bg-gray-800 rounded-lg shadow p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-white">Disposition Breakdown</h3>
              <Doughnut
                data={{
                  labels: analytics.charts?.dispositions?.labels || [],
                  datasets: [{
                    data: analytics.charts?.dispositions?.data || [],
                    backgroundColor: [
                      'rgba(34, 197, 94, 0.8)',
                      'rgba(239, 68, 68, 0.8)',
                      'rgba(251, 191, 36, 0.8)',
                      'rgba(102, 126, 234, 0.8)',
                      'rgba(168, 85, 247, 0.8)',
                      'rgba(236, 72, 153, 0.8)',
                      'rgba(14, 165, 233, 0.8)'
                    ]
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom'
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Detailed Unable to Complete Breakdown */}
          <div className="bg-gray-800 rounded-lg shadow p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-white">Unable to Complete - Detailed Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analytics.detailedUnableBreakdown && Object.entries(analytics.detailedUnableBreakdown)
                .sort(([,a], [,b]) => b - a) // Sort by count descending
                .map(([reason, count], index) => (
                  <div key={index} className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                    <div className="text-sm text-red-400 font-medium mb-1 break-words">{reason}</div>
                    <div className="text-2xl font-bold text-red-300">{count}</div>
                  </div>
                ))}
              {(!analytics.detailedUnableBreakdown || Object.keys(analytics.detailedUnableBreakdown).length === 0) && (
                <div className="col-span-full text-center text-gray-400 py-8">
                  No "Unable to Complete" tasks found for the selected period
                </div>
              )}
            </div>
          </div>

          {/* Email Request Details */}
          <div className="bg-gray-800 rounded-lg shadow p-6 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Email Request Details</h3>
              <button
                onClick={downloadCSV}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                📥 Download CSV
              </button>
            </div>
            
            {/* Filter Controls */}
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-1">Filter by Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="unable">Unable to Complete</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-1">Filter by Disposition</label>
                <select
                  value={dispositionFilter}
                  onChange={(e) => setDispositionFilter(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Dispositions</option>
                  <option value="completed">Completed</option>
                  <option value="unable">Unable to Complete</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setDispositionFilter('all');
                  }}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
            
            {/* Results Count */}
            <div className="mb-4">
              <p className="text-sm text-gray-300">
                Showing {getFilteredEmailDetails().length} of {analytics.emailDetails?.length || 0} records
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-600">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">SF Order #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Agent Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Disposition</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Notes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-600">
                  {getFilteredEmailDetails().map((task, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">{task.sfOrderNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">{task.agentName}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          task.disposition.toLowerCase().includes('unable')
                            ? 'bg-red-900/30 text-red-300 border border-red-500/30'
                            : task.disposition.toLowerCase().includes('completed')
                            ? 'bg-green-900/30 text-green-300 border border-green-500/30'
                            : 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/30'
                        }`}>
                          {task.disposition}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-200 max-w-xs truncate">{task.notes}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
