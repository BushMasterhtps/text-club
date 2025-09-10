'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/app/_components/Card';
import { SmallButton } from '@/app/_components/SmallButton';

// Typography components
function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-bold text-white/90 tracking-tight">{children}</h1>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white/90 tracking-tight">{children}</h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-white/90 tracking-tight">{children}</h3>
  );
}
import ThemeToggle from '@/app/_components/ThemeToggle';
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
  Line,
  Area,
  AreaChart
} from 'recharts';

// Types
interface OverviewStats {
  totalCompletedToday: number;
  totalCompleted: number;
  avgHandleTime: number;
  activeAgents: number;
  tasksInProgress: number;
  pendingTasks: number;
}

interface TaskTypeStats {
  textClub: {
    completed: number;
    pending: number;
    avgDuration: number;
  };
  wodIvcs: {
    completed: number;
    pending: number;
    avgDuration: number;
  };
  emailRequests: {
    completed: number;
    pending: number;
    avgDuration: number;
  };
  standaloneRefunds: {
    completed: number;
    pending: number;
    avgDuration: number;
  };
}

interface AgentStatus {
  id: string;
  name: string;
  email: string;
  isOnline: boolean;
  currentTask: string | null;
  tasksCompletedToday: number;
  lastSeen: string;
}

interface DailyTrend {
  date: string;
  textClub: number;
  wodIvcs: number;
  emailRequests: number;
  standaloneRefunds: number;
  total: number;
}

export default function AnalyticsPage() {
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateRange, setSelectedDateRange] = useState<'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('today');
  const [compareMode, setCompareMode] = useState(false);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Date range helper
  const getDateRange = (range: string) => {
    const today = new Date();
    let start: Date, end: Date;

    switch (range) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'week':
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        end = new Date(today);
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today);
        break;
      case 'quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        end = new Date(today);
        break;
      case 'year':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          return {
            start: customStartDate,
            end: customEndDate
          };
        }
        // Fallback to today if custom dates not set
        start = new Date(today);
        end = new Date(today);
        break;
      default:
        start = new Date(today);
        end = new Date(today);
    }

    // Format dates as YYYY-MM-DD without timezone conversion
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      start: formatDate(start),
      end: formatDate(end)
    };
  };

  // Load overview data
  const loadOverviewData = async () => {
    try {
      setLoading(true);
      const dateRange = getDateRange(selectedDateRange);
      
      // Load all analytics data in parallel
      const [overviewRes, taskStatsRes, agentsRes, trendsRes] = await Promise.all([
        fetch(`/api/analytics/overview?startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/analytics/task-types?startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch('/api/analytics/agent-status'),
        fetch(`/api/analytics/daily-trends?startDate=${dateRange.start}&endDate=${dateRange.end}`)
      ]);

      if (overviewRes.ok) {
        const overviewData = await overviewRes.json();
        if (overviewData.success) {
          setOverviewStats(overviewData.data);
        }
      }

      if (taskStatsRes.ok) {
        const taskData = await taskStatsRes.json();
        if (taskData.success) {
          setTaskTypeStats(taskData.data);
        }
      }

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        if (agentsData.success) {
          setAgentStatus(agentsData.data);
        }
      }

      if (trendsRes.ok) {
        const trendsData = await trendsRes.json();
        if (trendsData.success) {
          setDailyTrends(trendsData.data);
        }
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewData();
  }, [selectedDateRange]);

  // Format duration helper
  const formatDuration = (seconds: number) => {
    if (!seconds) return "0m";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Get status color
  const getStatusColor = (isOnline: boolean) => {
    return isOnline ? 'text-green-400' : 'text-gray-400';
  };

  // Get status dot color
  const getStatusDotColor = (isOnline: boolean) => {
    return isOnline ? 'bg-green-400' : 'bg-gray-400';
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
        <div className="flex justify-end p-6">
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <H2>Loading Analytics...</H2>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-white/10">
        <div>
          <H1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            📊 Team Analytics
          </H1>
          <p className="text-white/60 mt-2">
            Real-time insights into your team's performance and task completion
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="p-6 space-y-8">
        {/* Date Range Selector */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <H3>📅 Time Period</H3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-white/60">Compare Mode:</label>
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {['today', 'week', 'month', 'quarter', 'year'].map((range) => (
                <button
                  key={range}
                  onClick={() => setSelectedDateRange(range as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedDateRange === range
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
              <button
                onClick={() => setSelectedDateRange('custom')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedDateRange === 'custom'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                Custom Range
              </button>
            </div>
            
            {selectedDateRange === 'custom' && (
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white/60">From:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white/60">To:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <SmallButton 
                  onClick={() => {
                    if (customStartDate && customEndDate) {
                      setDateRange({ start: customStartDate, end: customEndDate });
                    }
                  }}
                  disabled={!customStartDate || !customEndDate}
                >
                  Apply
                </SmallButton>
              </div>
            )}
          </div>
        </Card>

        {/* Overview Stats */}
        {overviewStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-200 text-sm font-medium">Completed Today</p>
                  <p className="text-3xl font-bold text-white mt-1">{overviewStats.totalCompletedToday}</p>
                </div>
                <div className="text-4xl">✅</div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-200 text-sm font-medium">Total Completed</p>
                  <p className="text-3xl font-bold text-white mt-1">{overviewStats.totalCompleted.toLocaleString()}</p>
                </div>
                <div className="text-4xl">📈</div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-purple-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-200 text-sm font-medium">Avg Handle Time</p>
                  <p className="text-3xl font-bold text-white mt-1">{formatDuration(overviewStats.avgHandleTime)}</p>
                </div>
                <div className="text-4xl">⏱️</div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-orange-500/20 to-orange-600/20 border-orange-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-200 text-sm font-medium">Active Agents</p>
                  <p className="text-3xl font-bold text-white mt-1">{overviewStats.activeAgents}</p>
                </div>
                <div className="text-4xl">👥</div>
              </div>
            </Card>
          </div>
        )}

        {/* Task Type Breakdown */}
        {taskTypeStats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <H3 className="mb-4">📊 Task Type Performance</H3>
              <div className="space-y-4">
                {Object.entries(taskTypeStats).map(([type, stats]) => (
                  <div key={type} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {type === 'textClub' && '💬'}
                        {type === 'wodIvcs' && '📋'}
                        {type === 'emailRequests' && '📧'}
                        {type === 'standaloneRefunds' && '💰'}
                      </div>
                      <div>
                        <p className="font-semibold text-white capitalize">
                          {type.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="text-sm text-white/60">
                          {stats.pending} pending • {formatDuration(stats.avgDuration)} avg
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">{stats.completed}</p>
                      <p className="text-sm text-white/60">completed</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <H3 className="mb-4">📈 Task Distribution</H3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(taskTypeStats).map(([type, stats]) => ({
                        name: type.replace(/([A-Z])/g, ' $1').trim(),
                        value: stats.completed,
                        color: type === 'textClub' ? '#3B82F6' : 
                               type === 'wodIvcs' ? '#10B981' : 
                               type === 'emailRequests' ? '#F59E0B' : '#8B5CF6'
                      }))}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {Object.entries(taskTypeStats).map(([type, stats], index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={type === 'textClub' ? '#3B82F6' : 
                                type === 'wodIvcs' ? '#10B981' : 
                                type === 'emailRequests' ? '#F59E0B' : '#8B5CF6'} 
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* Agent Status */}
        <Card className="p-6">
          <H3 className="mb-4">👥 Live Agent Status</H3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentStatus.map((agent) => (
              <div key={agent.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getStatusDotColor(agent.isOnline)}`}></div>
                    <span className="font-semibold text-white">{agent.name}</span>
                  </div>
                  <span className={`text-sm ${getStatusColor(agent.isOnline)}`}>
                    {agent.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-sm text-white/60 mb-2">{agent.email}</p>
                <div className="space-y-1">
                  <p className="text-sm text-white/80">
                    Completed Today: <span className="font-semibold text-green-400">{agent.tasksCompletedToday}</span>
                  </p>
                  {agent.currentTask && (
                    <p className="text-sm text-white/80">
                      Current: <span className="font-semibold text-blue-400">{agent.currentTask}</span>
                    </p>
                  )}
                  <p className="text-xs text-white/50">
                    Last seen: {new Date(agent.lastSeen).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Daily Trends Chart */}
        {dailyTrends.length > 0 && (
          <Card className="p-6">
            <H3 className="mb-4">📈 Daily Performance Trends</H3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrends}>
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
                  <Area type="monotone" dataKey="textClub" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="wodIvcs" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="emailRequests" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="standaloneRefunds" stackId="1" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <Card className="p-6">
          <H3 className="mb-4">🚀 Quick Actions</H3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SmallButton 
              onClick={() => window.open('/manager', '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white p-4 h-auto flex flex-col items-center gap-2"
            >
              <div className="text-2xl">👨‍💼</div>
              <div className="text-center">
                <div className="font-semibold">Manager Dashboard</div>
                <div className="text-sm opacity-80">Task Management & Team Overview</div>
              </div>
            </SmallButton>

            <SmallButton 
              onClick={() => window.open('/wod-ivcs', '_blank')}
              className="bg-green-600 hover:bg-green-700 text-white p-4 h-auto flex flex-col items-center gap-2"
            >
              <div className="text-2xl">📋</div>
              <div className="text-center">
                <div className="font-semibold">WOD/IVCS Tasks</div>
                <div className="text-sm opacity-80">Order Processing & Inventory</div>
              </div>
            </SmallButton>

            <SmallButton 
              onClick={() => window.open('/email-requests', '_blank')}
              className="bg-orange-600 hover:bg-orange-700 text-white p-4 h-auto flex flex-col items-center gap-2"
            >
              <div className="text-2xl">📧</div>
              <div className="text-center">
                <div className="font-semibold">Email Requests</div>
                <div className="text-sm opacity-80">Customer Support & Inquiries</div>
              </div>
            </SmallButton>
          </div>
        </Card>
      </div>
    </main>
  );
}
