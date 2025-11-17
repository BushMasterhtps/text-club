"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import ResolvedOrdersReport from "./ResolvedOrdersReport";
import ResolvedOrdersReportWithComments from "./ResolvedOrdersReportWithComments";

interface AnalyticsData {
  overview: {
    totalTasks: number;
    agingTasks: number;
    approachingTasks: number;
    unassignedTasks: number;
    completedTasks: number;
    pendingTasks: number;
    completionRate: number;
  };
  queueStats: Record<string, number>;
  priorityStats: Record<number, number>;
  agingBreakdown: {
    '0-2 days': number;
    '3-4 days': number;
    '5+ days': number;
  };
}

export default function HoldsAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [agingReport, setAgingReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'aging' | 'resolved' | 'resolved-comments'>('overview');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch overview analytics
      const overviewResponse = await fetch('/api/holds/analytics?type=overview');
      const overviewData = await overviewResponse.json();
      
      if (overviewData.success) {
        setAnalytics(overviewData.data);
      }

      // Fetch aging report
      const agingResponse = await fetch('/api/holds/analytics?type=aging');
      const agingData = await agingResponse.json();
      
      if (agingData.success) {
        setAgingReport(agingData.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">📈 Holds Analytics</h2>
        <div className="text-white/60">Loading analytics data...</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-xl font-semibold mb-4">📈 Holds Analytics</h2>
        
        {/* Tab Navigation */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('aging')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'aging'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Aging Report
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'resolved'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            📊 Resolved Orders
          </button>
          <button
            onClick={() => setActiveTab('resolved-comments')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'resolved-comments'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            📊 Resolved Orders with Comments
          </button>
        </div>

        {activeTab === 'overview' && analytics && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-200 mb-1">Total Tasks</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.totalTasks}</p>
              </div>
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-200 mb-1">Aging (5+ days)</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.agingTasks}</p>
              </div>
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Approaching (3-4 days)</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.approachingTasks}</p>
              </div>
              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-green-200 mb-1">Completion Rate</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.completionRate.toFixed(1)}%</p>
              </div>
            </div>

            {/* Queue Distribution */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Queue Distribution</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(analytics.queueStats).map(([queue, count]) => (
                  <div key={queue} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="font-medium text-white">{queue}</p>
                    <p className="text-2xl font-bold text-blue-300">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Distribution */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Priority Distribution</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(analytics.priorityStats).map(([priority, count]) => (
                  <div key={priority} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="font-medium text-white">Priority {priority}</p>
                    <p className="text-2xl font-bold text-purple-300">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Aging Breakdown */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Aging Breakdown</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <p className="font-medium text-green-200">0-2 days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown['0-2 days']}</p>
                </div>
                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                  <p className="font-medium text-yellow-200">3-4 days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown['3-4 days']}</p>
                </div>
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="font-medium text-red-200">5+ days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown['5+ days']}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'aging' && agingReport && (
          <div className="space-y-6">
            {/* Aging Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-200 mb-1">Aging Tasks (5+ days)</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.aging}</p>
              </div>
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Approaching (3-4 days)</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.approaching}</p>
              </div>
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-200 mb-1">Total Pending</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.total}</p>
              </div>
              <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-orange-200 mb-1">Unassigned</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.unassigned}</p>
              </div>
            </div>

            {/* Aging Tasks List */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Aging Tasks (5+ days)</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {agingReport.agingTasks.slice(0, 20).map((task: any) => (
                  <div
                    key={task.id}
                    className="p-3 bg-red-900/10 border border-red-500/30 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">
                          {task.customerName || 'Unknown Customer'}
                        </p>
                        <p className="text-sm text-white/60">
                          Order: {task.orderNumber || 'N/A'} | 
                          Email: {task.customerEmail || 'N/A'}
                        </p>
                        <p className="text-sm text-white/60">
                          Status: {task.status} | Priority: {task.priority}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="px-2 py-1 bg-red-900/50 text-red-200 rounded text-xs font-medium">
                          {task.daysSinceOrder} days
                        </div>
                        {task.assignedTo && (
                          <p className="text-xs text-blue-300 mt-1">
                            {task.assignedTo.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {agingReport.agingTasks.length > 20 && (
                  <p className="text-center text-white/60 text-sm">
                    ... and {agingReport.agingTasks.length - 20} more aging tasks
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'resolved' && (
          <div>
            {/* Resolved Orders Report is its own component */}
          </div>
        )}
      </Card>
      
      {/* Resolved Orders Report (separate card below) */}
      {activeTab === 'resolved' && (
        <div className="mt-6">
          <ResolvedOrdersReport />
        </div>
      )}
      
      {/* Resolved Orders Report with Comments (separate card below) */}
      {activeTab === 'resolved-comments' && (
        <div className="mt-6">
          <ResolvedOrdersReportWithComments />
        </div>
      )}
    </div>
  );
}
