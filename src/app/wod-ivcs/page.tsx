"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';

// Import existing components we'll reuse
import { AssistanceRequestsSection } from "@/app/manager/_components/AssistanceRequestsSection";
import { CsvImportSection } from "./_components/CsvImportSection";
import { WodIvcsTasksSection } from "./_components/WodIvcsTasksSection";
import { AnalyticsSection } from "./_components/AnalyticsSection";
import UnifiedSettings from '@/app/_components/UnifiedSettings';

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
  documentNumber?: string | null;
  webOrder?: string | null;
  customerName?: string | null;
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
      const res = await fetch("/api/manager/dashboard/wod-ivcs-agent-progress", { cache: "no-store" });
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
      const res = await fetch(`/api/manager/tasks/wod-ivcs?assignedTo=${agent.id}&status=IN_PROGRESS&take=20`, { cache: "no-store" });
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
                {drawerAgent.name}'s WOD/IVCS Tasks
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
                            {task.documentNumber || task.webOrder || task.id}
                          </div>
                          <div className="text-sm text-white/60">
                            {task.customerName || "Unknown Customer"}
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
/*  Users & Access (Admin)                                                     */
/* ========================================================================== */
function UsersAdminSection() {
  const [rows, setRows] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"AGENT" | "MANAGER" | "MANAGER_AGENT">("AGENT");
  const [tempPw, setTempPw] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/users", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.users)) setRows(data.users as Agent[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("create");
    try {
      const res = await fetch("/api/manager/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim(), role, tempPassword: tempPw || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { alert(data?.error || "Create failed"); return; }
      setName(""); setEmail(""); setTempPw(""); setRole("AGENT");
      await load();
    } finally { setBusy(null); }
  }

  async function setRoleFor(id: string, next: "AGENT" | "MANAGER" | "MANAGER_AGENT") {
    setBusy(`role:${id}`);
    try {
      const res = await fetch("/api/manager/users/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) alert(data?.error || "Failed to update role");
      else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: next } : r)));
    } finally { setBusy(null); }
  }

  async function toggleLive(id: string, next: boolean) {
    setBusy(`live:${id}`);
    try {
      const res = await fetch("/api/manager/users/live", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isLive: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) alert(data?.error || "Failed to toggle status");
      else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isLive: next } : r)));
    } finally { setBusy(null); }
  }

  async function resetPassword(id: string) {
    const pw = prompt("Enter a temporary password for this user (they should change it on first login):");
    if (!pw) return;
    setBusy(`pw:${id}`);
    try {
      const res = await fetch("/api/manager/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tempPassword: pw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) alert(data?.error || "Failed to reset password");
      else alert("Temporary password set.");
    } finally { setBusy(null); }
  }

  async function removeAccess(id: string) {
    if (!confirm("Are you sure you want to remove access for this user? This will pause their account and clear their last seen time.")) {
      return;
    }
    setBusy(`remove:${id}`);
    try {
      const res = await fetch(`/api/manager/users?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to remove access");
      } else {
        alert(data?.message || "Access removed successfully");
        await load(); // Refresh the list
      }
    } finally { setBusy(null); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>👥 Users & Access (Admin)</H2>
        <SmallButton onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</SmallButton>
      </div>

      {/* Create */}
      <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10"
        >
          <option value="AGENT">Agent</option>
          <option value="MANAGER">Manager</option>
          <option value="MANAGER_AGENT">Manager + Agent</option>
        </select>
        <input
          placeholder="Temp password (optional)"
          value={tempPw}
          onChange={(e) => setTempPw(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <PrimaryButton disabled={busy === "create"}>{busy === "create" ? "Creating…" : "Create User"}</PrimaryButton>
      </form>

      {/* List */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Live/Pause</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2 w-56">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr><td className="px-3 py-3 text-white/60" colSpan={6}>{loading ? "Loading…" : "No users yet."}</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="text-white/90">
                <td className="px-3 py-2">{u.name || u.email}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={u.role || "AGENT"}
                    onChange={(e) => setRoleFor(u.id, e.target.value as any)}
                    className="rounded-md bg-white/10 text-white px-2 py-1 ring-1 ring-white/10 text-xs"
                    disabled={busy?.startsWith("role:")}
                  >
                    <option value="AGENT">Agent</option>
                    <option value="MANAGER">Manager</option>
                    <option value="MANAGER_AGENT">Manager + Agent</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <label className="text-xs flex items-center gap-2 text-white/80">
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={!!u.isLive}
                      onChange={(e) => toggleLive(u.id, e.target.checked)}
                      disabled={busy?.startsWith("live:")}
                    />
                    {u.isLive ? "Live" : "Paused"}
                  </label>
                </td>
                <td className="px-3 py-2">{fmtDate(u.lastSeen || null)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => resetPassword(u.id)} disabled={busy?.startsWith("pw:")}>
                      Reset password
                    </SmallButton>
                    <SmallButton 
                      onClick={() => removeAccess(u.id)} 
                      disabled={busy?.startsWith("remove:")}
                      className="bg-red-600 hover:bg-red-700 text-white"
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

export default function WodIvcsDashboard() {
  const [activeSection, setActiveSection] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [overviewData, setOverviewData] = useState({
    pendingCount: 0,
    inProgressCount: 0,
    completedTodayCount: 0,
    totalCompletedCount: 0,
    progressPercentage: 0,
    totalTasks: 0,
    ageBreakdown: {
      medium: 0,
      high: 0,
      urgent: 0
    },
    detailedBreakdown: {
      medium: [],
      high: [],
      urgent: []
    }
  });
  const [selectedBreakdown, setSelectedBreakdown] = useState<{
    type: 'medium' | 'high' | 'urgent' | 'duplicates' | 'rollovers' | 'dailyImport';
    data: any;
  } | null>(null);

  // Assignment system state (matching Text Club)
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [perAgent, setPerAgent] = useState<number>(50);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string>("");
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentWorkloads, setAgentWorkloads] = useState<Record<string, any>>({});
  
  // Bulk assignment filters
  const [orderAgeFilter, setOrderAgeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Assistance Requests state
  const [assistanceRequests, setAssistanceRequests] = useState<Array<{
    id: string;
    brand: string;
    phone: string;
    text: string;
    agentName: string;
    agentEmail: string;
    assistanceNotes: string;
    managerResponse?: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    taskType?: string;
    // WOD/IVCS specific fields
    wodIvcsSource?: string;
    documentNumber?: string;
    customerName?: string;
    amount?: number;
    webOrderDifference?: number;
    purchaseDate?: string;
    orderAge?: string;
    // Email Request specific fields
    emailRequestFor?: string;
    details?: string;
    // Standalone Refund specific fields
    refundAmount?: number;
    paymentMethod?: string;
    refundReason?: string;
  }>>([]);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);

  const [importAnalytics, setImportAnalytics] = useState<{
    dateRange: {
      start: string;
      end: string;
      days: number;
    };
    importsByDate: Record<string, Record<string, number>>;
    completedByDate: Record<string, Record<string, { total: number; dispositions: Record<string, number>; agents: Record<string, number> }>>;
    duplicateAnalysis: {
      totalDuplicates: number;
      duplicateGroups: Record<string, number>;
    };
    previouslyCompletedAnalysis: {
      totalPreviouslyCompleted: number;
      previouslyCompletedBySource: Record<string, number>;
    };
    summary: {
      totalImported: number;
      totalCompleted: number;
      duplicateCount: number;
      previouslyCompletedCount: number;
    };
  } | null>(null);

  const loadOverviewData = async () => {
    try {
      const response = await fetch('/api/manager/dashboard/wod-ivcs-overview');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setOverviewData(data.data);
        }
      }
    } catch (error) {
      console.error('Error loading overview data:', error);
    }
  };

  const loadImportAnalytics = async () => {
    try {
      const response = await fetch('/api/manager/dashboard/wod-ivcs-import-analytics');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setImportAnalytics(data.data);
        }
      }
    } catch (error) {
      console.error('Error loading import analytics:', error);
    }
  };

  useEffect(() => {
    if (activeSection === "overview") {
      loadOverviewData();
      loadImportAnalytics(); // Load last 3 import sessions
    }
    if (activeSection === "tasks") {
      loadAgents();
      loadAgentWorkloads();
    }
    if (activeSection === "assistance") {
      loadAssistanceRequests();
    }
  }, [activeSection]);

  // Load assistance requests on initial load and set up auto-refresh
  useEffect(() => {
    loadAssistanceRequests();
    
    // Auto-refresh assistance requests every 30 seconds
    const interval = setInterval(() => {
      loadAssistanceRequests();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Assignment functions (copied from Text Club)
  async function loadAgents() {
    try {
      setAgentsLoading(true);
      const res = await fetch("/api/manager/agents", { cache: "no-store" });
      const data = await res.json();
      if (data?.success && Array.isArray(data.agents)) {
        setAgents(data.agents);
        setSelectedAgents((prev) => prev.filter((e) => data.agents.some((a: any) => a.email === e)));
      }
    } finally { 
      setAgentsLoading(false); 
    }
  }

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

  async function loadAssistanceRequests() {
    try {
      console.log("🔍 Loading assistance requests...");
      const response = await fetch("/api/manager/assistance", { cache: "no-store" });
      const data = await response.json();
      
      if (data.success) {
        const newRequests = data.requests || [];
        console.log("🔍 New requests count:", newRequests.length);
        
        // Check for new assistance requests
        const currentCount = assistanceRequests.length;
        const newCount = newRequests.length;
        
        console.log("🔍 Current count:", currentCount, "New count:", newCount);
        
        if (newCount > currentCount) {
          console.log("🔍 New assistance requests detected!");
          setNewAssistanceCount(newCount - currentCount);
          setShowNotification(true);
          
          // Auto-hide notification after 5 seconds
          setTimeout(() => {
            setShowNotification(false);
          }, 5000);
        }
        
        setAssistanceRequests(newRequests);
      } else {
        console.error("Failed to load assistance requests:", data.error);
      }
    } catch (error) {
      console.error("Error loading assistance requests:", error);
    }
  }

  const toggleSelectAll = () => setSelectedAgents(allSelected ? [] : agents.map((a) => a.email));
  const allSelected = agents.length > 0 && selectedAgents.length === agents.length;

  // Helper: fetch oldest unassigned pending WOD/IVCS task IDs up to a limit with filters
  async function fetchUnassignedWodIvcsIds(limit: number, orderAgeFilter?: string, sourceFilter?: string): Promise<{ taskIds: string[] }> {
    try {
      console.log(`[DEBUG] Fetching unassigned WOD/IVCS items with limit=${limit}, ageFilter=${orderAgeFilter}, sourceFilter=${sourceFilter}`);
      
      // Build query parameters
      const params = new URLSearchParams({
        status: 'pending',
        take: limit.toString()
      });
      
      if (orderAgeFilter && orderAgeFilter !== 'all') {
        params.append('orderAge', orderAgeFilter);
      }
      
      if (sourceFilter && sourceFilter !== 'all') {
        params.append('source', sourceFilter);
      }
      
      const res = await fetch(`/api/manager/tasks/wod-ivcs?${params.toString()}`, { 
        method: "GET",
        cache: "no-store" 
      });
      
      const data = await res.json().catch(() => null);
      
      if (data?.success) {
        const taskIds = Array.isArray(data?.items) ? data.items.map((t: any) => t.id) : [];
        console.log(`[DEBUG] Successfully fetched ${taskIds.length} WOD/IVCS task IDs with filters`);
        return { taskIds };
      }
      
      console.warn("Failed to fetch unassigned WOD/IVCS items:", data);
      return { taskIds: [] };
    } catch (error) {
      console.error("Error fetching unassigned WOD/IVCS items:", error);
      return { taskIds: [] };
    }
  }

  // Helper: assign a batch of WOD/IVCS task IDs to one agent
  async function assignWodIvcsBatch(ids: string[], agentId: string) {
    if (ids.length === 0) return { success: true };
    const res = await fetch("/api/manager/tasks/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, agentId }),
    });
    return res.json().catch(() => ({ success: false, error: "Assign failed" }));
  }

  // Main assignment function for WOD/IVCS
  async function doAssign() {
    if (selectedAgents.length === 0) {
      setAssignMsg("Please select at least one agent");
      return;
    }

    setAssignLoading(true);
    setAssignMsg("");

    try {
      const chosen = agents.filter((a) => selectedAgents.includes(a.email));
      const totalNeed = chosen.length * Math.max(1, perAgent);
      
      const unassignedItems = await fetchUnassignedWodIvcsIds(totalNeed, orderAgeFilter, sourceFilter);
      
      if (unassignedItems.taskIds.length === 0) {
        setAssignMsg("No unassigned WOD/IVCS tasks available");
        return;
      }

      // Round-robin distribution
      const perAgentIds: Record<string, string[]> = {};
      for (const a of chosen) perAgentIds[a.email] = [];

      let i = 0;
      for (const taskId of unassignedItems.taskIds) {
        const ag = chosen[i % chosen.length];
        if (!perAgentIds[ag.email]) perAgentIds[ag.email] = [];
        if (perAgentIds[ag.email].length < perAgent) {
          perAgentIds[ag.email].push(taskId);
        }
        i++;
      }

      // Assign batches
      const results: { email: string; count: number }[] = [];
      const BATCH = 20;

      for (const ag of chosen) {
        const list = perAgentIds[ag.email];
        if (!list || list.length === 0) { 
          results.push({ email: ag.email, count: 0 }); 
          continue; 
        }

        // Assign in batches
        for (let p = 0; p < list.length; p += BATCH) {
          const batch = list.slice(p, p + BATCH);
          const result = await assignWodIvcsBatch(batch, ag.id);
          if (!result.success) {
            console.error(`Failed to assign batch to ${ag.email}:`, result.error);
          }
        }

        results.push({ email: ag.email, count: list.length });
      }

      const totalAssigned = results.reduce((sum, r) => sum + r.count, 0);
      const resultText = results
        .filter((r) => r.count > 0)
        .map((r) => `${r.email}: ${r.count}`)
        .join(", ");

      setAssignMsg(`Assigned ${totalAssigned} WOD/IVCS tasks (${resultText})`);
      
      // Refresh data
      loadOverviewData();
      loadAgents();
      loadAgentWorkloads();
    } catch (error) {
      console.error("Assignment error:", error);
      setAssignMsg("Assignment failed");
    } finally {
      setAssignLoading(false);
    }
  }

  const navigationItems = [
    { id: "overview", label: "📊 Overview", description: "WOD/IVCS metrics and progress" },
    { id: "tasks", label: "📋 Task Management", description: "Import, assign, and manage WOD/IVCS tasks" },
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
                <h1 className="text-3xl font-semibold tracking-tight">WOD/IVCS Dashboard</h1>
                <p className="text-sm text-white/60">NetSuite Integration & Task Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
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
              
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>🌞</span>
                <span>Session: 2h 0m</span>
                <SmallButton>Extend</SmallButton>
              </div>
              <SmallButton 
                onClick={() => window.location.href = '/agent'}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Switch to Agent
              </SmallButton>
              <SmallButton className="bg-red-600 hover:bg-red-700 text-white">
                Logout
              </SmallButton>
            </div>
          </div>
          </div>
          
          {/* Navigation */}
          <nav className="mt-4 flex flex-wrap gap-2">
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
      </header>

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
            className="text-white/70 hover:text-white text-lg"
          >
            ×
          </button>
        </div>
      )}

      <div className="px-6 pb-6 space-y-8">
        {/* Overview Section */}
        {activeSection === "overview" && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">WOD/IVCS Overview</h2>
              <SmallButton onClick={loadOverviewData} className="bg-blue-600 hover:bg-blue-700">
                🔄 Refresh
              </SmallButton>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-4">
                <div className="text-sm text-white/60">Overall Progress</div>
                <div className="text-2xl font-bold mt-1">{overviewData.progressPercentage}% done</div>
                <div className="mt-2">
                  <ProgressBar value={overviewData.progressPercentage} />
                </div>
                <div className="text-xs text-white/40 mt-2">Pending {overviewData.pendingCount} • Completed {overviewData.totalCompletedCount}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-white/60">Queue Health</div>
                <div className="text-2xl font-bold mt-1">{overviewData.pendingCount}</div>
                <div className="text-xs text-white/40 mt-1">Ready to assign</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-white/60">Completed Today</div>
                <div className="text-2xl font-bold mt-1">{overviewData.completedTodayCount}</div>
                <div className="text-xs text-white/40 mt-1">Keep it rolling ✨</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-white/60">Active Work</div>
                <div className="text-2xl font-bold mt-1">{overviewData.inProgressCount}</div>
                <div className="text-xs text-white/40 mt-1">In Progress • 0 Need Help</div>
              </Card>
            </div>

            {/* Order Age Breakdown */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">📅 Order Age Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div 
                  className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg cursor-pointer hover:bg-orange-500/20 transition-colors"
                  onClick={() => setSelectedBreakdown({ type: 'medium', data: overviewData.detailedBreakdown.medium })}
                >
                  <div className="text-sm text-orange-300 mb-1">Medium (1-2 days)</div>
                  <div className="text-2xl font-bold text-orange-400">{overviewData.ageBreakdown.medium}</div>
                  <div className="text-xs text-orange-300/70 mt-1">Click for details</div>
                </div>
                <div 
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors"
                  onClick={() => setSelectedBreakdown({ type: 'high', data: overviewData.detailedBreakdown.high })}
                >
                  <div className="text-sm text-red-300 mb-1">High (3-4 days)</div>
                  <div className="text-2xl font-bold text-red-400">{overviewData.ageBreakdown.high}</div>
                  <div className="text-xs text-red-300/70 mt-1">Click for details</div>
                </div>
                <div 
                  className="p-4 bg-red-600/10 border border-red-600/20 rounded-lg cursor-pointer hover:bg-red-600/20 transition-colors"
                  onClick={() => setSelectedBreakdown({ type: 'urgent', data: overviewData.detailedBreakdown.urgent })}
                >
                  <div className="text-sm text-red-400 mb-1">Urgent (5+ days)</div>
                  <div className="text-2xl font-bold text-red-500">{overviewData.ageBreakdown.urgent}</div>
                  <div className="text-xs text-red-400/70 mt-1">Click for details</div>
                </div>
              </div>
            </Card>

            {/* Import Analytics */}
            {importAnalytics && (
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">📊 Last 3 Import Sessions</h3>
                  <div className="flex gap-2">
                    <SmallButton onClick={() => loadImportAnalytics()} className="bg-blue-600 hover:bg-blue-700 text-xs">
                      🔄 Refresh
                    </SmallButton>
                  </div>
                </div>
                
                {/* Import Sessions */}
                <div className="space-y-4">
                  {importAnalytics.lastThreeImports.map((session: any, index: number) => (
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

              </Card>
            )}

            {/* NetSuite Integration Status */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">🔗 NetSuite Integration Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <div className="font-medium">GH | Pending - Invalid Cash Sale Results</div>
                    <div className="text-sm text-white/60">Last sync: Not configured</div>
                  </div>
                  <div className="text-sm text-orange-500">⚠️ Pending Setup</div>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <div className="font-medium">GH | Orders Not Downloading to WMS (Public)</div>
                    <div className="text-sm text-white/60">Last sync: Not configured</div>
                  </div>
                  <div className="text-sm text-orange-500">⚠️ Pending Setup</div>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <div className="font-medium">GHM | SO vs Web Order Difference (Small Differences)</div>
                    <div className="text-sm text-white/60">Last sync: Not configured</div>
                  </div>
                  <div className="text-sm text-orange-500">⚠️ Pending Setup</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Task Management Section */}
        {activeSection === "tasks" && (
          <div className="space-y-8">
                   {/* CSV Import Section */}
                   <CsvImportSection onImportComplete={loadOverviewData} />

            {/* Assign Tasks Section (matching Text Club) */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">🎯 Assign WOD/IVCS Tasks</h2>
                <SmallButton onClick={loadAgentWorkloads} className="bg-blue-600 hover:bg-blue-700">
                  🔄 Refresh
                </SmallButton>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/60">
                    Choose agents ({selectedAgents.length}/{agents.length} selected)
                  </div>
                  <SmallButton onClick={toggleSelectAll} disabled={agentsLoading || agents.length === 0}>
                    {allSelected ? "Clear all" : "Select all"}
                  </SmallButton>
                </div>

                <div className="max-h-56 overflow-auto rounded-lg bg-white/[0.03] ring-1 ring-white/10 p-2 space-y-1">
                  {agentsLoading && <div className="text-sm text-white/60 p-1">Loading agents…</div>}
                  {!agentsLoading && agents.length === 0 && (
                    <div className="text-sm text-white/60 p-1">No agents found.</div>
                  )}
                  {agents.map((a) => {
                    const workload = agentWorkloads[a.id] || { wodIvcs: 0, textClub: 0, emailRequests: 0, standaloneRefunds: 0, total: 0 };
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
                          <div className="flex items-center gap-3 text-xs text-white/50 mt-1">
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
                    value={perAgent}
                    onChange={(e) => setPerAgent(Number(e.target.value || 0))}
                    className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
                  />
                  <div className="text-xs text-white/50 mt-1">Absolute hard cap is 200 per agent.</div>
                </label>
                
                <label>
                  <div className="text-sm text-white/60 mb-1">Order Age Filter</div>
                  <select
                    value={orderAgeFilter}
                    onChange={(e) => setOrderAgeFilter(e.target.value)}
                    className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
                  >
                    <option value="all">All Ages</option>
                    <option value="today">Today</option>
                    <option value="1-3">1-3 days old</option>
                    <option value="4-7">4-7 days old</option>
                    <option value="8+">8+ days old</option>
                  </select>
                  <div className="text-xs text-white/50 mt-1">Only assign tasks of this age</div>
                </label>
                
                <label>
                  <div className="text-sm text-white/60 mb-1">Source Filter</div>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
                  >
                    <option value="all">All Sources</option>
                    <option value="INVALID_CASH_SALE">Invalid Cash Sale</option>
                    <option value="ORDERS_NOT_DOWNLOADING">Orders Not Downloading</option>
                    <option value="SO_VS_WEB_DIFFERENCE">SO vs Web Difference</option>
                  </select>
                  <div className="text-xs text-white/50 mt-1">Only assign from this source</div>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={doAssign}
                  disabled={assignLoading || selectedAgents.length === 0 || perAgent <= 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {assignLoading ? "Assigning…" : "Assign Now"}
                </button>
                {assignMsg && <span className="text-sm text-white/70">{assignMsg}</span>}
              </div>
            </Card>

            {/* Pending Tasks Section */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">📋 Pending WOD/IVCS Tasks</h2>
                <SmallButton onClick={loadAgentWorkloads} className="bg-blue-600 hover:bg-blue-700">
                  🔄 Refresh Workloads
                </SmallButton>
              </div>
              <WodIvcsTasksSection 
                taskType="WOD_IVCS" 
                onTaskAssignmentChange={loadAgentWorkloads}
              />
            </Card>

            {/* NetSuite API Integration (Coming Soon) */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">🔗 NetSuite API Integration</h3>
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h4 className="font-medium text-blue-400 mb-2">Automated Data Sync</h4>
                <p className="text-sm text-white/70 mb-3">
                  Automatically pull data from NetSuite reports (coming soon)
                </p>
                <SmallButton disabled className="bg-blue-600/50 text-white/50">
                  Configure NetSuite API
                </SmallButton>
              </div>
            </Card>

            {/* Pending Tasks */}
            <WodIvcsTasksSection taskType="WOD_IVCS" />
          </div>
        )}

        {/* Assistance Requests Section */}
        {activeSection === "assistance" && (
          <div className="space-y-8">
            <AssistanceRequestsSection taskType="WOD_IVCS" />
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
          <AnalyticsSection />
        )}

        {/* Settings Section */}
        {activeSection === "settings" && (
          <div className="space-y-8">
            <UnifiedSettings />
          </div>
        )}
      </div>

      {/* Detailed Breakdown Modal */}
      {selectedBreakdown && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-white/20 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                📊 {selectedBreakdown.type === 'duplicates' && 'Previously Completed Tasks'}
                {selectedBreakdown.type === 'rollovers' && 'Roll Over Tasks'}
                {selectedBreakdown.type === 'dailyImport' && 'Daily Import Breakdown'}
                {(selectedBreakdown.type === 'medium' || selectedBreakdown.type === 'high' || selectedBreakdown.type === 'urgent') && 
                  `${selectedBreakdown.type.charAt(0).toUpperCase() + selectedBreakdown.type.slice(1)} Priority Breakdown`}
              </h3>
              <button
                onClick={() => setSelectedBreakdown(null)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {selectedBreakdown.type === 'duplicates' && (
                <div>
                  {selectedBreakdown.data.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      No previously completed tasks found
                    </div>
                  ) : (
                    selectedBreakdown.data.map((item, index) => (
                      <div key={index} className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="font-semibold text-white mb-2">Duplicate Task</div>
                            <div className="text-sm text-white/80">
                              <div><strong>Source:</strong> {
                                item.duplicateTask.wodIvcsSource === 'INVALID_CASH_SALE' && 'GH | Pending - Invalid Cash Sale Results'
                                || item.duplicateTask.wodIvcsSource === 'ORDERS_NOT_DOWNLOADING' && 'GH | Orders Not Downloading to WMS (Public)'
                                || item.duplicateTask.wodIvcsSource === 'SO_VS_WEB_DIFFERENCE' && 'GHM | SO vs Web Order Difference (Small Differences)'
                              }</div>
                              <div><strong>Customer:</strong> {item.duplicateTask.customerName || 'N/A'}</div>
                              <div><strong>Order Date:</strong> {item.duplicateTask.purchaseDate ? new Date(item.duplicateTask.purchaseDate).toLocaleDateString() : 'N/A'}</div>
                              <div><strong>Imported:</strong> {new Date(item.duplicateTask.createdAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-white mb-2">Original Task</div>
                            <div className="text-sm text-white/80">
                              <div><strong>Completed:</strong> {item.wasCompletedOn ? new Date(item.wasCompletedOn).toLocaleDateString() : 'N/A'}</div>
                              <div><strong>Disposition:</strong> {item.disposition || 'N/A'}</div>
                              <div><strong>Completed By:</strong> {item.completedBy || 'N/A'}</div>
                              <div><strong>Age:</strong> {item.duplicateTask.purchaseDate ? Math.floor((Date.now() - new Date(item.duplicateTask.purchaseDate).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'} days</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedBreakdown.type === 'rollovers' && (
                <div>
                  {Object.keys(selectedBreakdown.data).length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      No rollover tasks found
                    </div>
                  ) : (
                    Object.entries(selectedBreakdown.data).map(([source, data]: [string, any]) => (
                      <div key={source} className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                        <div className="font-semibold text-white mb-3">
                          {source === 'INVALID_CASH_SALE' && 'GH | Pending - Invalid Cash Sale Results'}
                          {source === 'ORDERS_NOT_DOWNLOADING' && 'GH | Orders Not Downloading to WMS (Public)'}
                          {source === 'SO_VS_WEB_DIFFERENCE' && 'GHM | SO vs Web Order Difference (Small Differences)'}
                          <span className="text-red-400 ml-2">({data.total} tasks)</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                          {Object.entries(data.byAge).map(([age, count]: [string, any]) => (
                            <div key={age} className="text-center p-2 bg-white/5 rounded">
                              <div className="text-lg font-bold text-red-400">{count}</div>
                              <div className="text-xs text-white/60">{age} days old</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-white/60">
                          Click to view individual tasks
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedBreakdown.type === 'dailyImport' && (
                <div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="font-semibold text-white mb-3">
                      📅 Import Details for {new Date(selectedBreakdown.data.date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric',
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className="text-lg font-bold text-blue-400 mb-4">
                      Total Tasks Imported: {selectedBreakdown.data.total}
                    </div>
                    
                    {/* Enhanced breakdown with duplicate details */}
                    <div className="space-y-4">
                      {Object.entries(selectedBreakdown.data.sources).map(([source, data]: [string, any]) => {
                        const count = typeof data === 'number' ? data : data.total;
                        const duplicates = typeof data === 'number' ? 0 : data.duplicates || 0;
                        const previouslyCompleted = typeof data === 'number' ? 0 : data.previouslyCompleted || 0;
                        const duplicateDetails = typeof data === 'number' ? [] : data.duplicateDetails || [];
                        
                        return (
                          <div key={source} className="bg-white/5 rounded-lg p-4">
                            <div className="font-medium text-white mb-3">
                              {source === 'INVALID_CASH_SALE' && 'GH | Pending - Invalid Cash Sale Results'}
                              {source === 'ORDERS_NOT_DOWNLOADING' && 'GH | Orders Not Downloading to WMS (Public)'}
                              {source === 'SO_VS_WEB_DIFFERENCE' && 'GHM | SO vs Web Order Difference (Small Differences)'}
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div className="text-center">
                                <div className="text-2xl font-bold text-blue-400">{count}</div>
                                <div className="text-sm text-white/60">Total Imported</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-orange-400">{duplicates}</div>
                                <div className="text-sm text-white/60">Duplicates</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-red-400">{previouslyCompleted}</div>
                                <div className="text-sm text-white/60">Previously Completed</div>
                              </div>
                            </div>
                            
                            {/* Show duplicate details if any */}
                            {duplicateDetails.length > 0 && (
                              <div className="mt-4">
                                <div className="font-medium text-white mb-2">🔍 Previously Completed Duplicates:</div>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                  {duplicateDetails.map((detail: any, index: number) => (
                                    <div key={index} className="bg-red-500/10 border border-red-500/20 rounded p-2 text-sm">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="text-white font-medium">
                                            {source === 'INVALID_CASH_SALE' && `Doc: ${detail.duplicateTask.documentNumber}`}
                                            {source === 'ORDERS_NOT_DOWNLOADING' && `Order: ${detail.duplicateTask.webOrder}`}
                                            {source === 'SO_VS_WEB_DIFFERENCE' && `Order: ${detail.duplicateTask.webOrder}`}
                                          </div>
                                          <div className="text-white/80">
                                            Customer: {detail.duplicateTask.customerName}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-red-400 font-medium">
                                            Completed {detail.ageInDays} days ago
                                          </div>
                                          <div className="text-white/60">
                                            by {detail.completedBy}
                                          </div>
                                          <div className="text-white/60">
                                            Disposition: {detail.disposition}
                                          </div>
                                          <div className="text-white/60 text-xs">
                                            {detail.completedOn && new Date(detail.completedOn).toLocaleDateString()}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="mt-4 text-sm text-white/60">
                      💡 This shows the detailed breakdown of tasks imported from each NetSuite report on this specific date, including duplicate detection and previously completed tasks.
                    </div>
                  </div>
                </div>
              )}

              {(selectedBreakdown.type === 'medium' || selectedBreakdown.type === 'high' || selectedBreakdown.type === 'urgent') && (
                <div>
                  {selectedBreakdown.data.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      No tasks in this priority range
                    </div>
                  ) : (
                    selectedBreakdown.data.map((item, index) => (
                      <div key={index} className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-white">
                              {item.wodIvcsSource === 'INVALID_CASH_SALE' && 'GH | Pending - Invalid Cash Sale Results'}
                              {item.wodIvcsSource === 'ORDERS_NOT_DOWNLOADING' && 'GH | Orders Not Downloading to WMS (Public)'}
                              {item.wodIvcsSource === 'SO_VS_WEB_DIFFERENCE' && 'GHM | SO vs Web Order Difference (Small Differences)'}
                            </div>
                            <div className="text-white/60 text-sm">
                              {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              }) : 'No date'}
                            </div>
                          </div>
                          <div className="text-2xl font-bold text-white">
                            {item._count.id}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
