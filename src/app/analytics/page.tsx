'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/app/_components/Card';
import { SmallButton } from '@/app/_components/SmallButton';
import PerformanceScorecard from '@/app/_components/PerformanceScorecard';
import OneOnOneNotes from '@/app/_components/OneOnOneNotes';

// Typography components
function H1({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={`text-2xl font-bold text-white/90 tracking-tight ${className || ''}`}>{children}</h1>
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
import { 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
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
    holds: number;
    yotpo: number;
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
  totalCompleted?: number; // Total count matching Agent Status API (all tasks, no taskType filter)
}


export default function AnalyticsPage() {
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus[]>([]);
  const [allAgents, setAllAgents] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<'today' | 'custom'>('today');
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
  
  // Performance Scorecard state
  const [scorecardData, setScorecardData] = useState<any>(null);
  const [loadingScorecard, setLoadingScorecard] = useState(false);

  // Tab navigation state
  const [selectedTab, setSelectedTab] = useState<'overview' | 'agents'>('overview');
  
  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  
  // Agent view mode (quick vs detailed)
  const [agentViewMode, setAgentViewMode] = useState<'quick' | 'detailed'>('quick');

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
  const getDateRange = (): { start: string; end: string } => {
    const today = new Date();
    
    // If custom range is selected and dates are set, use them
    if (selectedDateRange === 'custom' && customStartDate && customEndDate) {
      return {
        start: customStartDate,
        end: customEndDate
      };
    }
    
    // Otherwise, use today
    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      start: formatDate(today),
      end: formatDate(today)
    };
  };

  // Load overview data
  const loadOverviewData = async () => {
    try {
      const dateRange = getDateRange();
      
      // Load all analytics data in parallel
      const [overviewRes, taskStatsRes, agentsRes, allAgentsRes] = await Promise.all([
        fetch(`/api/analytics/overview?startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/analytics/task-types?startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/analytics/agent-status?startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch('/api/manager/agents') // Fetch all agents for One-on-One Notes (includes paused agents - no date filter)
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

      // Load all agents for One-on-One Notes (not filtered by isLive)
      if (allAgentsRes.ok) {
        const allAgentsData = await allAgentsRes.json();
        if (allAgentsData.success && allAgentsData.agents) {
          setAllAgents(allAgentsData.agents.map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            email: agent.email
          })));
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
      const dateRange = getDateRange();
      // Add cache-busting and timestamp to ensure fresh data
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/analytics/team-performance?startDate=${dateRange.start}&endDate=${dateRange.end}&_t=${timestamp}`, {
        cache: 'no-store' // Prevent caching
      });
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

  // Load performance scorecard data
  const loadScorecardData = async () => {
    setLoadingScorecard(true);
    try {
      const dateRange = getDateRange();
      // Add cache-busting parameter to ensure fresh data
      const cacheBuster = `&_t=${Date.now()}`;
      const response = await fetch(
        `/api/manager/analytics/performance-scorecard?dateStart=${dateRange.start}&dateEnd=${dateRange.end}${cacheBuster}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      
      if (data.success) {
        setScorecardData(data);
      }
    } catch (error) {
      console.error('Error loading scorecard data:', error);
    } finally {
      setLoadingScorecard(false);
    }
  };

  // Load agent detail data (for drill-down)
  const loadAgentDetail = async (agentId: string) => {
    try {
      const dateRange = getDateRange();
      const response = await fetch(
        `/api/manager/analytics/performance-scorecard?dateStart=${dateRange.start}&dateEnd=${dateRange.end}&agentId=${agentId}`
      );
      const data = await response.json();
      
      if (data.success && data.agent) {
        return data.agent;
      }
      return null;
    } catch (error) {
      console.error('Error loading agent detail:', error);
      return null;
    }
  };

  useEffect(() => {
    try {
      loadOverviewData();
      loadTeamPerformanceData();
      loadScorecardData();
    } catch (error) {
      console.error('Error in useEffect:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateRange, customStartDate, customEndDate]);

  // Also reload data when custom dates change
  useEffect(() => {
    if (selectedDateRange === 'custom' && customStartDate && customEndDate) {
      loadOverviewData();
      loadTeamPerformanceData();
      loadScorecardData();
    }
  }, [customStartDate, customEndDate]);

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

  // Toggle section collapse
  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Collapsible section component
  const CollapsibleSection = ({ 
    id, 
    title, 
    icon, 
    defaultExpanded = true, 
    children 
  }: { 
    id: string; 
    title: string; 
    icon?: string; 
    defaultExpanded?: boolean; 
    children: React.ReactNode;
  }) => {
    const isExpanded = collapsedSections[id] === undefined ? defaultExpanded : !collapsedSections[id];
    
    return (
      <Card className="p-6">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between mb-4 hover:bg-white/5 -m-2 p-2 rounded-lg transition-colors"
        >
          <H3 className="flex items-center gap-2">
            {icon && <span>{icon}</span>}
            {title}
          </H3>
          <span className="text-white/60">
            {isExpanded ? '▼' : '▶'}
          </span>
        </button>
        {isExpanded && <div>{children}</div>}
      </Card>
    );
  };

  // Handle time period change - refresh all data
  const handleTimePeriodChange = (range: 'today' | 'custom') => {
    setSelectedDateRange(range);
    if (range === 'today') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
    // Data will reload via useEffect when selectedDateRange changes
  };

  // Handle custom date range apply
  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      // Data will reload via useEffect when customStartDate/customEndDate changes
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-900">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <H2 className="text-white">Loading Analytics...</H2>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-900">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-neutral-900 border-b border-white/10 shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <H1 className="text-3xl font-bold text-white">
              📊 Team Analytics
            </H1>
            <button
              onClick={() => window.location.href = '/manager'}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white/10 text-white/70 hover:bg-white/20 hover:text-white flex items-center gap-2"
            >
              ← Back to Manager Portal
            </button>
          </div>
          
          {/* Time Period Selector */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <H3 className="text-lg">📅 Time Period</H3>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleTimePeriodChange('today')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedDateRange === 'today'
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => handleTimePeriodChange('custom')}
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
                    onClick={handleCustomDateApply}
                    disabled={!customStartDate || !customEndDate}
                  >
                    Apply
                  </SmallButton>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Tabs Content */}
        <div className="max-w-[1600px] mx-auto">
          {/* Tab Navigation */}
          <div className="mb-6 border-b border-white/10">
            <div className="flex gap-1">
              {(['overview', 'agents'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-6 py-3 rounded-t-lg text-sm font-medium transition-all ${
                    selectedTab === tab
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {selectedTab === 'overview' && (
            <div className="space-y-6">
              {/* Section 1: Key Metrics & Queue Status (Merged) */}
              <CollapsibleSection id="metrics-queues" title="Key Metrics & Queue Status" icon="📊" defaultExpanded={true}>
                {overviewStats && (
                  <div className="grid grid-cols-5 gap-6">
                    {/* Left: Metrics (60% = 3 columns) */}
                    <div className="col-span-3 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Card className="p-6 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-blue-200 text-sm font-medium">
                                {selectedDateRange === 'custom' && customStartDate && customEndDate
                                  ? `${new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                  : 'Completed Today'}
                              </p>
                              <p className="text-3xl font-bold text-white mt-1">{overviewStats?.totalCompletedToday || 0}</p>
                            </div>
                            <div className="text-4xl">✅</div>
                          </div>
                        </Card>

                        <Card className="p-6 bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-green-200 text-sm font-medium">Total Completed</p>
                              <p className="text-3xl font-bold text-white mt-1">{overviewStats?.totalCompleted?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="text-4xl">📈</div>
                          </div>
                        </Card>

                        <Card className="p-6 bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-purple-500/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-purple-200 text-sm font-medium">Avg Handle Time</p>
                              <p className="text-3xl font-bold text-white mt-1">{formatDuration(overviewStats?.avgHandleTime || 0)}</p>
                            </div>
                            <div className="text-4xl">⏱️</div>
                          </div>
                        </Card>

                        <Card className="p-6 bg-gradient-to-br from-orange-500/20 to-orange-600/20 border-orange-500/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-orange-200 text-sm font-medium">Total In Progress</p>
                              <p className="text-3xl font-bold text-white mt-1">{overviewStats?.totalInProgress || 0}</p>
                            </div>
                            <div className="text-4xl">🔄</div>
                          </div>
                        </Card>

                        <Card className="p-6 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border-cyan-500/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-cyan-200 text-sm font-medium">Active Agents</p>
                              <p className="text-3xl font-bold text-white mt-1">{overviewStats?.activeAgents || 0}</p>
                            </div>
                            <div className="text-4xl">👥</div>
                          </div>
                        </Card>
                      </div>
                    </div>

                    {/* Right: Queues (40% = 2 columns) */}
                    <div className="col-span-2">
                      <div className="bg-gray-800/50 rounded-lg border border-white/10 p-4 h-full">
                        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          📋 Pending Work in Queues
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                            <div className="text-blue-300 text-xs font-medium">Text Club</div>
                            <div className="text-xl font-bold text-white mt-1">
                              {overviewStats.pendingByTaskType?.textClub || 0}
                            </div>
                          </div>
                          <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                            <div className="text-purple-300 text-xs font-medium">WOD/IVCS</div>
                            <div className="text-xl font-bold text-white mt-1">
                              {overviewStats.pendingByTaskType?.wodIvcs || 0}
                            </div>
                          </div>
                          <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                            <div className="text-green-300 text-xs font-medium">Email Requests</div>
                            <div className="text-xl font-bold text-white mt-1">
                              {overviewStats.pendingByTaskType?.emailRequests || 0}
                            </div>
                          </div>
                          <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                            <div className="text-yellow-300 text-xs font-medium">Holds</div>
                            <div className="text-xl font-bold text-white mt-1">
                              {overviewStats.pendingByTaskType?.holds || 0}
                            </div>
                          </div>
                          <div className="bg-indigo-500/10 rounded-lg p-3 border border-indigo-500/20">
                            <div className="text-indigo-300 text-xs font-medium">Yotpo</div>
                            <div className="text-xl font-bold text-white mt-1">
                              {overviewStats.pendingByTaskType?.yotpo || 0}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              {/* Section 2: Task Type Performance */}
              <CollapsibleSection id="task-performance" title="Task Type Performance" icon="📊" defaultExpanded={true}>
                {taskTypeStats && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <H3 className="mb-4">📊 Task Type Performance</H3>
                      <div className="space-y-4">
                        {Object.entries(taskTypeStats).map(([type, stats]) => (
                          <div key={type} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="text-2xl">
                                {type === 'textClub' && '💬'}
                                {type === 'wodIvcs' && '📋'}
                                {type === 'emailRequests' && '📧'}
                                {type === 'holds' && '🔒'}
                                {type === 'yotpo' && '⭐'}
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
                    </div>

                    <div>
                      <H3 className="mb-4">📈 Task Distribution</H3>
                      <div className="h-64">
                        {taskTypeStats && Object.keys(taskTypeStats).length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={Object.entries(taskTypeStats)
                                  .filter(([_, stats]) => stats.completed > 0)
                                  .map(([type, stats]) => ({
                                    name: type.replace(/([A-Z])/g, ' $1').trim(),
                                    value: stats.completed,
                                  }))}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                dataKey="value"
                                label={({ name, percent }) => percent > 0.01 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                                labelLine={false}
                              >
                                {Object.entries(taskTypeStats)
                                  .filter(([_, stats]) => stats.completed > 0)
                                  .map(([type], index) => (
                                    <Cell 
                                      key={`cell-${type}-${index}`} 
                                      fill={type === 'textClub' ? '#3B82F6' : 
                                            type === 'wodIvcs' ? '#10B981' : 
                                            type === 'emailRequests' ? '#F59E0B' : 
                                            type === 'holds' ? '#F59E0B' : 
                                            type === 'yotpo' ? '#8B5CF6' : '#8B5CF6'} 
                                    />
                                  ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-white/60">
                            No data available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              {/* Section 3: Performance Scorecard & One-on-One Notes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Performance Scorecard */}
                <div>
                  <PerformanceScorecard
                    scorecardData={scorecardData}
                    loading={loadingScorecard}
                    onRefresh={loadScorecardData}
                    onLoadAgentDetail={loadAgentDetail}
                    dateRange={selectedDateRange === 'custom' && customStartDate && customEndDate 
                      ? { start: customStartDate, end: customEndDate }
                      : selectedDateRange !== 'custom'
                      ? getDateRange()
                      : undefined}
                  />
                </div>

                {/* One-on-One Notes */}
                <div>
                  <OneOnOneNotes 
                    agents={allAgents}
                  />
                </div>
              </div>

            </div>
          )}

          {selectedTab === 'agents' && (
            <div className="space-y-6">
              {/* Agent Overview Section - will be fully implemented in Phase 2 */}
              <CollapsibleSection id="agent-overview" title="Agent Overview" icon="👥" defaultExpanded={true}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAgentViewMode(agentViewMode === 'quick' ? 'detailed' : 'quick')}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Switch to {agentViewMode === 'quick' ? 'Detailed' : 'Quick'} View
                    </button>
                  </div>
                </div>

                {agentViewMode === 'quick' && (
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
                )}

                {agentViewMode === 'detailed' && (
                  <div>
                    {/* Team Performance Metrics - will be moved here in Phase 2 */}
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <H3>👥 Team Performance Metrics</H3>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => {
                              loadTeamPerformanceData();
                              loadScorecardData();
                            }}
                            disabled={loadingTeamPerformance || loadingScorecard}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
                            title="Refresh team performance data"
                          >
                            {loadingTeamPerformance || loadingScorecard ? (
                              <>⏳ Refreshing...</>
                            ) : (
                              <>🔄 Refresh</>
                            )}
                          </button>
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
                            <option value="YOTPO">Yotpo</option>
                            <option value="HOLDS">Holds</option>
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
                                  tasks: [],
                                  totalCompleted: item.totalCompleted || 0
                                };
                              }
                              acc[item.agentId].tasks.push(item);
                              if (item.totalCompleted) {
                                acc[item.agentId].totalCompleted = item.totalCompleted;
                              }
                              return acc;
                            }, {} as Record<string, { agentName: string; agentEmail: string; tasks: TeamPerformanceData[]; totalCompleted: number }>);

                            // Sort agents by total completed tasks
                            const sortedAgents = Object.entries(groupedByAgent).sort(([, agentA], [, agentB]) => {
                              const totalA = agentA.totalCompleted > 0 
                                ? agentA.totalCompleted 
                                : agentA.tasks.reduce((sum, task) => sum + task.completedCount, 0);
                              const totalB = agentB.totalCompleted > 0 
                                ? agentB.totalCompleted 
                                : agentB.tasks.reduce((sum, task) => sum + task.completedCount, 0);
                              return totalB - totalA;
                            });

                            return sortedAgents.map(([agentId, agentData]) => {
                              const totalCount = agentData.totalCompleted > 0
                                ? agentData.totalCompleted
                                : agentData.tasks.reduce((sum, task) => sum + task.completedCount, 0);
                              
                              return (
                                <div key={agentId} className="bg-gray-800/50 rounded-lg p-4 border border-white/10">
                                  <div className="flex items-center justify-between mb-4">
                                    <div>
                                      <h4 className="text-lg font-semibold text-white">{agentData.agentName}</h4>
                                      <p className="text-sm text-white/60">{agentData.agentEmail}</p>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-2xl font-bold text-green-400">
                                        {totalCount}
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
                              );
                            });
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
                )}
              </CollapsibleSection>
            </div>
          )}


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

        </div>
      </div>
    </main>
  );
}
