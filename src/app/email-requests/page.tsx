"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardLayout from '@/app/_components/DashboardLayout';
import { DashboardNavigationProvider } from '@/contexts/DashboardNavigationContext';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { AssistanceRequestsSection } from "@/app/manager/_components/AssistanceRequestsSection";
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/app/_components/AutoLogoutWarning';
import SessionTimer from '@/app/_components/SessionTimer';
import ThemeToggle from '@/app/_components/ThemeToggle';
import { Badge } from "@/app/_components/Badge";
import UnifiedSettings from '@/app/_components/UnifiedSettings';
import EmailRequestsAnalytics from '@/app/_components/EmailRequestsAnalytics';

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
type Agent = {
  id: string;
  email: string;
  name: string;
  openCount: number;
  isLive?: boolean;
  lastSeen?: string | null;
  role?: "MANAGER" | "AGENT" | "MANAGER_AGENT";
};

type AgentProgress = {
  id: string;
  name: string;
  email: string;
  assigned: number;
  inProgress: number;
  completedToday: number;
  lastActivity?: string | null;
  isLive?: boolean;
  taskTypeBreakdown?: {
    textClub: { assigned: number; inProgress: number; completedToday: number };
    wodIvcs: { assigned: number; inProgress: number; completedToday: number };
    emailRequests: { assigned: number; inProgress: number; completedToday: number };
    standaloneRefunds: { assigned: number; inProgress: number; completedToday: number };
  };
};

type Task = {
  id: string;
  phone?: string | null;
  email?: string | null;
  text?: string | null;
  brand?: string | null;
  taskType: string;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  completionTime?: string | null;
  salesforceCaseNumber?: string | null;
  emailRequestFor?: string | null;
  details?: string | null;
};

// Utils
function fmtDate(d: string | Date | null | undefined) {
  try {
    const dt = typeof d === "string" ? new Date(d) : d ?? new Date(0);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleString();
  } catch {
    return "—";
  }
}

// UI Components
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white/90 tracking-tight">{children}</h2>
  );
}

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

/* ========================================================================== */
/*  Agent Progress Section                                                    */
/* ========================================================================== */
function AgentProgressSection() {
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<AgentProgress[]>([]);
  const [loading, setLoading] = useState(false);

  // Drawer peek
  const [drawerAgent, setDrawerAgent] = useState<AgentProgress | null>(null);
  const [drawerTasks, setDrawerTasks] = useState<Task[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/dashboard/email-requests-agent-progress", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.agentProgress) {
        setRows(data.agentProgress as AgentProgress[]);
      }
    } catch (error) {
      console.error("Failed to load agent progress:", error);
    } finally {
      setLoading(false);
    }
  }

  async function peekAgent(agent: AgentProgress) {
    setDrawerAgent(agent);
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/manager/tasks/email-requests?assignedTo=${agent.id}&status=IN_PROGRESS&take=20`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.tasks) {
        setDrawerTasks(data.tasks as Task[]);
      }
    } catch (error) {
      console.error("Failed to load agent tasks:", error);
    } finally {
      setDrawerLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Card className="p-5 space-y-4 relative">
      <div className="flex items-center justify-between">
        <H2>📈 Agent Progress</H2>
        <div className="flex items-center gap-2">
          <SmallButton onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</SmallButton>
          <SmallButton onClick={() => setOpen((s) => !s)}>{open ? "Hide" : "Show"}</SmallButton>
        </div>
      </div>

      {!open ? null : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm rounded-xl overflow-hidden">
            <thead className="bg-white/[0.04]">
              <tr className="text-left text-white/60">
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2 w-28">Assigned</th>
                <th className="px-3 py-2 w-32">In Progress</th>
                <th className="px-3 py-2 w-36">Completed Today</th>
                <th className="px-3 py-2 w-44">Task Breakdown</th>
                <th className="px-3 py-2 w-44">Last Activity</th>
                <th className="px-3 py-2 w-1">Peek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${row.isLive ? "bg-green-400" : "bg-gray-400"}`} />
                      <div>
                        <div className="font-medium text-white">{row.name}</div>
                        <div className="text-xs text-white/50">{row.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-white/80">{row.assigned}</td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                      {row.inProgress}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                      {row.completedToday}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {row.taskTypeBreakdown ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-blue-400">💬</span>
                          <span>Text: {row.taskTypeBreakdown.textClub.assigned}</span>
                          <span className="text-white/40">•</span>
                          <span>WOD: {row.taskTypeBreakdown.wodIvcs.assigned}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-green-400">📧</span>
                          <span>Email: {row.taskTypeBreakdown.emailRequests.assigned}</span>
                          <span className="text-white/40">•</span>
                          <span>Refund: {row.taskTypeBreakdown.standaloneRefunds.assigned}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-white/60 text-xs">
                    {row.lastActivity ? fmtDate(row.lastActivity) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <SmallButton onClick={() => peekAgent(row)}>
                      Open
                    </SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer for peeking at agent tasks */}
      {drawerAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {drawerAgent.name}'s Email Request Tasks
              </h3>
              <SmallButton onClick={() => setDrawerAgent(null)}>
                Close
              </SmallButton>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {drawerLoading ? (
                <div className="text-center py-8 text-white/60">Loading tasks...</div>
              ) : drawerTasks.length === 0 ? (
                <div className="text-center py-8 text-white/60">No tasks in progress</div>
              ) : (
                <div className="space-y-3">
                  {drawerTasks.map((task) => (
                    <div key={task.id} className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">
                            {task.salesforceCaseNumber || task.emailRequestFor || task.id}
                          </div>
                          <div className="text-sm text-white/60">
                            {task.emailRequestFor || "Email Request"}
                          </div>
                        </div>
                        <div className="text-xs text-white/50">
                          {fmtDate(task.createdAt)}
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
    </Card>
  );
}

/* ========================================================================== */
/*  Microsoft Forms Integration Section                                       */
/* ========================================================================== */
function MicrosoftFormsSection() {
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [lastImportInfo, setLastImportInfo] = useState<any>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<any>(null);

  async function loadLastImportInfo() {
    try {
      const res = await fetch("/api/email-requests/last-import-info", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setLastImportInfo(data.data);
      }
    } catch (error) {
      console.error("Failed to load last import info:", error);
    }
  }

  async function testConnection() {
    setTestingConnection(true);
    try {
      const res = await fetch("/api/email-requests/test-connection", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setConnectionStatus(data);
    } catch (error) {
      console.error("Failed to test connection:", error);
      setConnectionStatus({ success: false, error: "Connection test failed" });
    } finally {
      setTestingConnection(false);
    }
  }

  async function importFromMicrosoftForms() {
    setLoading(true);
    try {
      const res = await fetch("/api/email-requests/import-from-forms", { 
        method: "POST",
        cache: "no-store" 
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setImportResults(data.results);
        loadLastImportInfo(); // Refresh last import info
      } else {
        console.error("Import failed:", data?.error);
        setImportResults({ 
          imported: 0, 
          skipped: 0, 
          errors: 1, 
          totalProcessed: 0,
          message: data?.error || "Import failed"
        });
      }
    } catch (error) {
      console.error("Failed to import from Microsoft Forms:", error);
      setImportResults({ 
        imported: 0, 
        skipped: 0, 
        errors: 1, 
        totalProcessed: 0,
        message: "Import failed"
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLastImportInfo();
  }, []);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📧 Microsoft Forms Integration</H2>
        <div className="flex items-center gap-2">
          <SmallButton onClick={loadLastImportInfo} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </SmallButton>
        </div>
      </div>

      <div className="space-y-4">
        {/* Connection Status */}
        {connectionStatus && (
          <div className={`rounded-lg p-4 ${connectionStatus.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <h3 className={`font-medium mb-2 ${connectionStatus.success ? 'text-green-300' : 'text-red-300'}`}>
              {connectionStatus.success ? '✅ Connection Successful' : '❌ Connection Failed'}
            </h3>
            <div className="text-sm text-white/60 space-y-1">
              {connectionStatus.success ? (
                <div>
                  <div>Site ID: {connectionStatus.details?.siteId}</div>
                  <div>Excel File: {connectionStatus.details?.fileName}</div>
                  <div>File ID: {connectionStatus.details?.excelFileId}</div>
                </div>
              ) : (
                <div>
                  <div>Error: {connectionStatus.error}</div>
                  {connectionStatus.details && (
                    <div className="mt-2 text-xs">
                      <div>Client ID: {connectionStatus.details.clientId ? '✅' : '❌'}</div>
                      <div>Client Secret: {connectionStatus.details.clientSecret ? '✅' : '❌'}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Last Import Info */}
        {lastImportInfo && (
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">Last Import Information</h3>
            <div className="text-sm text-white/60 space-y-1">
              <div>Last Import: {fmtDate(lastImportInfo.lastImportTime)}</div>
              <div>Last Row Imported: {lastImportInfo.lastRowNumber}</div>
              <div>Total Imported: {lastImportInfo.totalImported}</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <SmallButton 
            onClick={testConnection} 
            disabled={testingConnection}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {testingConnection ? "Testing..." : "Test Connection"}
          </SmallButton>
          <PrimaryButton 
            onClick={importFromMicrosoftForms} 
            disabled={loading}
          >
            {loading ? "Importing..." : "Import from Microsoft Forms"}
          </PrimaryButton>
        </div>
        
        <div className="text-sm text-white/60">
          Test the Microsoft Graph connection first, then import new email requests from the Microsoft Forms Excel sheet
        </div>

        {/* Import Results */}
        {importResults && (
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">Import Results</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{importResults.imported}</div>
                <div className="text-sm text-white/60">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{importResults.skipped}</div>
                <div className="text-sm text-white/60">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{importResults.errors}</div>
                <div className="text-sm text-white/60">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{importResults.totalProcessed}</div>
                <div className="text-sm text-white/60">Total Processed</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  CSV Import Section (Fallback)                                            */
/* ========================================================================== */
function CsvImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  async function importCsv() {
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/email-requests/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResults(data.results);
      } else {
        console.error("Import failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to import CSV:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <H2>📁 CSV Import (Fallback)</H2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
          {file && (
            <div className="mt-2 text-sm text-white/60">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <PrimaryButton 
            onClick={importCsv} 
            disabled={loading || !file}
          >
            {loading ? "Importing..." : "Import CSV"}
          </PrimaryButton>
          <div className="text-sm text-white/60">
            Fallback method for importing email requests from CSV
          </div>
        </div>

        {/* Import Results */}
        {results && (
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">Import Results</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{results.imported}</div>
                <div className="text-sm text-white/60">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{results.errors}</div>
                <div className="text-sm text-white/60">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{results.totalRows}</div>
                <div className="text-sm text-white/60">Total Rows</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Admin Section (Users & Access)                                           */
/* ========================================================================== */
function AdminSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'AGENT',
    tempPassword: ''
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/manager/users', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const createUser = async () => {
    if (!newUser.email) return;
    
    try {
      const res = await fetch('/api/manager/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      
      if (res.ok) {
        setNewUser({ name: '', email: '', role: 'AGENT', tempPassword: '' });
        loadUsers();
      }
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  };

  const resetPassword = async (userId: string) => {
    try {
      const res = await fetch(`/api/manager/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      if (res.ok) {
        loadUsers();
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
    }
  };

  const removeAccess = async (userId: string) => {
    try {
      const res = await fetch(`/api/manager/users/${userId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        loadUsers();
      }
    } catch (error) {
      console.error('Failed to remove access:', error);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <H2>👥 Users & Access (Admin)</H2>
        <SmallButton onClick={loadUsers} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </SmallButton>
      </div>

      {/* Create User Form */}
      <div className="bg-white/5 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-white">Create New User</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Name (optional)"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white placeholder-white/50"
          />
          <input
            type="email"
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white placeholder-white/50"
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white"
          >
            <option value="AGENT">Agent</option>
            <option value="MANAGER">Manager</option>
            <option value="MANAGER_AGENT">Manager + Agent</option>
          </select>
          <input
            type="password"
            placeholder="Temp password (optional)"
            value={newUser.tempPassword}
            onChange={(e) => setNewUser({ ...newUser, tempPassword: e.target.value })}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white placeholder-white/50"
          />
        </div>
        <PrimaryButton onClick={createUser} disabled={!newUser.email}>
          Create User
        </PrimaryButton>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Live/Pause</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-3">
                  <div className="font-medium text-white">{user.name || 'Unknown'}</div>
                </td>
                <td className="px-3 py-3 text-white/80">{user.email}</td>
                <td className="px-3 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => {
                      // Handle role change
                    }}
                    className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                  >
                    <option value="AGENT">Agent</option>
                    <option value="MANAGER">Manager</option>
                    <option value="MANAGER_AGENT">Manager + Agent</option>
                  </select>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={user.isLive}
                      onChange={() => {
                        // Handle live/pause toggle
                      }}
                      className="w-4 h-4 text-green-600 bg-white/10 border-white/20 rounded focus:ring-green-500"
                    />
                    <span className="text-white/80 text-xs">Live</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-white/60 text-xs">
                  {user.lastSeen ? fmtDate(user.lastSeen) : '—'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <SmallButton onClick={() => resetPassword(user.id)}>
                      Reset password
                    </SmallButton>
                    <SmallButton 
                      onClick={() => removeAccess(user.id)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Remove Access
                    </SmallButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Main Component                                                            */
/* ========================================================================== */
function EmailRequestsPageContent() {
  const { activeSection, setActiveSection } = useDashboardNavigation();
  
  // Overview data
  const [overviewData, setOverviewData] = useState({
    pendingCount: 0,
    inProgressCount: 0,
    completedTodayCount: 0,
    totalCompletedCount: 0,
    progressPercentage: 0,
    totalTasks: 0,
    requestTypeBreakdown: [] as Array<{ type: string; count: number }>,
    lastImport: null as { date: string; imported: number; duplicates: number } | null
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

  // Auto logout hook
  const { timeLeft, extendSession } = useAutoLogout({ timeoutMinutes: 50 });

  // Load overview data
  const loadOverviewData = async () => {
    setOverviewLoading(true);
    try {
      console.log("🔍 [Email Requests] Loading overview data...");
      const response = await fetch('/api/manager/dashboard/email-requests-overview');
      console.log("🔍 [Email Requests] Overview API response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 [Email Requests] Overview API data:", data);
        
        if (data.success) {
          setOverviewData(data.data);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("🔍 [Email Requests] Overview API error:", response.status, response.statusText, errorData);
        // Set default values on error
        setOverviewData({
          pendingCount: 0,
          inProgressCount: 0,
          completedTodayCount: 0,
          totalCompletedCount: 0,
          progressPercentage: 0,
          totalTasks: 0,
          requestTypeBreakdown: [],
          lastImport: null
        });
      }
    } catch (error) {
      console.error("🔍 [Email Requests] Error loading overview data:", error);
      // Set default values on error
      setOverviewData({
        pendingCount: 0,
        inProgressCount: 0,
        completedTodayCount: 0,
        totalCompletedCount: 0,
        progressPercentage: 0,
        totalTasks: 0,
        requestTypeBreakdown: [],
        lastImport: null
      });
    } finally {
      setOverviewLoading(false);
    }
  };

  // Load assistance requests - get all non-Holds requests for cross-visibility
  const loadAssistanceRequests = async () => {
    try {
      console.log("🔍 [Email Requests] Loading assistance requests...");
      const response = await fetch('/api/manager/assistance', { cache: 'no-store' });
      console.log("🔍 [Email Requests] Assistance API response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 [Email Requests] Assistance API data:", data);
        
        if (data.success) {
          // Get all non-Holds requests (for cross-task-type visibility)
          const allNonHoldsRequests = (data.requests || []).filter((req: any) => 
            req.taskType !== 'HOLDS' && 
            (req.taskType === 'TEXT_CLUB' || 
             req.taskType === 'WOD_IVCS' || 
             req.taskType === 'EMAIL_REQUESTS' || 
             req.taskType === 'YOTPO' ||
             req.taskType === 'STANDALONE_REFUNDS')
          );
          
          console.log("🔍 [Email Requests] All non-Holds requests count:", allNonHoldsRequests.length);
          
          setAssistanceRequests(allNonHoldsRequests);
          
          // Check for pending requests (all non-Holds)
          const pendingRequests = allNonHoldsRequests.filter((req: any) => req.status === 'ASSISTANCE_REQUIRED');
          const currentPendingCount = assistanceRequests.filter((r: any) => r.status === 'ASSISTANCE_REQUIRED').length;
          const newPendingCount = pendingRequests.length;
          
          console.log("🔍 [Email Requests] Current pending count:", currentPendingCount, "New pending count:", newPendingCount);
          
          // Show notification if there are pending requests
          // Show on first load if there are any pending, or if there are new pending requests
          if (newPendingCount > 0) {
            if (currentPendingCount === 0 || newPendingCount > currentPendingCount) {
              console.log("🔍 [Email Requests] New pending assistance requests detected!");
              setNewAssistanceCount(Math.max(1, newPendingCount - currentPendingCount));
              setShowNotification(true);
              setTimeout(() => setShowNotification(false), 5000);
            }
          }
          
          setNewAssistanceCount(newPendingCount);
        }
      } else {
        console.error("🔍 [Email Requests] Assistance API error:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("🔍 [Email Requests] Error loading assistance requests:", error);
    }
  };

  useEffect(() => {
    loadAssistanceRequests();
    const interval = setInterval(loadAssistanceRequests, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Load overview data when overview section is active
  useEffect(() => {
    if (activeSection === "overview") {
      loadOverviewData();
    }
  }, [activeSection]);

  // Header actions
  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <SmallButton 
        onClick={() => window.location.href = '/agent'}
        className="bg-green-600 hover:bg-green-700"
      >
        Switch to Agent
      </SmallButton>
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
    </>
  );

  return (
    <DashboardLayout headerActions={headerActions}>

      {/* Auto Logout Warning */}
      <AutoLogoutWarning />

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
                <h3 className="text-lg font-semibold">📊 Email Requests Overview</h3>
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

              {/* Request Type Breakdown */}
              {overviewData.requestTypeBreakdown.length > 0 && (
                <div className="mb-8">
                  <h4 className="text-md font-semibold mb-4">📋 Request Type Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {overviewData.requestTypeBreakdown.map((item, index) => (
                      <div key={index} className="bg-white/5 rounded-lg p-4 border border-white/10">
                        <div className="text-white/80 text-sm font-medium truncate" title={item.type}>
                          {item.type}
                        </div>
                        <div className="text-2xl font-bold mt-1 text-blue-400">{item.count}</div>
                        <div className="text-xs text-white/40 mt-1">pending requests</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Task Management Section */}
        {activeSection === "tasks" && (
          <div className="space-y-8">
            <MicrosoftFormsSection />
            <CsvImportSection />
            <AssignEmailRequestTasksSection />
            <PendingEmailRequestTasksSection />
          </div>
        )}

        {/* Assistance Requests Section */}
        {activeSection === "assistance" && (
          <div className="space-y-8">
            <AssistanceRequestsSection 
              taskType="EMAIL_REQUESTS" 
              onPendingCountChange={(count) => {
                const previousCount = assistanceRequests.filter((r: any) => r.status === 'ASSISTANCE_REQUIRED').length;
                // Update badge count
                setAssistanceRequests((prev: any[]) => {
                  // Create a dummy array with the right count for badge calculation
                  const newArray = Array(count).fill({ status: 'ASSISTANCE_REQUIRED' });
                  return newArray as any[];
                });
                // Show notification if count increased
                if (count > 0 && (previousCount === 0 || count > previousCount)) {
                  setNewAssistanceCount(Math.max(1, count - previousCount));
                  setShowNotification(true);
                  setTimeout(() => setShowNotification(false), 5000);
                }
              }}
            />
          </div>
        )}

        {/* Agent Management Section */}
        {activeSection === "agents" && (
          <div className="space-y-8">
            <AgentProgressSection />
          </div>
        )}

        {/* Analytics Section */}
        {activeSection === "analytics" && (
          <div className="space-y-8">
            <EmailRequestsAnalytics />
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

// Export with provider wrapper
export default function EmailRequestsPage() {
  return (
    <DashboardNavigationProvider>
      <EmailRequestsPageContent />
    </DashboardNavigationProvider>
  );
}

/* ========================================================================== */
/*  Assign Email Request Tasks Section                                        */
/* ========================================================================== */
function AssignEmailRequestTasksSection() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [perAgentCap, setPerAgentCap] = useState(50);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentWorkloads, setAgentWorkloads] = useState<Record<string, any>>({});

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch('/api/manager/agents', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setAgents(data.agents);
        setSelectedAgents((prev) => prev.filter((e) => data.agents.some((a: any) => a.email === e)));
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadAgentWorkloads = async () => {
    try {
      const response = await fetch('/api/manager/agents/workload');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const workloadMap: Record<string, any> = {};
          data.data.forEach((item: any) => {
            workloadMap[item.agentId] = item.workload;
          });
          setAgentWorkloads(workloadMap);
        }
      }
    } catch (error) {
      console.error('Error loading agent workloads:', error);
    }
  };

  const assignTasks = async () => {
    if (selectedAgents.length === 0) return;
    
    setAssigning(true);
    try {
      // Map agent emails to agent IDs
      const agentIdMap = new Map(agents.map(a => [a.email, a.id]));
      const agentIds = selectedAgents.map(email => agentIdMap.get(email)).filter(Boolean) as string[];
      
      if (agentIds.length === 0) {
        alert('No valid agents selected');
        return;
      }

      const res = await fetch('/api/manager/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentIds: agentIds,
          perAgentCap,
          taskType: 'EMAIL_REQUESTS'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Successfully assigned ${data.assigned} Email Request tasks!`);
        setSelectedAgents([]);
        loadAgents(); // Refresh to update workload
        loadAgentWorkloads(); // Refresh workloads
      } else {
        alert(`Assignment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to assign tasks:', error);
      alert('Failed to assign tasks');
    } finally {
      setAssigning(false);
    }
  };

  const toggleAgent = (agentEmail: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentEmail) 
        ? prev.filter(email => email !== agentEmail)
        : [...prev, agentEmail]
    );
  };

  const toggleSelectAll = () => {
    const allSelected = selectedAgents.length === agents.length;
    setSelectedAgents(allSelected ? [] : agents.map(agent => agent.email));
  };

  useEffect(() => {
    loadAgents();
    loadAgentWorkloads();
  }, []);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>🎯 Assign Email Request Tasks</H2>
        <SmallButton onClick={() => { loadAgents(); loadAgentWorkloads(); }} disabled={agentsLoading || loading}>
          {loading || agentsLoading ? "Loading..." : "🔄 Refresh"}
        </SmallButton>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/60">
            Choose agents ({selectedAgents.length}/{agents.length} selected)
          </div>
          <SmallButton onClick={toggleSelectAll} disabled={agentsLoading || agents.length === 0}>
            {selectedAgents.length === agents.length ? "Clear all" : "Select all"}
          </SmallButton>
        </div>

        <div className="max-h-56 overflow-auto rounded-lg bg-white/[0.03] ring-1 ring-white/10 p-2 space-y-1">
          {agentsLoading && <div className="text-sm text-white/60 p-1">Loading agents…</div>}
          {!agentsLoading && agents.length === 0 && (
            <div className="text-sm text-white/60 p-1">No agents found.</div>
          )}
          {agents.map((a) => {
            const workload = agentWorkloads[a.id] || { wodIvcs: 0, textClub: 0, emailRequests: 0, standaloneRefunds: 0, yotpo: 0, holds: 0, total: 0 };
            return (
              <label key={a.email} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={selectedAgents.includes(a.email)}
                  onChange={() =>
                    setSelectedAgents((prev) =>
                      prev.includes(a.email) ? prev.filter((e) => e !== a.email) : [...prev, a.email]
                    )
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {a.name || a.email} — <span className="text-white/60">{a.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/50 mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      WOD/IVCS: {workload.wodIvcs}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      Text Club: {workload.textClub}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Email: {workload.emailRequests}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                      Yotpo: {workload.yotpo}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                      Holds: {workload.holds}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                      Refunds: {workload.standaloneRefunds}
                    </span>
                    <span className="text-white/70 font-medium">
                      Total: {workload.total}
                    </span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label>
          <div className="text-sm text-white/60 mb-1">Per-agent cap (this run)</div>
          <input
            type="number"
            min={1}
            value={perAgentCap}
            onChange={(e) => setPerAgentCap(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
          />
          <div className="text-xs text-white/50 mt-1">Absolute hard cap is 200 per agent.</div>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <PrimaryButton 
          onClick={assignTasks}
          disabled={assigning || selectedAgents.length === 0 || perAgentCap <= 0}
        >
          {assigning ? "Assigning…" : "Assign Now"}
        </PrimaryButton>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Pending Email Request Tasks Section                                       */
/* ========================================================================== */
function PendingEmailRequestTasksSection() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [assignedFilter, setAssignedFilter] = useState('anyone');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [viewingTask, setViewingTask] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);

  const itemsPerPage = 50;

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/manager/agents', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        take: itemsPerPage.toString(),
        skip: ((currentPage - 1) * itemsPerPage).toString(),
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (assignedFilter !== 'anyone') {
        if (assignedFilter === 'unassigned') {
          // We'll handle this in the API
        } else {
          params.set('assignedTo', assignedFilter);
        }
      }

      const res = await fetch(`/api/manager/tasks/email-requests?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTasks(data.tasks);
        setTotalCount(data.totalCount);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignTask = async (taskId: string, agentId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/manager/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        loadTasks(); // Refresh tasks
      } else {
        alert(`Assignment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to assign task:', error);
      alert('Failed to assign task');
    } finally {
      setAssigning(false);
    }
  };

  const unassignTask = async (taskId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/manager/tasks/${taskId}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        loadTasks(); // Refresh tasks
      } else {
        alert(`Unassignment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to unassign task:', error);
      alert('Failed to unassign task');
    } finally {
      setAssigning(false);
    }
  };

  const assignSelected = async (agentId: string) => {
    if (selectedTasks.length === 0) return;
    
    setAssigning(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      
      // Assign each selected task individually (like unassignSelected)
      for (const taskId of selectedTasks) {
        try {
          const res = await fetch(`/api/manager/tasks/${taskId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: agentId
            })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to assign task ${taskId}:`, data.error);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error assigning task ${taskId}:`, error);
        }
      }
      
      if (successCount === selectedTasks.length) {
        alert(`Successfully assigned ${successCount} tasks!`);
      } else if (successCount > 0) {
        alert(`⚠️ ${successCount}/${selectedTasks.length} tasks assigned`);
      } else {
        alert(`Assignment failed for all ${selectedTasks.length} tasks`);
      }
      
      setSelectedTasks([]);
      loadTasks();
    } catch (error) {
      console.error('Failed to assign tasks:', error);
      alert('Failed to assign tasks');
    } finally {
      setAssigning(false);
    }
  };

  const unassignSelected = async () => {
    if (selectedTasks.length === 0) return;
    
    setAssigning(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      
      // Unassign each task individually (like WOD/IVCS)
      for (const taskId of selectedTasks) {
        try {
          const res = await fetch(`/api/manager/tasks/${taskId}/unassign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to unassign task ${taskId}:`, data.error);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error unassigning task ${taskId}:`, error);
        }
      }
      
      if (successCount === selectedTasks.length) {
        alert(`Successfully unassigned ${successCount} tasks!`);
      } else if (successCount > 0) {
        alert(`⚠️ ${successCount}/${selectedTasks.length} tasks unassigned`);
      } else {
        alert(`Unassignment failed for all ${selectedTasks.length} tasks`);
      }
      
      setSelectedTasks([]);
      loadTasks();
    } catch (error) {
      console.error('Failed to unassign tasks:', error);
      alert('Failed to unassign tasks');
    } finally {
      setAssigning(false);
    }
  };

  const toggleTask = (taskId: string) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const selectAll = () => {
    setSelectedTasks(tasks.map(task => task.id));
  };

  const selectNone = () => {
    setSelectedTasks([]);
  };

  useEffect(() => {
    loadTasks();
    loadAgents();
  }, [statusFilter, assignedFilter, currentPage]);

  const filteredTasks = tasks.filter(task => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      task.email?.toLowerCase().includes(searchLower) ||
      task.text?.toLowerCase().includes(searchLower) ||
      task.salesforceCaseNumber?.toLowerCase().includes(searchLower) ||
      task.emailRequestFor?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📁 Pending Email Request Tasks</H2>
        <SmallButton onClick={loadTasks} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </SmallButton>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="all">All</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Assigned</label>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="anyone">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Search</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search email, name, case number..."
              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <SmallButton onClick={loadTasks}>Search</SmallButton>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedTasks.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-white">
              {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-sm">Assign selected to:</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      assignSelected(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  disabled={assigning}
                  className="px-3 py-1 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  defaultValue=""
                >
                  <option value="">Choose agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <SmallButton onClick={selectNone}>Clear Selection</SmallButton>
                <SmallButton onClick={unassignSelected} disabled={assigning}>
                  Unassign Selected
                </SmallButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-2">
                <input
                  type="checkbox"
                  checked={selectedTasks.length === tasks.length && tasks.length > 0}
                  onChange={selectedTasks.length === tasks.length ? selectNone : selectAll}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
              </th>
              <th className="text-left py-3 px-2 text-white/80">Status</th>
              <th className="text-left py-3 px-2 text-white/80">Email</th>
              <th className="text-left py-3 px-2 text-white/80">Name</th>
              <th className="text-left py-3 px-2 text-white/80">SF Case</th>
              <th className="text-left py-3 px-2 text-white/80">Request Type</th>
              <th className="text-left py-3 px-2 text-white/80">Assigned To</th>
              <th className="text-left py-3 px-2 text-white/80">Created</th>
              <th className="text-left py-3 px-2 text-white/80">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <tr key={task.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-2">
                  <input
                    type="checkbox"
                    checked={selectedTasks.includes(task.id)}
                    onChange={() => toggleTask(task.id)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                </td>
                <td className="py-3 px-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    task.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                    task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {task.status}
                  </span>
                </td>
                <td className="py-3 px-2 text-white/80">{task.email || 'N/A'}</td>
                <td className="py-3 px-2 text-white/80">{task.text || task.customerNameNumber || 'N/A'}</td>
                <td className="py-3 px-2 text-white/80">{task.salesforceCaseNumber || 'N/A'}</td>
                <td className="py-3 px-2 text-white/80">{task.emailRequestFor || 'N/A'}</td>
                <td className="py-3 px-2 text-white/80">
                  {task.assignedTo ? task.assignedTo.name : 'Unassigned'}
                </td>
                <td className="py-3 px-2 text-white/60">{fmtDate(task.createdAt)}</td>
                <td className="py-3 px-2">
                  <div className="flex gap-1">
                    <SmallButton onClick={() => setViewingTask(task)}>
                      View
                    </SmallButton>
                    {task.assignedTo ? (
                      <SmallButton 
                        onClick={() => unassignTask(task.id)}
                        disabled={assigning}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Unassign
                      </SmallButton>
                    ) : (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            assignTask(task.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        disabled={assigning}
                        className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        defaultValue=""
                      >
                        <option value="">Assign to...</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-white/60">
          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} tasks
        </div>
        <div className="flex gap-2">
          <SmallButton 
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </SmallButton>
          <span className="px-3 py-1 text-white/80">Page {currentPage}</span>
          <SmallButton 
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={currentPage * itemsPerPage >= totalCount}
          >
            Next
          </SmallButton>
        </div>
      </div>

      {/* Task Preview Modal */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Email Request Task Details
              </h3>
              <SmallButton onClick={() => setViewingTask(null)}>
                Close
              </SmallButton>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-white/80">Status</label>
                  <div className="text-white">
                    <span className={`px-2 py-1 rounded text-xs ${
                      viewingTask.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                      viewingTask.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {viewingTask.status}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">Assigned To</label>
                  <div className="text-white">
                    {viewingTask.assignedTo ? viewingTask.assignedTo.name : 'Unassigned'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">Email</label>
                  <div className="text-white">{viewingTask.email || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">Name</label>
                  <div className="text-white">{viewingTask.text || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">SalesForce Case</label>
                  <div className="text-white">{viewingTask.salesforceCaseNumber || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">Request Type</label>
                  <div className="text-white">{viewingTask.emailRequestFor || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">Completion Time</label>
                  <div className="text-white">
                    {viewingTask.completionTime ? fmtDate(viewingTask.completionTime) : 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80">Created</label>
                  <div className="text-white">{fmtDate(viewingTask.createdAt)}</div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-white/80">Details</label>
                <div className="mt-1 p-3 bg-white/5 rounded-lg text-white whitespace-pre-wrap">
                  {viewingTask.details || 'No details provided'}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                {viewingTask.assignedTo ? (
                  <SmallButton 
                    onClick={() => {
                      unassignTask(viewingTask.id);
                      setViewingTask(null);
                    }}
                    disabled={assigning}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Unassign Task
                  </SmallButton>
                ) : (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        assignTask(viewingTask.id, e.target.value);
                        setViewingTask(null);
                        e.target.value = '';
                      }
                    }}
                    disabled={assigning}
                    className="px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    defaultValue=""
                  >
                    <option value="">Assign to...</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}