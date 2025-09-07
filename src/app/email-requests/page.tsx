"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import { AssistanceRequestsSection } from "@/app/manager/_components/AssistanceRequestsSection";
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/app/_components/AutoLogoutWarning';
import SessionTimer from '@/app/_components/SessionTimer';
import ThemeToggle from '@/app/_components/ThemeToggle';

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
export default function EmailRequestsPage() {
  const [activeSection, setActiveSection] = useState("overview");
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
  useAutoLogout();

  // Load assistance requests
  const loadAssistanceRequests = async () => {
    try {
      const response = await fetch('/api/manager/assistance', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const emailRequests = data.requests.filter((req: any) => req.taskType === 'EMAIL_REQUESTS');
          setAssistanceRequests(emailRequests);
          
          // Check for new requests
          const pendingRequests = emailRequests.filter((req: any) => req.status === 'ASSISTANCE_REQUIRED');
          if (pendingRequests.length > newAssistanceCount && newAssistanceCount > 0) {
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
    const interval = setInterval(loadAssistanceRequests, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const navigationItems = [
    { id: "overview", label: "📊 Overview", description: "Email Requests metrics and progress" },
    { id: "tasks", label: "📋 Task Management", description: "Import, assign, and manage Email Request tasks" },
    { id: "assistance", label: "🆘 Assistance Requests", description: "Respond to agent assistance requests", badge: assistanceRequests.filter(r => r.status === "ASSISTANCE_REQUIRED").length },
    { id: "agents", label: "👥 Agent Management", description: "Monitor agent progress and performance" },
    { id: "analytics", label: "📈 Analytics", description: "Completed work and performance insights" },
    { id: "admin", label: "⚙️ Administration", description: "Users, settings, and system management" }
  ];

  return (
    <main className="mx-auto max-w-[1400px] p-6 text-white dark:text-white light:text-slate-800 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
      <header className="sticky top-0 z-30 bg-gradient-to-b from-neutral-900 via-neutral-900/95 to-neutral-900/80 dark:from-neutral-900 dark:via-neutral-900/95 dark:to-neutral-900/80 light:from-white light:via-white/95 light:to-white/80 backdrop-blur-sm border-b border-white/10 dark:border-white/10 light:border-slate-200 shadow-lg">
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/golden-attentive-logo.svg" 
                alt="Golden Attentive" 
                className="h-14 w-auto"
              />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Email Requests Dashboard</h1>
                <p className="text-sm text-white/60">Email Request Task Management & Analytics</p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Session Timer */}
              <SessionTimer />
              
              {/* Extend Session */}
              <SmallButton className="bg-blue-600 hover:bg-blue-700">
                Extend
              </SmallButton>
              
              {/* Switch to Agent */}
              <SmallButton className="bg-green-600 hover:bg-green-700">
                Switch to Agent
              </SmallButton>
              
              {/* Logout */}
              <SmallButton className="bg-red-600 hover:bg-red-700">
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
        </div>
      )}

      {/* Content Sections */}
      <div className="space-y-8 mt-8">
        {/* Overview Section */}
        {activeSection === "overview" && (
          <div className="space-y-8">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">📊 Email Requests Overview</h3>
              <div className="text-white/60 text-center py-8">
                Overview metrics and progress tracking (coming soon)
              </div>
            </Card>
          </div>
        )}

        {/* Task Management Section */}
        {activeSection === "tasks" && (
          <div className="space-y-8">
            <MicrosoftFormsSection />
            <CsvImportSection />
          </div>
        )}

        {/* Assistance Requests Section */}
        {activeSection === "assistance" && (
          <div className="space-y-8">
            <AssistanceRequestsSection taskType="EMAIL_REQUESTS" />
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
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">📈 Analytics</h3>
              <div className="text-white/60 text-center py-8">
                Analytics and reporting for Email Request tasks (coming soon)
              </div>
            </Card>
          </div>
        )}

        {/* Administration Section */}
        {activeSection === "admin" && (
          <div className="space-y-8">
            <AdminSection />
          </div>
        )}
      </div>
    </main>
  );
}