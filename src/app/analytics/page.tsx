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
  totalInProgress: number;
  pendingByTaskType: {
    textClub: number;
    wodIvcs: number;
    emailRequests: number;
    standaloneRefunds: number;
  };
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
  tasksInProgress: number;
  lastSeen: string;
}

interface Task {
  id: string;
  taskType: string;
  brand?: string;
  phone?: string;
  text?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  startTime?: string;
  endTime?: string;
  durationSec?: number;
  disposition?: string;
  assistanceNotes?: string;
  managerResponse?: string;
  assignedToId?: string;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  };
}

interface TeamPerformanceData {
  agentId: string;
  agentName: string;
  agentEmail: string;
  taskType: string;
  completedCount: number;
  avgHandleTime: number;
  totalDuration: number;
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
  
  // Peek In Progress functionality
  const [peekModalOpen, setPeekModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
  const [agentTasks, setAgentTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  
  // Team Performance state
  const [teamPerformanceData, setTeamPerformanceData] = useState<TeamPerformanceData[]>([]);
  const [loadingTeamPerformance, setLoadingTeamPerformance] = useState(false);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('all');

  // Peek at agent's in-progress tasks
  const peekAgentTasks = async (agent: AgentStatus) => {
    setSelectedAgent(agent);
    setPeekModalOpen(true);
    setLoadingTasks(true);
    setAgentTasks([]);

    try {
      const response = await fetch(`/api/agent/tasks?email=${encodeURIComponent(agent.email)}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      
      if (data.success && data.tasks) {
        // Filter to only show IN_PROGRESS tasks
        const inProgressTasks = data.tasks.filter((task: any) => task.status === 'IN_PROGRESS');
        setAgentTasks(inProgressTasks);
      } else {
        console.error('Failed to fetch agent tasks:', data.error);
        setAgentTasks([]);
      }
    } catch (error) {
      console.error('Error fetching agent tasks:', error);
      setAgentTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

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

  // Load team performance data
  const loadTeamPerformanceData = async () => {
    setLoadingTeamPerformance(true);
    try {
      const dateRange = getDateRange(selectedDateRange);
      const response = await fetch(`/api/analytics/team-performance?startDate=${dateRange.start}&endDate=${dateRange.end}`);
      const data = await response.json();
      
      if (data.success) {
        setTeamPerformanceData(data.data);
      }
    } catch (error) {
      console.error('Error loading team performance data:', error);
    } finally {
      setLoadingTeamPerformance(false);
    }
  };

  useEffect(() => {
    loadOverviewData();
    loadTeamPerformanceData();
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
                      loadOverviewData();
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
                  <p className="text-orange-200 text-sm font-medium">Total In Progress</p>
                  <p className="text-3xl font-bold text-white mt-1">{overviewStats.totalInProgress}</p>
                </div>
                <div className="text-4xl">🔄</div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border-cyan-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-cyan-200 text-sm font-medium">Active Agents</p>
                  <p className="text-3xl font-bold text-white mt-1">{overviewStats.activeAgents}</p>
                </div>
                <div className="text-4xl">👥</div>
              </div>
            </Card>
          </div>
        )}

        {/* Pending Work in Queues */}
        <div className="bg-gray-800/50 rounded-lg border border-white/10 p-6">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            📋 Pending Work in Queues
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
              <div className="text-blue-300 text-sm font-medium">Text Club</div>
              <div className="text-2xl font-bold text-white mt-1">
                {overviewStats.pendingByTaskType?.textClub || 0}
              </div>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
              <div className="text-purple-300 text-sm font-medium">WOD/IVCS</div>
              <div className="text-2xl font-bold text-white mt-1">
                {overviewStats.pendingByTaskType?.wodIvcs || 0}
              </div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
              <div className="text-green-300 text-sm font-medium">Email Requests</div>
              <div className="text-2xl font-bold text-white mt-1">
                {overviewStats.pendingByTaskType?.emailRequests || 0}
              </div>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/20">
              <div className="text-orange-300 text-sm font-medium">Standalone Refunds</div>
              <div className="text-2xl font-bold text-white mt-1">
                {overviewStats.pendingByTaskType?.standaloneRefunds || 0}
              </div>
            </div>
          </div>
        </div>

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
                  <p className="text-sm text-white/80">
                    In Progress: <span className="font-semibold text-orange-400">{agent.tasksInProgress}</span>
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
                <div className="mt-3">
                  <SmallButton
                    onClick={() => peekAgentTasks(agent)}
                    className="w-full text-xs"
                  >
                    👁️ Peek In Progress
                  </SmallButton>
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

        {/* Peek In Progress Modal */}
        {peekModalOpen && selectedAgent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg border border-white/20 max-w-4xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <H2 className="text-white">👁️ Peek In Progress - {selectedAgent.name}</H2>
                    <p className="text-white/60 text-sm mt-1">{selectedAgent.email}</p>
                  </div>
                  <SmallButton
                    onClick={() => setPeekModalOpen(false)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    ✕ Close
                  </SmallButton>
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {loadingTasks ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-white/60">Loading tasks...</div>
                  </div>
                ) : agentTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">📭</div>
                    <div className="text-white/60">No in-progress tasks found</div>
                    <div className="text-white/40 text-sm mt-2">
                      This agent currently has no tasks in progress
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-white/80 text-sm mb-4">
                      Found {agentTasks.length} in-progress task{agentTasks.length !== 1 ? 's' : ''}
                    </div>
                    {agentTasks.map((task) => (
                      <div key={task.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded">
                                {task.taskType}
                              </span>
                              <span className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs rounded">
                                {task.status}
                              </span>
                              {task.disposition && (
                                <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded">
                                  {task.disposition}
                                </span>
                              )}
                            </div>
                            {task.brand && (
                              <div className="text-white/80 text-sm mb-1">
                                <strong>Brand:</strong> {task.brand}
                              </div>
                            )}
                            {task.phone && (
                              <div className="text-white/80 text-sm mb-1">
                                <strong>Phone:</strong> {task.phone}
                              </div>
                            )}
                            {task.text && (
                              <div className="text-white/70 text-sm mb-2">
                                <strong>Text:</strong> {task.text.length > 100 ? `${task.text.substring(0, 100)}...` : task.text}
                              </div>
                            )}
                            {task.startTime && (
                              <div className="text-white/60 text-xs">
                                <strong>Started:</strong> {new Date(task.startTime).toLocaleString()}
                              </div>
                            )}
                            {task.durationSec && (
                              <div className="text-white/60 text-xs">
                                <strong>Duration:</strong> {Math.round(task.durationSec / 60)}m {task.durationSec % 60}s
                              </div>
                            )}
                          </div>
                          <div className="text-white/50 text-xs ml-4">
                            <div>Created: {new Date(task.createdAt).toLocaleString()}</div>
                            <div>Updated: {new Date(task.updatedAt).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Team Performance Metrics */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <H3>👥 Team Performance Metrics</H3>
            <div className="flex items-center gap-4">
              <select
                value={selectedAgentFilter}
                onChange={(e) => setSelectedAgentFilter(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                <option value="all">All Agents</option>
                {agentStatus.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedTaskFilter}
                onChange={(e) => setSelectedTaskFilter(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                <option value="all">All Tasks</option>
                <option value="TEXT_CLUB">Text Club</option>
                <option value="WOD_IVCS">WOD/IVCS</option>
                <option value="EMAIL_REQUESTS">Email Requests</option>
                <option value="STANDALONE_REFUNDS">Standalone Refunds</option>
              </select>
            </div>
          </div>

          {loadingTeamPerformance ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-white/60">Loading team performance data...</div>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Filter data based on selected filters
                let filteredData = teamPerformanceData;
                
                if (selectedAgentFilter !== 'all') {
                  filteredData = filteredData.filter(item => item.agentId === selectedAgentFilter);
                }
                
                if (selectedTaskFilter !== 'all') {
                  filteredData = filteredData.filter(item => item.taskType === selectedTaskFilter);
                }

                // Group by agent
                const groupedByAgent = filteredData.reduce((acc, item) => {
                  if (!acc[item.agentId]) {
                    acc[item.agentId] = {
                      agentName: item.agentName,
                      agentEmail: item.agentEmail,
                      tasks: []
                    };
                  }
                  acc[item.agentId].tasks.push(item);
                  return acc;
                }, {} as Record<string, { agentName: string; agentEmail: string; tasks: TeamPerformanceData[] }>);

                return Object.entries(groupedByAgent).map(([agentId, agentData]) => (
                  <div key={agentId} className="bg-gray-800/50 rounded-lg p-4 border border-white/10">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-white">{agentData.agentName}</h4>
                        <p className="text-sm text-white/60">{agentData.agentEmail}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-400">
                          {agentData.tasks.reduce((sum, task) => sum + task.completedCount, 0)}
                        </div>
                        <div className="text-sm text-white/60">Total Completed</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {agentData.tasks.map((task) => (
                        <div key={`${agentId}-${task.taskType}`} className="bg-gray-700/50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-white">
                              {task.taskType.replace('_', ' ')}
                            </span>
                            <span className="text-lg font-bold text-blue-400">
                              {task.completedCount}
                            </span>
                          </div>
                          <div className="text-xs text-white/60">
                            Avg: {formatDuration(task.avgHandleTime)}
                          </div>
                          <div className="text-xs text-white/60">
                            Total: {formatDuration(task.totalDuration)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
              
              {teamPerformanceData.length === 0 && !loadingTeamPerformance && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📊</div>
                  <div className="text-white/60">No performance data available for the selected period</div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
