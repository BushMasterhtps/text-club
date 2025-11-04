"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import ThemeToggle from '@/app/_components/ThemeToggle';
import UnifiedSettings from '@/app/_components/UnifiedSettings';
import YotpoAnalytics from '@/app/_components/YotpoAnalytics';

// Utility functions
function clamp(value: number | null | undefined): number {
  if (value == null) return 0;
  return Math.max(0, Math.min(100, value));
}

// Progress bar component
function ProgressBar({ value }: { value: number }) {
  const pct = clamp(value);
  return (
    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 to-sky-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Types
interface YotpoTask {
  id: string;
  status: string;
  dateSubmitted: string | null;
  prOrYotpo: string | null;
  customerName: string | null;
  email: string | null;
  orderDate: string | null;
  product: string | null;
  issueTopic: string | null;
  reviewDate: string | null;
  review: string | null;
  sfOrderLink: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  email: string;
  name: string;
  emailRequests: { assigned: number; inProgress: number; completedToday: number };
}

// Utils
function fmtDate(d: string | Date | null | undefined) {
  try {
    const dt = typeof d === "string" ? new Date(d) : d ?? new Date(0);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
  } catch {
    return "—";
  }
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white/90 tracking-tight">{children}</h2>
  );
}

/* ========================================================================== */
/*  CSV Import Section                                                        */
/* ========================================================================== */
function CsvImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleImport = async () => {
    if (!file) {
      setMessage("Please select a CSV file first");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/yotpo/import', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        setMessage(`✓ Success! Imported ${data.results.imported} tasks, ${data.results.duplicates} duplicates skipped, ${data.results.errors} errors`);
        setFile(null);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) input.value = '';
      } else {
        setMessage(`✗ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      setMessage('✗ Failed to import CSV');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📥 CSV Import</H2>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.startsWith('✓') ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
        }`}>
          {message}
        </div>
      )}

      <div className="bg-white/5 rounded-lg p-4 space-y-4 border border-white/10">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-white/80
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-700
              file:cursor-pointer"
          />
        </div>

        <button
          onClick={handleImport}
          disabled={!file || uploading}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold text-sm transition-colors"
        >
          {uploading ? '⏳ Importing...' : '📥 Import Yotpo CSV'}
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-300 mb-2">💡 CSV Format</h4>
        <div className="text-xs text-white/70 space-y-1">
          <div>• <strong>Column A:</strong> Date Submitted</div>
          <div>• <strong>Column B:</strong> PRs or Yotpo?</div>
          <div>• <strong>Column C:</strong> Customer Name</div>
          <div>• <strong>Column D:</strong> Email</div>
          <div>• <strong>Column E:</strong> Order Date</div>
          <div>• <strong>Column F:</strong> Product</div>
          <div>• <strong>Column G:</strong> Issue Topic</div>
          <div>• <strong>Column H:</strong> Review Date</div>
          <div>• <strong>Column I:</strong> Review (full text)</div>
          <div>• <strong>Column J:</strong> SF Order Referenced (link)</div>
          <div className="pt-2 text-white/60">
            <strong>Duplicate Check:</strong> Email + Product + Review Date
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Pending Tasks Section                                                     */
/* ========================================================================== */
function PendingTasksSection() {
  const [tasks, setTasks] = useState<YotpoTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [assignedFilter, setAssignedFilter] = useState('unassigned');
  const [searchQuery, setSearchQuery] = useState('');

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (assignedFilter !== 'all') params.append('assigned', assignedFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`/api/yotpo/queues?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Error loading Yotpo tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [statusFilter, assignedFilter]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📁 Pending Yotpo Request Tasks</H2>
        <SmallButton onClick={loadTasks} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading ? 'Refreshing...' : 'Refresh'}
        </SmallButton>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-white/60 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Assigned</label>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">Anyone</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Search</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email, name, topic..."
              className="flex-1 px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <SmallButton onClick={loadTasks} className="bg-blue-600 hover:bg-blue-700">
              Search
            </SmallButton>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2"><input type="checkbox" /></th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date Submitted</th>
              <th className="px-3 py-2">PR/Yotpo</th>
              <th className="px-3 py-2">Customer Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Order Date</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Issue Topic</th>
              <th className="px-3 py-2">Review Date</th>
              <th className="px-3 py-2">Assigned To</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-white/50">
                  {loading ? 'Loading...' : 'No Yotpo tasks found'}
                </td>
              </tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <input type="checkbox" value={task.id} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      task.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                      task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-green-500/20 text-green-300'
                    }`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white/80">{fmtDate(task.dateSubmitted)}</td>
                  <td className="px-3 py-2 text-white/80">{task.prOrYotpo || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{task.customerName || '—'}</td>
                  <td className="px-3 py-2 text-white/80 text-xs">{task.email || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{fmtDate(task.orderDate)}</td>
                  <td className="px-3 py-2 text-white/80">{task.product || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{task.issueTopic || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{fmtDate(task.reviewDate)}</td>
                  <td className="px-3 py-2 text-white/80 text-xs">
                    {task.assignedTo ? task.assignedTo.name : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <SmallButton className="bg-blue-600 hover:bg-blue-700 text-xs">
                        View
                      </SmallButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-white/60">
        Showing {tasks.length} task{tasks.length !== 1 ? 's' : ''}
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Assign Tasks Section                                                      */
/* ========================================================================== */
function AssignTasksSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [perAgentCap, setPerAgentCap] = useState(50);
  const [loading, setLoading] = useState(false);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/manager/agents');
      const data = await res.json();
      if (data.success && data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleSelectAll = () => {
    setSelectedAgents(new Set(agents.map(a => a.id)));
  };

  const handleSelectNone = () => {
    setSelectedAgents(new Set());
  };

  const toggleAgent = (agentId: string) => {
    const newSet = new Set(selectedAgents);
    if (newSet.has(agentId)) {
      newSet.delete(agentId);
    } else {
      newSet.add(agentId);
    }
    setSelectedAgents(newSet);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>✅ Assign Yotpo Tasks</H2>
        <SmallButton onClick={loadAgents} className="bg-blue-600 hover:bg-blue-700">Refresh</SmallButton>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-white/70">
          Choose agents ({selectedAgents.size}/{agents.length} selected)
        </div>
        <div className="flex gap-2">
          <SmallButton onClick={handleSelectAll} className="bg-blue-600 hover:bg-blue-700">
            Select all
          </SmallButton>
          <SmallButton onClick={handleSelectNone} className="bg-white/10 hover:bg-white/20">
            Select none
          </SmallButton>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {agents.map(agent => (
          <div
            key={agent.id}
            onClick={() => toggleAgent(agent.id)}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedAgents.has(agent.id)
                ? 'bg-blue-500/20 border-blue-500/50'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={selectedAgents.has(agent.id)}
                readOnly
                className="cursor-pointer"
              />
              <div className="flex-1">
                <div className="font-medium text-white text-sm">{agent.name}</div>
                <div className="text-xs text-white/50">{agent.email}</div>
              </div>
            </div>
            <div className="text-xs text-white/60 flex gap-3">
              <span>Email: {agent.emailRequests?.assigned || 0}</span>
              <span>Total: {agent.emailRequests?.inProgress || 0}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Assignment Controls */}
      <div className="flex items-center gap-4 bg-white/5 rounded-lg p-4 border border-white/10">
        <div className="flex-1">
          <label className="block text-sm text-white/60 mb-1">Per-agent cap (this run)</label>
          <input
            type="number"
            min="1"
            max="200"
            value={perAgentCap}
            onChange={(e) => setPerAgentCap(parseInt(e.target.value) || 50)}
            className="w-32 px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-white/50 mt-1">Absolute hard cap is 200 per agent</p>
        </div>
        <button
          disabled={selectedAgents.size === 0 || loading}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors"
        >
          {loading ? '⏳ Assigning...' : `Assign Now`}
        </button>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Main Page Component                                                       */
/* ========================================================================== */
export default function YotpoPage() {
  const [activeSection, setActiveSection] = useState("overview");
  
  // Overview data
  const [overviewData, setOverviewData] = useState({
    pendingCount: 0,
    inProgressCount: 0,
    completedTodayCount: 0,
    totalCompletedCount: 0,
    progressPercentage: 0,
    totalTasks: 0,
    lastImport: null as { date: string; imported: number; duplicates: number; errors: number } | null
  });
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [assistanceRequests, setAssistanceRequests] = useState<Array<{
    id: string;
    taskType: string;
    agentName: string;
    agentEmail: string;
    assistanceNotes: string;
    managerResponse?: string;
    createdAt: string;
    updatedAt: string;
    status: string;
  }>>([]);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Auto logout hook
  useAutoLogout();

  // Load overview data
  const loadOverviewData = async () => {
    setOverviewLoading(true);
    try {
      const response = await fetch('/api/yotpo/overview');
      const data = await response.json();
      if (data.success) {
        setOverviewData(data.data);
      }
    } catch (error) {
      console.error('Error loading overview data:', error);
    } finally {
      setOverviewLoading(false);
    }
  };

  // Load assistance requests
  const loadAssistanceRequests = async () => {
    try {
      const response = await fetch('/api/manager/assistance', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const yotpoRequests = data.requests.filter((req: any) => req.taskType === 'YOTPO');
          setAssistanceRequests(yotpoRequests);
          
          const pendingRequests = yotpoRequests.filter((req: any) => req.status === 'ASSISTANCE_REQUIRED');
          
          if (pendingRequests.length > 0 && (newAssistanceCount === 0 || pendingRequests.length > newAssistanceCount)) {
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 5000);
          }
          
          setNewAssistanceCount(pendingRequests.length);
        }
      }
    } catch (error) {
      console.error('Error loading assistance requests:', error);
    }
  };

  useEffect(() => {
    loadAssistanceRequests();
    const interval = setInterval(loadAssistanceRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load overview data when overview section is active
  useEffect(() => {
    if (activeSection === "overview") {
      loadOverviewData();
    }
  }, [activeSection]);

  // Check for password change requirement
  useEffect(() => {
    const checkPasswordChange = async () => {
      try {
        const res = await fetch('/api/auth/check-password-change');
        const data = await res.json();
        if (data.mustChangePassword) {
          setShowPasswordModal(true);
        }
      } catch (error) {
        console.error('Error checking password change:', error);
      }
    };
    checkPasswordChange();
  }, []);

  const navigationItems = [
    { id: "overview", label: "📊 Overview", description: "Yotpo metrics and progress" },
    { id: "tasks", label: "📋 Task Management", description: "Import, assign, and manage Yotpo tasks" },
    { id: "assistance", label: "🆘 Assistance Requests", description: "Respond to agent assistance requests", badge: assistanceRequests.filter(r => r.status === "ASSISTANCE_REQUIRED").length },
    { id: "agents", label: "👥 Agent Management", description: "Monitor agent progress and performance" },
    { id: "analytics", label: "📈 Analytics", description: "Completed work and performance insights" }
  ];

  return (
    <main className="mx-auto max-w-[1400px] p-6 text-white dark:text-white light:text-slate-800 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
      <header className="sticky top-0 z-30 bg-gradient-to-b from-neutral-900 via-neutral-900/95 to-neutral-900/80 dark:from-neutral-900 dark:via-neutral-900/95 dark:to-neutral-900/80 light:from-white light:via-white/95 light:to-white/80 backdrop-blur-sm border-b border-white/10 dark:border-white/10 light:border-slate-200 shadow-lg">
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/golden-companies-logo.jpeg" 
                alt="Golden Companies" 
                className="h-14 w-auto"
              />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">⭐ Yotpo Dashboard</h1>
                <p className="text-sm text-white/60">Yotpo Review & Feedback Task Management</p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Settings Button */}
              <button
                onClick={() => setActiveSection("settings")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === "settings"
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                }`}
                title="System Settings & Administration"
              >
                ⚙️ Settings
              </button>
              
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Session Display */}
              <div className="px-3 py-1.5 bg-white/10 rounded-md text-sm text-white/80">
                Session: 2h 0m
              </div>
              
              {/* Extend Session */}
              <SmallButton className="bg-blue-600 hover:bg-blue-700">
                Extend
              </SmallButton>
              
              {/* Switch to Agent */}
              <SmallButton 
                onClick={() => window.location.href = '/agent'}
                className="bg-green-600 hover:bg-green-700"
              >
                Switch to Agent
              </SmallButton>
              
              {/* Logout */}
              <SmallButton 
                onClick={() => {
                  localStorage.removeItem('agentEmail');
                  localStorage.removeItem('currentRole');
                  window.location.href = '/login';
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Logout
              </SmallButton>
            </div>
          </div>
        </div>
        
        {/* Main Navigation */}
        <div className="px-6 pb-3">
          <nav className="flex flex-wrap gap-2">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                  activeSection === item.id
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                }`}
              >
                {item.label}
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          {/* Dashboard Switcher */}
          <DashboardSwitcher />
        </div>
      </header>

      {/* Auto Logout Warning - Handled by useAutoLogout hook */}

      {/* Notification for new assistance requests */}
      {showNotification && newAssistanceCount > 0 && (
        <div className="fixed top-20 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
          <span className="text-lg">🆘</span>
          <div>
            <div className="font-semibold">New Assistance Request{newAssistanceCount > 1 ? 's' : ''}!</div>
            <div className="text-sm opacity-90">{newAssistanceCount} agent{newAssistanceCount > 1 ? 's' : ''} need{newAssistanceCount === 1 ? 's' : ''} help</div>
          </div>
          <button
            onClick={() => {
              setShowNotification(false);
              setActiveSection("assistance");
            }}
            className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm font-medium transition-colors"
          >
            View
          </button>
          <button
            onClick={() => setShowNotification(false)}
            className="text-white/70 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Content Sections */}
      <div className="space-y-8 mt-8">
        {/* Overview Section */}
        {activeSection === "overview" && (
          <div className="space-y-8">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">⭐ Yotpo Overview</h3>
                <SmallButton onClick={loadOverviewData} disabled={overviewLoading} className="bg-blue-600 hover:bg-blue-700">
                  {overviewLoading ? "Loading..." : "Refresh"}
                </SmallButton>
              </div>
              
              {/* Progress Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg p-4 border border-blue-500/30">
                  <div className="text-blue-400 text-sm font-medium">Progress</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.progressPercentage}% done</div>
                  <div className="mt-2">
                    <ProgressBar value={overviewData.progressPercentage} />
                  </div>
                  <div className="text-xs text-white/40 mt-2">Pending {overviewData.pendingCount} • Completed {overviewData.totalCompletedCount}</div>
                </div>
                
                <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 rounded-lg p-4 border border-yellow-500/30">
                  <div className="text-yellow-400 text-sm font-medium">Pending</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.pendingCount}</div>
                  <div className="text-xs text-white/40 mt-1">Awaiting assignment</div>
                </div>
                
                <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-lg p-4 border border-green-500/30">
                  <div className="text-green-400 text-sm font-medium">Completed Today</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.completedTodayCount}</div>
                  <div className="text-xs text-white/40 mt-1">Finished today</div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg p-4 border border-purple-500/30">
                  <div className="text-purple-400 text-sm font-medium">In Progress</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.inProgressCount}</div>
                  <div className="text-xs text-white/40 mt-1">Currently being worked on</div>
                </div>
              </div>

              {/* Last Import Info */}
              {overviewData.lastImport && (
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <h4 className="text-md font-semibold mb-2">📥 Last Import</h4>
                  <div className="text-sm text-white/80">
                    <div>Date: {new Date(overviewData.lastImport.date).toLocaleString()}</div>
                    <div>Imported: {overviewData.lastImport.imported} tasks</div>
                    {overviewData.lastImport.duplicates > 0 && (
                      <div className="text-yellow-400">Duplicates found: {overviewData.lastImport.duplicates}</div>
                    )}
                    {overviewData.lastImport.errors > 0 && (
                      <div className="text-red-400">Errors: {overviewData.lastImport.errors}</div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Task Management Section */}
        {activeSection === "tasks" && (
          <div className="space-y-8">
            <CsvImportSection />
            <AssignTasksSection />
            <PendingTasksSection />
          </div>
        )}

        {/* Assistance Requests Section */}
        {activeSection === "assistance" && (
          <div className="space-y-8">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">🆘 Assistance Requests</h3>
              <p className="text-white/60">Yotpo assistance requests will appear here</p>
              {assistanceRequests.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {assistanceRequests.map(req => (
                    <div key={req.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="font-medium text-white">{req.agentName}</div>
                      <div className="text-sm text-white/70 mt-2">{req.assistanceNotes}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-white/50">No assistance requests</div>
              )}
            </Card>
          </div>
        )}

        {/* Agent Management Section */}
        {activeSection === "agents" && (
          <Card className="p-6">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-xl font-semibold text-white mb-2">Agent Management</h3>
              <p className="text-white/60">Agent progress tracking for Yotpo tasks coming soon</p>
            </div>
          </Card>
        )}

        {/* Analytics Section */}
        {activeSection === "analytics" && (
          <div className="space-y-8">
            <YotpoAnalytics />
          </div>
        )}

        {/* Settings Section */}
        {activeSection === "settings" && (
          <div className="space-y-8">
            <UnifiedSettings />
          </div>
        )}
      </div>

      {/* Password Change Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false);
          window.location.reload();
        }}
      />
    </main>
  );
}
