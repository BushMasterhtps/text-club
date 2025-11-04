"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/app/_components/AutoLogoutWarning';
import SessionTimer from '@/app/_components/SessionTimer';
import ThemeToggle from '@/app/_components/ThemeToggle';
import UnifiedSettings from '@/app/_components/UnifiedSettings';

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

// Utility function
function fmtDate(d: string | Date | null | undefined) {
  try {
    const dt = typeof d === "string" ? new Date(d) : d ?? new Date(0);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
  } catch {
    return "—";
  }
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 to-sky-500"
        style={{ width: `${pct}%` }}
      />
    </div>
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
        // Reset file input
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
        <h2 className="text-lg font-semibold text-white/90">📥 CSV Import</h2>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.startsWith('✓') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
        }`}>
          {message}
        </div>
      )}

      <div className="bg-white/5 rounded-lg p-4 space-y-4">
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
          <p className="text-xs text-white/50 mt-2">
            Expected columns: Date Submitted, PRs or Yotpo?, Customer Name, Email, Order Date, Product, Issue Topic, Review Date, Review, SF Order Referenced (link)
          </p>
        </div>

        <button
          onClick={handleImport}
          disabled={!file || uploading}
          className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold text-sm"
        >
          {uploading ? '⏳ Importing...' : '📥 Import Yotpo Tasks'}
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-300 mb-2">💡 CSV Format</h4>
        <div className="text-xs text-white/70 space-y-1">
          <div>• Column A: Date Submitted (when customer submitted)</div>
          <div>• Column B: PRs or Yotpo? (source type)</div>
          <div>• Column C: Customer Name</div>
          <div>• Column D: Email</div>
          <div>• Column E: Order Date</div>
          <div>• Column F: Product</div>
          <div>• Column G: Issue Topic (for analytics)</div>
          <div>• Column H: Review Date</div>
          <div>• Column I: Review (full text)</div>
          <div>• Column J: SF Order Referenced (link)</div>
          <div className="pt-2 text-white/60">
            <strong>Duplicate Check:</strong> Email + Product + Review Date (duplicates will be skipped)
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
        <h2 className="text-lg font-semibold text-white/90">📁 Pending Yotpo Request Tasks</h2>
        <SmallButton onClick={loadTasks} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </SmallButton>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm text-white/60 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm text-white/60 mb-1">Assigned</label>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none"
          >
            <option value="all">Anyone</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm text-white/60 mb-1">Search</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email, name, topic..."
              className="flex-1 px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none"
            />
            <button
              onClick={loadTasks}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-sm font-medium"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
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
          <tbody className="divide-y divide-white/10">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-white/50">
                  {loading ? 'Loading...' : 'No Yotpo tasks found'}
                </td>
              </tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id} className="hover:bg-white/5">
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
                    {task.assignedTo ? task.assignedTo.name : 'Unassigned'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white">
                        View
                      </button>
                      <select className="px-2 py-1 bg-white/10 rounded text-xs text-white">
                        <option>Assign to...</option>
                      </select>
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
        <h2 className="text-lg font-semibold text-white/90">👥 Assign Yotpo Tasks</h2>
        <SmallButton onClick={loadAgents}>Refresh</SmallButton>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-white/70">
          Choose agents ({selectedAgents.size}/{agents.length} selected)
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white"
          >
            Select all
          </button>
          <button
            onClick={handleSelectNone}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white"
          >
            Select none
          </button>
        </div>
      </div>

      {/* Agent List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div className="font-medium text-white">{agent.name}</div>
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
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-sm text-white/60 mb-1">Per-agent cap (this run)</label>
          <input
            type="number"
            min="1"
            max="200"
            value={perAgentCap}
            onChange={(e) => setPerAgentCap(parseInt(e.target.value) || 50)}
            className="w-32 px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none"
          />
          <p className="text-xs text-white/50 mt-1">Absolute hard cap is 200 per agent</p>
        </div>
        <button
          disabled={selectedAgents.size === 0 || loading}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold"
        >
          {loading ? '⏳ Assigning...' : `Assign Now`}
        </button>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Overview Section                                                          */
/* ========================================================================== */
function OverviewSection() {
  const [stats, setStats] = useState({
    pendingCount: 0,
    inProgressCount: 0,
    completedTodayCount: 0,
    totalCompletedCount: 0,
    progressPercentage: 0,
    totalTasks: 0,
    lastImport: null as { date: string; imported: number; duplicates: number; errors: number } | null
  });
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/yotpo/overview');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error loading overview:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">⭐ Yotpo Overview</h3>
        <SmallButton onClick={loadStats} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </SmallButton>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg p-4 border border-blue-500/30">
          <div className="text-blue-400 text-sm font-medium">Progress</div>
          <div className="text-2xl font-bold mt-1">{stats.progressPercentage}% done</div>
          <div className="mt-2">
            <ProgressBar value={stats.progressPercentage} />
          </div>
          <div className="text-xs text-white/40 mt-2">
            Pending {stats.pendingCount} • Completed {stats.totalCompletedCount}
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 rounded-lg p-4 border border-yellow-500/30">
          <div className="text-yellow-400 text-sm font-medium">Pending</div>
          <div className="text-2xl font-bold mt-1">{stats.pendingCount}</div>
          <div className="text-xs text-white/40 mt-1">Awaiting assignment</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg p-4 border border-purple-500/30">
          <div className="text-purple-400 text-sm font-medium">In Progress</div>
          <div className="text-2xl font-bold mt-1">{stats.inProgressCount}</div>
          <div className="text-xs text-white/40 mt-1">Being worked on</div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-lg p-4 border border-green-500/30">
          <div className="text-green-400 text-sm font-medium">Completed Today</div>
          <div className="text-2xl font-bold mt-1">{stats.completedTodayCount}</div>
          <div className="text-xs text-white/40 mt-1">Keep it going! 🎯</div>
        </div>
      </div>

      {/* Last Import Info */}
      {stats.lastImport && (
        <div className="mt-6 bg-white/5 rounded-lg p-4 border border-white/10">
          <h4 className="text-md font-semibold mb-2 text-white">📥 Last Import</h4>
          <div className="text-sm text-white/80 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-white/50">Date</div>
              <div>{new Date(stats.lastImport.date).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">Imported</div>
              <div className="text-green-400 font-semibold">{stats.lastImport.imported} tasks</div>
            </div>
            {stats.lastImport.duplicates > 0 && (
              <div>
                <div className="text-xs text-white/50">Duplicates</div>
                <div className="text-yellow-400">{stats.lastImport.duplicates} skipped</div>
              </div>
            )}
            {stats.lastImport.errors > 0 && (
              <div>
                <div className="text-xs text-white/50">Errors</div>
                <div className="text-red-400">{stats.lastImport.errors} failed</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Main Page Component                                                       */
/* ========================================================================== */
export default function YotpoPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Auto logout hook
  useAutoLogout();

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

  return (
    <main className="min-h-screen p-4 md:p-8">
      <AutoLogoutWarning />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-3xl">
            ⭐
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Yotpo Dashboard</h1>
            <p className="text-white/60 text-sm">Yotpo Task Management & Analytics</p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white">
            <span className="text-lg">⚙️</span>
          </button>
          <ThemeToggle />
          <SessionTimer />
          <DashboardSwitcher />
          <button
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' })
                .then(() => window.location.href = '/login');
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-8">
        {['overview', 'tasks', 'analytics', 'settings'].map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === section
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {section === 'overview' && '📊 Overview'}
            {section === 'tasks' && '📋 Task Management'}
            {section === 'analytics' && '📈 Analytics'}
            {section === 'settings' && '⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* Content Sections */}
      <div className="space-y-8">
        {activeSection === 'overview' && (
          <div className="space-y-8">
            <OverviewSection />
          </div>
        )}

        {activeSection === 'tasks' && (
          <div className="space-y-8">
            <CsvImportSection />
            <AssignTasksSection />
            <PendingTasksSection />
          </div>
        )}

        {activeSection === 'analytics' && (
          <Card className="p-6">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-white mb-2">Analytics Coming Soon</h3>
              <p className="text-white/60">Yotpo analytics will be available after Phase 4</p>
            </div>
          </Card>
        )}

        {activeSection === 'settings' && (
          <UnifiedSettings />
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

