"use client";

import React, { useState, useEffect } from 'react';
import { SmallButton } from '@/app/_components/SmallButton';

// Local PrimaryButton component
function PrimaryButton({ 
  children, 
  disabled = false, 
  className = "",
  onClick 
}: { 
  children: React.ReactNode; 
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold bg-gradient-to-r from-sky-500/90 to-indigo-500/90 hover:from-sky-500 hover:to-indigo-500 text-white ring-1 ring-sky-400/40 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

interface AnalyticsData {
  summary: {
    totalCompleted: number;
    avgDuration: number;
    totalCount: number;
  };
  completedWork: Array<{
    id: string;
    endTime: string;
    durationSec: number | null;
    disposition: string | null;
    assignedTo: {
      name: string;
      email: string;
    } | null;
    wodIvcsSource: string | null;
    documentNumber: string | null;
    webOrder: string | null;
    customerName: string | null;
    amount: number | null;
    webOrderDifference: number | null;
    purchaseDate: string | null;
  }>;
  dispositionBreakdown: Record<string, { count: number; totalDuration: number; avgDuration: number }>;
  agentBreakdown: Record<string, { name: string; count: number; totalDuration: number; avgDuration: number; dispositions: Record<string, number> }>;
  dailyTrends: Array<{ date: string; count: number; totalDuration: number; avgDuration: number; dispositions: Record<string, number> }>;
  comparisonData: {
    totalCompleted: number;
    avgDuration: number;
    completedChange: number;
    durationChange: number;
  } | null;
  pagination: {
    limit: number;
    offset: number;
    totalCount: number;
    hasMore: boolean;
  };
}

interface AnalyticsSectionProps {
  onClose?: () => void;
}

export function AnalyticsSection({ onClose }: AnalyticsSectionProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [importAnalytics, setImportAnalytics] = useState<any>(null);
  const [detailedAnalytics, setDetailedAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null); // Separate error for main analytics
  const [detailedAnalyticsError, setDetailedAnalyticsError] = useState<string | null>(null); // Separate error for detailed analytics
  
  // Date range state
  const [dateMode, setDateMode] = useState<'single' | 'compare'>('single');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [compareStartDate, setCompareStartDate] = useState<string>('');
  const [compareEndDate, setCompareEndDate] = useState<string>('');
  
  // Filter state
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dispositionFilter, setDispositionFilter] = useState<string>('all');
  const [agents, setAgents] = useState<Array<{ id: string; name: string; email: string }>>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Initialize dates
  useEffect(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    setStartDate(weekAgo.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
    
    // Set comparison dates to previous week
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const threeWeeksAgo = new Date(today);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
    
    setCompareStartDate(threeWeeksAgo.toISOString().split('T')[0]);
    setCompareEndDate(twoWeeksAgo.toISOString().split('T')[0]);
  }, []);

  // Load agents and import analytics
  useEffect(() => {
    loadAgents();
    loadImportAnalytics();
  }, []);

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/manager/agents');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAgents(data.agents);
        }
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  // Load import analytics (last 3 sessions)
  const loadImportAnalytics = async () => {
    try {
      const response = await fetch('/api/manager/dashboard/wod-ivcs-import-analytics');
      const data = await response.json();
      
      if (data.success) {
        setImportAnalytics(data.data);
      }
    } catch (error) {
      console.error('Error loading import analytics:', error);
    }
  };

  // Load detailed analytics for date range
  const loadDetailedAnalytics = async () => {
    if (!startDate || !endDate) return;
    
    setDetailedAnalyticsError(null); // Clear previous error
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const response = await fetch(`/api/manager/dashboard/wod-ivcs-detailed-analytics?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDetailedAnalytics(data.data);
        } else {
          setDetailedAnalyticsError(data.error || 'Failed to load detailed analytics');
          console.error('Detailed analytics API error:', data.error);
        }
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        setDetailedAnalyticsError('Failed to load detailed analytics');
        console.error('Detailed analytics HTTP error:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error loading detailed analytics:', error);
      setDetailedAnalyticsError('Failed to load detailed analytics');
    }
  };

  const loadAnalytics = async () => {
    if (!startDate || !endDate) return;
    
    setLoading(true);
    setAnalyticsError(null); // Clear previous error
    
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        agentFilter,
        dispositionFilter,
        limit: pageSize.toString(),
        offset: ((currentPage - 1) * pageSize).toString()
      });

      if (dateMode === 'compare' && compareStartDate && compareEndDate) {
        params.append('compareStartDate', compareStartDate);
        params.append('compareEndDate', compareEndDate);
      }

      const response = await fetch(`/api/manager/dashboard/wod-ivcs-analytics?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAnalyticsData(data.data);
        } else {
          setAnalyticsError(data.error || 'Failed to load analytics');
          console.error('Analytics API error:', data.error);
        }
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        setAnalyticsError('Failed to load analytics');
        console.error('Analytics HTTP error:', response.status, errorText);
      }
    } catch (error) {
      console.error('Analytics loading error:', error);
      setAnalyticsError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
    loadDetailedAnalytics();
  }, [startDate, endDate, compareStartDate, compareEndDate, agentFilter, dispositionFilter, currentPage, pageSize]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const exportToCSV = async () => {
    if (!startDate || !endDate) return;
    
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        agentFilter,
        dispositionFilter
      });

      const response = await fetch(`/api/manager/dashboard/wod-ivcs-analytics/export?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export data');
      }

      // Get the CSV content
      const csvContent = await response.text();
      
      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wod-ivcs-analytics-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      setError(`Failed to export CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const exportDuplicateAnalysisToCSV = () => {
    if (!detailedAnalytics?.duplicateAnalysis?.duplicateDetails) return;
    
    const headers = [
      'Duplicate Order',
      'Web Order',
      'Customer',
      'Source',
      'Original Import Date',
      'Status',
      'Completed By',
      'Completed By Email',
      'Completed On',
      'Disposition',
      'Amount',
      'NetSuite Total',
      'Web Total',
      'Web vs NS Difference',
      'Warehouse Status',
      'Age (Days)',
      'Last Seen Date'
    ];
    
    const rows = detailedAnalytics.duplicateAnalysis.duplicateDetails.map((detail: any) => [
      detail.duplicateTask.documentNumber || 'N/A',
      detail.duplicateTask.webOrder || 'N/A',
      detail.duplicateTask.customerName || 'Unknown',
      detail.duplicateTask.source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web Difference' :
      detail.duplicateTask.source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
      detail.duplicateTask.source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : detail.duplicateTask.source,
      new Date(detail.originalTask.createdAt).toLocaleDateString(),
      detail.wasImported ? 'Imported' : 'Filtered Out',
      detail.originalTask.completedBy || 'N/A',
      detail.originalTask.completedByEmail || 'N/A',
      detail.originalTask.completedOn ? new Date(detail.originalTask.completedOn).toLocaleDateString() : 'N/A',
      detail.originalTask.disposition || 'N/A',
      detail.originalTask.amount ? `$${Number(detail.originalTask.amount).toFixed(2)}` : 'N/A',
      detail.originalTask.netSuiteTotal ? `$${Number(detail.originalTask.netSuiteTotal).toFixed(2)}` : 'N/A',
      detail.originalTask.webTotal ? `$${Number(detail.originalTask.webTotal).toFixed(2)}` : 'N/A',
      detail.originalTask.webVsNsDifference ? `$${Number(detail.originalTask.webVsNsDifference).toFixed(2)}` : 'N/A',
      detail.originalTask.warehouseEdgeStatus || 'N/A',
      detail.ageInDays,
      detail.lastSeenDate ? new Date(detail.lastSeenDate).toLocaleDateString() : 'N/A'
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wod-ivcs-duplicate-analysis-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const exportStaleOrdersToCSV = () => {
    if (!detailedAnalytics?.duplicateAnalysis?.staleOrders) return;
    
    const headers = [
      'Order Number',
      'Web Order',
      'Customer',
      'Source',
      'Times Seen',
      'First Seen Date',
      'Last Seen Date',
      'Days Since First Seen',
      'Completed By',
      'Completed By Email',
      'Completed On',
      'Disposition',
      'Amount',
      'NetSuite Total',
      'Web Total',
      'Web vs NS Difference',
      'Warehouse Status',
      'Purchase Date',
      'Age (Days)'
    ];
    
    const rows = detailedAnalytics.duplicateAnalysis.staleOrders.map((order: any) => [
      order.documentNumber || 'N/A',
      order.webOrder || 'N/A',
      order.customerName || 'Unknown',
      order.source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web Difference' :
      order.source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
      order.source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : order.source,
      order.frequency,
      new Date(order.firstSeen).toLocaleDateString(),
      new Date(order.lastSeen).toLocaleDateString(),
      order.daysSinceFirstSeen,
      order.originalTask?.completedBy || 'N/A',
      order.originalTask?.completedByEmail || 'N/A',
      order.originalTask?.completedAt ? new Date(order.originalTask.completedAt).toLocaleDateString() : 'N/A',
      order.originalTask?.disposition || 'N/A',
      order.originalTask?.amount ? `$${Number(order.originalTask.amount).toFixed(2)}` : 'N/A',
      order.originalTask?.netSuiteTotal ? `$${Number(order.originalTask.netSuiteTotal).toFixed(2)}` : 'N/A',
      order.originalTask?.webTotal ? `$${Number(order.originalTask.webTotal).toFixed(2)}` : 'N/A',
      order.originalTask?.webVsNsDifference ? `$${Number(order.originalTask.webVsNsDifference).toFixed(2)}` : 'N/A',
      order.originalTask?.warehouseEdgeStatus || 'N/A',
      order.originalTask?.purchaseDate ? new Date(order.originalTask.purchaseDate).toLocaleDateString() : 'N/A',
      order.ageInDays
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wod-ivcs-stale-orders-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-red-400';
    if (change < 0) return 'text-green-400';
    return 'text-white/60';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return '↗️';
    if (change < 0) return '↘️';
    return '→';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">📈 WOD/IVCS Analytics</h2>
        <div className="flex gap-2">
          <SmallButton onClick={loadAnalytics} disabled={loading}>
            {loading ? 'Loading...' : '🔄 Refresh'}
          </SmallButton>
          {analyticsData && (
            <PrimaryButton onClick={exportToCSV}>
              📊 Export CSV
            </PrimaryButton>
          )}
          {onClose && (
            <SmallButton onClick={onClose}>
              ✕ Close
            </SmallButton>
          )}
        </div>
      </div>

      {/* Date Range Controls */}
      <div className="bg-white/5 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Date Mode:</label>
          <div className="flex gap-2">
            <button
              onClick={() => setDateMode('single')}
              className={`px-3 py-1 rounded text-sm ${
                dateMode === 'single' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Single Range
            </button>
            <button
              onClick={() => setDateMode('compare')}
              className={`px-3 py-1 rounded text-sm ${
                dateMode === 'compare' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Compare Ranges
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {dateMode === 'compare' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Compare Start Date</label>
              <input
                type="date"
                value={compareStartDate}
                onChange={(e) => setCompareStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Compare End Date</label>
              <input
                type="date"
                value={compareEndDate}
                onChange={(e) => setCompareEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white/5 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Agents</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Disposition</label>
            <select
              value={dispositionFilter}
              onChange={(e) => setDispositionFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Dispositions</option>
              <option value="Completed - Fixed Amounts">Completed - Fixed Amounts</option>
              <option value="Unable to Complete">Unable to Complete</option>
            </select>
          </div>
        </div>
      </div>

      {(analyticsError || detailedAnalyticsError) && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200">
          {error}
        </div>
      )}

      {analyticsData && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{analyticsData.summary.totalCompleted}</div>
              <div className="text-sm text-white/60">Total Completed</div>
              {analyticsData.comparisonData && (
                <div className={`text-xs mt-1 ${getChangeColor(analyticsData.comparisonData.completedChange)}`}>
                  {getChangeIcon(analyticsData.comparisonData.completedChange)} {Math.abs(analyticsData.comparisonData.completedChange).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{formatDuration(analyticsData.summary.avgDuration)}</div>
              <div className="text-sm text-white/60">Avg Duration</div>
              {analyticsData.comparisonData && (
                <div className={`text-xs mt-1 ${getChangeColor(analyticsData.comparisonData.durationChange)}`}>
                  {getChangeIcon(analyticsData.comparisonData.durationChange)} {Math.abs(analyticsData.comparisonData.durationChange).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{analyticsData.summary.totalCount}</div>
              <div className="text-sm text-white/60">Total Records</div>
            </div>
          </div>

          {/* Disposition Breakdown */}
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">📊 Disposition Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(analyticsData.dispositionBreakdown).map(([disposition, data]) => (
                <div key={disposition} className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{disposition}</span>
                    <span className="text-blue-400 font-bold">{data.count}</span>
                  </div>
                  <div className="text-sm text-white/60 mt-1">
                    Avg: {formatDuration(data.avgDuration)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Performance */}
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">👥 Agent Performance</h3>
            <div className="space-y-3">
              {Object.entries(analyticsData.agentBreakdown).map(([agentId, data]) => (
                <div key={agentId} className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{data.name}</span>
                    <span className="text-green-400 font-bold">{data.count} tasks</span>
                  </div>
                  <div className="text-sm text-white/60">
                    Avg Duration: {formatDuration(data.avgDuration)}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {Object.entries(data.dispositions).map(([disposition, count]) => (
                      <span key={disposition} className="text-xs bg-white/10 px-2 py-1 rounded">
                        {disposition}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Trends */}
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">📈 Daily Trends</h3>
            <div className="space-y-2">
              {analyticsData.dailyTrends.map((day) => (
                <div key={day.date} className="flex justify-between items-center bg-white/5 rounded p-2">
                  <span className="font-medium">{formatDate(day.date)}</span>
                  <div className="flex gap-4 text-sm">
                    <span className="text-blue-400">{day.count} tasks</span>
                    <span className="text-white/60">Avg: {formatDuration(day.avgDuration)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Last 3 Import Sessions */}
          {importAnalytics && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">📊 Last 3 Import Sessions</h3>
              <div className="space-y-4">
                {importAnalytics.lastThreeImports.map((session, index) => (
                  <div key={session.id} className="bg-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h4 className="font-medium text-white">
                          Import #{importAnalytics.totalSessions - index}
                        </h4>
                        <p className="text-sm text-white/60">{session.formattedTime}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-white">{session.totalTasks} tasks</div>
                        {session.totalDuplicates > 0 && (
                          <div className="text-sm text-orange-400">{session.totalDuplicates} duplicates</div>
                        )}
                        {session.totalPreviouslyCompleted > 0 && (
                          <div className="text-sm text-red-400">{session.totalPreviouslyCompleted} previously completed</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Sources breakdown */}
                    <div className="space-y-2">
                      {Object.entries(session.sources).map(([source, sourceData]: [string, any]) => (
                        <div key={source} className="bg-white/5 rounded p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-white">
                              {source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web Difference' :
                               source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
                               source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : source}
                            </span>
                            <div className="flex gap-3 text-sm">
                              <span className="text-green-400">{sourceData.total} imported</span>
                              {sourceData.duplicates > 0 && (
                                <span className="text-orange-400">{sourceData.duplicates} duplicates</span>
                              )}
                              {sourceData.previouslyCompleted > 0 && (
                                <span className="text-red-400">{sourceData.previouslyCompleted} previously completed</span>
                              )}
                            </div>
                          </div>
                          
                          {/* Duplicate details */}
                          {sourceData.duplicateDetails.length > 0 && (
                            <div className="mt-2">
                              <h5 className="text-sm font-medium text-orange-400 mb-2">Duplicate Details:</h5>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {sourceData.duplicateDetails.map((detail: any, idx: number) => (
                                  <div key={idx} className="bg-orange-500/10 border border-orange-500/20 rounded p-2 text-xs">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="text-white font-medium">
                                          {detail.duplicateTask.documentNumber || detail.duplicateTask.webOrder} - {detail.duplicateTask.customerName}
                                        </div>
                                        <div className="text-white/60">
                                          Duplicate of task completed by {detail.originalTask.completedBy}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-orange-400 font-medium">
                                          {detail.originalTask.disposition}
                                        </div>
                                        <div className="text-white/60">
                                          {detail.ageInDays} days ago
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                
                {importAnalytics.lastThreeImports.length === 0 && (
                  <div className="text-center py-8 text-white/60">
                    No import sessions found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detailed Import Analytics */}
          {detailedAnalytics && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">📈 Detailed Import Analytics</h3>
              <div className="mb-4 text-sm text-white/60">
                Analysis for {new Date(detailedAnalytics.dateRange.startDate).toLocaleDateString()} - {new Date(detailedAnalytics.dateRange.endDate).toLocaleDateString()}
              </div>
              
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{detailedAnalytics.summary.totalImported}</div>
                  <div className="text-sm text-white/60">Total Imported</div>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-orange-400">{detailedAnalytics.summary.totalDuplicates}</div>
                  <div className="text-sm text-white/60">Duplicates Found</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{detailedAnalytics.summary.totalPreviouslyCompleted}</div>
                  <div className="text-sm text-white/60">Previously Completed</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-400">{detailedAnalytics.summary.totalSessions}</div>
                  <div className="text-sm text-white/60">Import Sessions</div>
                </div>
              </div>

              {/* Import Sessions Breakdown */}
              {detailedAnalytics.importSessions.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-white mb-3">📅 Import Sessions Breakdown</h4>
                  <div className="space-y-3">
                    {detailedAnalytics.importSessions.map((session: any, index: number) => (
                      <div key={session.id} className="bg-white/5 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h5 className="font-medium text-white">Session {index + 1}</h5>
                            <p className="text-sm text-white/60">{session.formattedTime}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">{session.totalTasks} tasks</div>
                            {session.totalDuplicates > 0 && (
                              <div className="text-sm text-orange-400">{session.totalDuplicates} duplicates</div>
                            )}
                            {session.totalPreviouslyCompleted > 0 && (
                              <div className="text-sm text-red-400">{session.totalPreviouslyCompleted} previously completed</div>
                            )}
                          </div>
                        </div>
                        
                        {/* Sources breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {Object.entries(session.sources).map(([source, sourceData]: [string, any]) => (
                            <div key={source} className="bg-white/5 rounded p-3">
                              <div className="font-medium text-white mb-2">
                                {source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web Difference' :
                                 source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
                                 source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : source}
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-white/60">Imported:</span>
                                  <span className="text-green-400 font-medium">{sourceData.total}</span>
                                </div>
                                {sourceData.duplicates > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-white/60">Duplicates:</span>
                                    <span className="text-orange-400 font-medium">{sourceData.duplicates}</span>
                                  </div>
                                )}
                                {sourceData.previouslyCompleted > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-white/60">Previously Completed:</span>
                                    <span className="text-red-400 font-medium">{sourceData.previouslyCompleted}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Duplicate Analysis */}
              {detailedAnalytics.duplicateAnalysis.totalDuplicates > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-white mb-3">🔍 Detailed Duplicate Analysis</h4>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 mb-4">
                    <div className="text-sm text-orange-300 mb-3">
                      {detailedAnalytics.duplicateAnalysis.totalDuplicates} duplicate tasks were detected during CSV import
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {Object.entries(detailedAnalytics.duplicateAnalysis.duplicateGroups).map(([source, count]) => (
                        <div key={source} className="bg-white/5 rounded p-3 text-center">
                          <div className="text-lg font-bold text-orange-400">{count}</div>
                          <div className="text-sm text-white/60">
                            {source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web Difference' :
                             source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
                             source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : source}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stale Orders Report (5+ days old, multiple imports) */}
                  {detailedAnalytics.duplicateAnalysis.staleOrders && detailedAnalytics.duplicateAnalysis.staleOrders.length > 0 && (
                    <div className="mb-6">
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-semibold text-red-300 mb-1">🚨 Stale Orders Report (5+ Days Old)</h4>
                            <p className="text-sm text-red-200/80">
                              Orders that keep appearing in imports despite being completed. These may need system admin review.
                            </p>
                          </div>
                          <PrimaryButton onClick={() => exportStaleOrdersToCSV()}>
                            📊 Export Stale Orders CSV
                          </PrimaryButton>
                        </div>
                        <div className="text-lg font-bold text-red-300">
                          {detailedAnalytics.duplicateAnalysis.staleOrders.length} stale orders identified
                        </div>
                      </div>

                      <div className="bg-white/5 rounded-lg p-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/20">
                              <th className="text-left py-2">Order</th>
                              <th className="text-left py-2">Customer</th>
                              <th className="text-left py-2">Source</th>
                              <th className="text-left py-2">Times Seen</th>
                              <th className="text-left py-2">First Seen</th>
                              <th className="text-left py-2">Last Seen</th>
                              <th className="text-left py-2">Days Old</th>
                              <th className="text-left py-2">Completed By</th>
                              <th className="text-left py-2">Disposition</th>
                              <th className="text-left py-2">Amount</th>
                              <th className="text-left py-2">Warehouse Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailedAnalytics.duplicateAnalysis.staleOrders.map((order: any, index: number) => (
                              <tr key={index} className="border-b border-white/10">
                                <td className="py-2">
                                  <div className="font-medium text-white">
                                    {order.documentNumber || order.webOrder}
                                  </div>
                                </td>
                                <td className="py-2 text-white/80">{order.customerName || 'Unknown'}</td>
                                <td className="py-2 text-white/80">
                                  {order.source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web' :
                                   order.source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
                                   order.source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : order.source}
                                </td>
                                <td className="py-2">
                                  <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs font-bold">
                                    {order.frequency}x
                                  </span>
                                </td>
                                <td className="py-2 text-white/80">
                                  {new Date(order.firstSeen).toLocaleDateString()}
                                </td>
                                <td className="py-2 text-white/80">
                                  {new Date(order.lastSeen).toLocaleDateString()}
                                </td>
                                <td className="py-2">
                                  <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">
                                    {order.daysSinceFirstSeen} days
                                  </span>
                                </td>
                                <td className="py-2 text-white/80">
                                  {order.originalTask?.completedBy || 'N/A'}
                                </td>
                                <td className="py-2">
                                  <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                                    {order.originalTask?.disposition || 'N/A'}
                                  </span>
                                </td>
                                <td className="py-2 text-white/80">
                                  {order.originalTask?.amount ? `$${Number(order.originalTask.amount).toFixed(2)}` : 'N/A'}
                                </td>
                                <td className="py-2 text-white/80">
                                  {order.originalTask?.warehouseEdgeStatus || 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Duplicate Details Table */}
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="font-medium text-white">📋 All Duplicate Details</h5>
                      <PrimaryButton onClick={exportDuplicateAnalysisToCSV}>
                        📊 Export CSV
                      </PrimaryButton>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="text-left py-2">Duplicate Order</th>
                            <th className="text-left py-2">Customer</th>
                            <th className="text-left py-2">Original Import Date</th>
                            <th className="text-left py-2">Status</th>
                            <th className="text-left py-2">Completed By</th>
                            <th className="text-left py-2">Completed On</th>
                            <th className="text-left py-2">Disposition</th>
                            <th className="text-left py-2">Amount</th>
                            <th className="text-left py-2">Age (Days)</th>
                            <th className="text-left py-2">Last Seen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailedAnalytics.duplicateAnalysis.duplicateDetails.map((detail: any, index: number) => (
                            <tr key={index} className="border-b border-white/10">
                              <td className="py-2">
                                <div className="font-medium text-white">
                                  {detail.duplicateTask.documentNumber || detail.duplicateTask.webOrder}
                                </div>
                                <div className="text-xs text-white/60">
                                  {detail.duplicateTask.source === 'SO_VS_WEB_DIFFERENCE' ? 'SO vs Web' :
                                   detail.duplicateTask.source === 'ORDERS_NOT_DOWNLOADING' ? 'Orders Not Downloading' :
                                   detail.duplicateTask.source === 'INVALID_CASH_SALE' ? 'Invalid Cash Sale' : detail.duplicateTask.source}
                                </div>
                              </td>
                              <td className="py-2 text-white/80">{detail.duplicateTask.customerName}</td>
                              <td className="py-2 text-white/80">
                                {new Date(detail.originalTask.createdAt).toLocaleDateString()}
                              </td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  detail.wasImported ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                                }`}>
                                  {detail.wasImported ? 'Imported' : 'Filtered Out'}
                                </span>
                              </td>
                              <td className="py-2">
                                <div className="text-white/80">{detail.originalTask.completedBy || 'N/A'}</div>
                                {detail.originalTask.completedByEmail && (
                                  <div className="text-xs text-white/60">{detail.originalTask.completedByEmail}</div>
                                )}
                              </td>
                              <td className="py-2 text-white/80">
                                {detail.originalTask.completedOn ? new Date(detail.originalTask.completedOn).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="py-2">
                                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                                  {detail.originalTask.disposition || 'N/A'}
                                </span>
                              </td>
                              <td className="py-2 text-white/80">
                                {detail.originalTask.amount ? `$${Number(detail.originalTask.amount).toFixed(2)}` : 'N/A'}
                              </td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  detail.ageInDays <= 7 ? 'bg-green-500/20 text-green-300' :
                                  detail.ageInDays <= 30 ? 'bg-yellow-500/20 text-yellow-300' :
                                  'bg-red-500/20 text-red-300'
                                }`}>
                                  {detail.ageInDays} days
                                </span>
                              </td>
                              <td className="py-2 text-white/80 text-xs">
                                {detail.lastSeenDate ? new Date(detail.lastSeenDate).toLocaleDateString() : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {detailedAnalytics.importSessions.length === 0 && (
                <div className="text-center py-8 text-white/60">
                  No import sessions found for the selected date range
                </div>
              )}
            </div>
          )}

          {/* Completed Work Table */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">📋 Recent Completed Work</h3>
              <PrimaryButton onClick={exportToCSV}>
                📊 Export CSV
              </PrimaryButton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Agent</th>
                    <th className="text-left py-2">Source</th>
                    <th className="text-left py-2">Order ID</th>
                    <th className="text-left py-2">Customer</th>
                    <th className="text-left py-2">Disposition</th>
                    <th className="text-left py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.completedWork.map((task) => (
                    <tr key={task.id} className="border-b border-white/10">
                      <td className="py-2">{formatDate(task.endTime)}</td>
                      <td className="py-2">{task.assignedTo?.name || 'Unassigned'}</td>
                      <td className="py-2">{task.wodIvcsSource || 'Unknown'}</td>
                      <td className="py-2">
                        <div className="font-mono text-xs">
                          {task.documentNumber || task.webOrder || 'N/A'}
                        </div>
                      </td>
                      <td className="py-2">{task.customerName || 'N/A'}</td>
                      <td className="py-2">{task.disposition || 'Unknown'}</td>
                      <td className="py-2">{formatDuration(task.durationSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {analyticsData.pagination.totalCount > pageSize && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-white/60">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, analyticsData.pagination.totalCount)} of {analyticsData.pagination.totalCount} results
                </div>
                <div className="flex gap-2">
                  <SmallButton 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </SmallButton>
                  <span className="px-3 py-1 text-sm">{currentPage}</span>
                  <SmallButton 
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    disabled={!analyticsData.pagination.hasMore}
                  >
                    Next
                  </SmallButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
