"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/app/_components/AutoLogoutWarning';
import SessionTimer from '@/app/_components/SessionTimer';
import BlockedPhonesSection from '@/app/_components/BlockedPhonesSection';
import ThemeToggle from '@/app/_components/ThemeToggle';
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import SortableHeader, { SortDirection } from '@/app/_components/SortableHeader';
import SpamInsights from '@/app/_components/SpamInsights';
import UnifiedSettings from '@/app/_components/UnifiedSettings';
import TextClubAnalytics from '@/app/_components/TextClubAnalytics';

/* ========== Shared types ========== */
type AssignResult = Record<string, string[]>;

type Agent = {
  id: string;
  email: string;
  name: string;
  openCount: number;
  isLive?: boolean;
  lastSeen?: string | null;
  role?: "MANAGER" | "AGENT" | "MANAGER_AGENT";
};

type Rule = {
  id: string;
  pattern: string;
  enabled: boolean;
  createdAt: string;
};

type ImportResult = {
  fileName: string;
  brand: string;
  inserted: number;
  skippedExisting: number;
  totalRows: number;
  importBatchId: string;
};

type PreviewResponse = {
  totalPending: number;
  rules: string[];
  matchedCount: number;
  matches: Array<{
    taskId: string;
    brand: string | null;
    text: string | null;
    matchedPatterns: string[];
  }>;
};

type PreviewTopPhrase = { pattern: string; count: number };
type PreviewSummary = {
  totalPending: number;
  rulesEnabled: number;
  wouldMarkSpamReview: number;
  learningMatchedCount: number;
  totalMatched: number;
  unaffected: number;
  topPhrases: PreviewTopPhrase[];
  sampleMatches: Array<{
    id: string;
    brand: string | null;
    text: string | null;
    matchedPatterns: string[];
    learningScore?: number;
    learningReasons?: string[];
  }>;
};

type SpamReviewItem = {
  id: string;
  brand: string | null;
  text: string | null;
  previewMatches: string[] | string | null;
  createdAt: string;
  learningScore?: number;
  learningReasons?: string[];
  spamSource?: 'manual' | 'automatic' | 'learning';
};

type SpamArchiveItem = {
  id: string;
  brand: string | null;
  text: string | null;
  createdAt: string;
};

type Task = {
  id: string;
  brand: string | null;
  text: string | null;
  status: "pending" | "in_progress" | "completed" | "spam" | "archived";
  assignedTo?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

type AgentProgress = {
  id: string;
  name: string;
  email: string;
  assigned: number;
  inProgress: number;
  completedToday: number;
  lastActivity?: string | null;
  taskTypeBreakdown?: {
    textClub: { assigned: number; inProgress: number; completedToday: number };
    wodIvcs: { assigned: number; inProgress: number; completedToday: number };
    emailRequests: { assigned: number; inProgress: number; completedToday: number };
    standaloneRefunds: { assigned: number; inProgress: number; completedToday: number };
  };
};

/* ========== Utils ========== */
function fmtDate(d: string | Date | null | undefined) {
  try {
    const dt = typeof d === "string" ? new Date(d) : d ?? new Date(0);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleString();
  } catch {
    return "—";
  }
}
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/* ========== Tiny UI atoms (iOS-ish) ========== */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white/[0.02] ring-1 ring-white/10 backdrop-blur-md ${className}`}
    >
      {children}
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white/90 tracking-tight">{children}</h2>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "danger" | "muted" | "warning";
}) {
  const toneClasses =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
      : tone === "danger"
      ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
      : tone === "muted"
      ? "bg-white/5 text-white/70 ring-1 ring-white/10"
      : tone === "warning"
      ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
      : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${toneClasses}`}>
      {children}
    </span>
  );
}

function SmallButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 text-white disabled:opacity-50 ${className}`}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold bg-gradient-to-r from-sky-500/90 to-indigo-500/90 hover:from-sky-500 hover:to-indigo-500 text-white ring-1 ring-sky-400/40 disabled:opacity-50 ${className}`}
    />
  );
}

/* ========== Micro charts (no libs) ========== */
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
function Donut({
  percent,
  label,
}: {
  percent: number;
  label?: string;
}) {
  const p = clamp(percent);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-14 w-14 rounded-full grid place-items-center"
        style={{
          background: `conic-gradient(#22d3ee ${p}%, #262626 ${p}%)`,
        }}
      >
        <div className="h-10 w-10 rounded-full bg-neutral-900 ring-1 ring-white/10 grid place-items-center text-xs text-white/80">
          {p}%
        </div>
      </div>
      {label && <div className="text-sm text-white/70">{label}</div>}
    </div>
  );
}

/* ========== iMessage bubble ========== */
function Bubble({
  children,
  sent = false,
}: {
  children: React.ReactNode;
  sent?: boolean; // sent = assigned (blue), received = unassigned (gray)
}) {
  return (
    <div
      className={[
        "inline-block max-w-full px-3 py-2 rounded-2xl text-sm leading-relaxed",
        sent
          ? "bg-[#0A84FF] text-white shadow-sm"
          : "bg-white/[0.08] text-white/90 ring-1 ring-white/10",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* ========================================================================== */
/*  Import CSVs                                                               */
/* ========================================================================== */
function ImportSection() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  async function handleImport() {
    if (!files || files.length === 0) return;
    setBusy(true); setErr(null); setResults(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/manager/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data?.success) setErr(data?.error || "Import failed");
      else setResults(data.results as ImportResult[]);
    } catch {
      setErr("Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📥 Import CSVs</H2>
      </div>
      <p className="text-sm text-white/60">
        Upload Attentive “conversation messages” CSVs. We’ll infer Brand from filename, strip <code>+1</code> from Phone, and de-dupe by key.
      </p>

      <div className="flex flex-col gap-3">
        <input
          type="file"
          multiple
          accept=".csv"
          onChange={(e) => setFiles(e.target.files)}
          className="max-w-md text-sm file:mr-3 file:rounded-md file:bg-white/10 file:text-white file:px-3 file:py-1.5 file:border-0 file:hover:bg-white/20"
        />
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={handleImport} disabled={busy || !files || files.length === 0}>
            {busy ? "Importing…" : "Import"}
          </PrimaryButton>
          {err && <span className="text-sm text-rose-300">{err}</span>}
        </div>
      </div>

      {results && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {results.map((r, i) => (
            <div key={`${r.importBatchId}-${i}`} className="rounded-lg bg-white/[0.03] ring-1 ring-white/10 p-3">
              <div className="font-medium text-white/90">
                {r.fileName} — <span className="text-white/70">{r.brand}</span>
              </div>
              <div className="text-white/70">Inserted: {r.inserted}</div>
              <div className="text-white/70">Skipped (dupes): {r.skippedExisting}</div>
              <div className="text-white/50">Rows in file: {r.totalRows}</div>
              <div className="text-white/35">Batch: {r.importBatchId}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Assistance Requests — Manager response to agents                          */
/* ========================================================================== */
function AssistanceRequestsSection({ 
  requests, 
  onRequestsChange 
}: { 
  requests: Array<{
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
    // Yotpo specific fields
    yotpoDateSubmitted?: string;
    yotpoPrOrYotpo?: string;
    yotpoCustomerName?: string;
    yotpoEmail?: string;
    yotpoOrderDate?: string;
    yotpoProduct?: string;
    yotpoIssueTopic?: string;
    yotpoReviewDate?: string;
    yotpoReview?: string;
    yotpoSfOrderLink?: string;
    // Holds specific fields
    holdsOrderDate?: string;
    holdsOrderNumber?: string;
    holdsCustomerEmail?: string;
    holdsPriority?: number;
    holdsStatus?: string;
    holdsDaysInSystem?: number;
  }>;
  onRequestsChange: (requests: any[]) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
  }, [requests]);

  async function handleResponse(requestId: string) {
    if (!responseText.trim()) return;
    
    setBusy(`responding:${requestId}`);
    try {
      const res = await fetch(`/api/manager/tasks/${requestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseText.trim() }),
      });
      
      if (res.ok) {
        // Update the requests list by removing the responded request
        const updatedRequests = requests.filter(req => req.id !== requestId);
        onRequestsChange(updatedRequests);
        setResponseText("");
        setRespondingTo(null);
      } else {
        alert("Failed to send response");
      }
    } catch (error) {
      console.error("Failed to send response:", error);
      alert("Failed to send response");
    } finally {
      setBusy(null);
    }
  }

  function getStatusEmoji(status: string) {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "🆘";
      case "IN_PROGRESS": return "▶️";
      default: return "❓";
    }
  }

  function getStatusTone(status: string) {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "danger";
      case "IN_PROGRESS": return "success";
      default: return "muted";
    }
  }

  if (loading) {
    return (
      <Card>
        <H2>🆘 Assistance Requests</H2>
        <div className="text-center py-8 text-neutral-400">Loading...</div>
      </Card>
    );
  }

  const pendingRequests = requests.filter(r => r.status === "ASSISTANCE_REQUIRED");
  const respondedRequests = requests.filter(r => r.status === "IN_PROGRESS" && r.managerResponse);

  return (
    <Card>
      <H2>🆘 Assistance Requests</H2>
      
      {pendingRequests.length === 0 && respondedRequests.length === 0 && (
        <div className="text-center py-8 text-neutral-400">
          No assistance requests at this time
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold text-white">Pending ({pendingRequests.length})</h3>
          {pendingRequests.map((request) => (
            <div key={request.id} className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge tone={getStatusTone(request.status)}>
                      {getStatusEmoji(request.status)} {request.status.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-neutral-400">
                      {new Date(request.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Brand</div>
                      <div className="text-white">{request.brand}</div>
                    </div>
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Phone</div>
                      <div className="text-white">{request.phone}</div>
                    </div>
                  </div>
                  
                  {/* Task-specific content */}
                  {request.taskType === "HOLDS" ? (
                    <div className="mt-3 text-sm text-white space-y-1">
                      <div><strong>📄 Order Number:</strong> {request.holdsOrderNumber || "N/A"}</div>
                      <div><strong>✉️ Email:</strong> {request.holdsCustomerEmail || "N/A"}</div>
                      <div><strong>📅 Order Date:</strong> {request.holdsOrderDate ? new Date(request.holdsOrderDate).toLocaleDateString() : "N/A"}</div>
                      <div><strong>🏷️ Queue:</strong> {request.holdsStatus || "N/A"}</div>
                      <div><strong>⭐ Priority:</strong> {request.holdsPriority || "N/A"}</div>
                    </div>
                  ) : request.taskType === "YOTPO" ? (
                    <div className="mt-3 text-sm text-white space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><strong>👤 Customer:</strong> {request.yotpoCustomerName || "N/A"}</div>
                        <div><strong>📧 Email:</strong> {request.yotpoEmail || "N/A"}</div>
                        <div><strong>📅 Order Date:</strong> {request.yotpoOrderDate ? new Date(request.yotpoOrderDate).toLocaleDateString() : "N/A"}</div>
                        <div><strong>📦 Product:</strong> {request.yotpoProduct || "N/A"}</div>
                        <div><strong>🏷️ Issue Topic:</strong> {request.yotpoIssueTopic || "N/A"}</div>
                        <div><strong>📅 Review Date:</strong> {request.yotpoReviewDate ? new Date(request.yotpoReviewDate).toLocaleDateString() : "N/A"}</div>
                      </div>
                      <div className="mt-2">
                        <strong>⭐ Review:</strong>
                        <div className="mt-1 bg-neutral-800 p-3 rounded whitespace-pre-wrap text-white">
                          {request.yotpoReview || "No review text"}
                        </div>
                      </div>
                      {request.yotpoSfOrderLink && (
                        <div>
                          <strong>🔗 SF Order:</strong>{' '}
                          <a
                            href={request.yotpoSfOrderLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            Open in Salesforce →
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Message</div>
                    <div className="text-white bg-neutral-800 p-3 rounded">{request.text}</div>
                  </div>
                  )}
                  
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Agent Request</div>
                    <div className="text-white bg-red-800/30 p-3 rounded border border-red-700">
                      <div className="text-sm text-red-300 mb-1">
                        {request.agentName} ({request.agentEmail})
                      </div>
                      {request.assistanceNotes}
                    </div>
                  </div>
                </div>
              </div>
              
              {respondingTo === request.id ? (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Type your response to the agent..."
                    className="w-full h-24 rounded-md bg-neutral-800 text-white placeholder-neutral-400 px-3 py-2 ring-1 ring-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <SmallButton
                      onClick={() => handleResponse(request.id)}
                      disabled={busy === `responding:${request.id}`}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      >
                      {busy === `responding:${request.id}` ? "Sending..." : "Send Response"}
                    </SmallButton>
                    <SmallButton
                      onClick={() => {
                        setRespondingTo(null);
                        setResponseText("");
                      }}
                      className="bg-neutral-600 hover:bg-neutral-700"
                    >
                      Cancel
                    </SmallButton>
                  </div>
                </div>
              ) : (
                <SmallButton
                  onClick={() => setRespondingTo(request.id)}
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Respond to Agent
                </SmallButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Responded Requests */}
      {respondedRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Responded ({respondedRequests.length})</h3>
          {respondedRequests.map((request) => (
            <div key={request.id} className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge tone={getStatusTone(request.status)}>
                      {getStatusEmoji(request.status)} {request.status.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-neutral-400">
                      {new Date(request.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Brand</div>
                      <div className="text-white">{request.brand}</div>
                    </div>
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Phone</div>
                      <div className="text-white">{request.phone}</div>
                    </div>
                  </div>
                  
                  {/* Task-specific content for responded requests */}
                  {request.taskType === "HOLDS" ? (
                    <div className="mt-3 text-sm text-white space-y-1">
                      <div><strong>📄 Order Number:</strong> {request.holdsOrderNumber || "N/A"}</div>
                      <div><strong>✉️ Email:</strong> {request.holdsCustomerEmail || "N/A"}</div>
                      <div><strong>🏷️ Queue:</strong> {request.holdsStatus || "N/A"}</div>
                    </div>
                  ) : request.taskType === "YOTPO" ? (
                    <div className="mt-3 text-sm text-white space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><strong>👤 Customer:</strong> {request.yotpoCustomerName || "N/A"}</div>
                        <div><strong>📧 Email:</strong> {request.yotpoEmail || "N/A"}</div>
                        <div><strong>📅 Order Date:</strong> {request.yotpoOrderDate ? new Date(request.yotpoOrderDate).toLocaleDateString() : "N/A"}</div>
                        <div><strong>📦 Product:</strong> {request.yotpoProduct || "N/A"}</div>
                        <div><strong>🏷️ Issue Topic:</strong> {request.yotpoIssueTopic || "N/A"}</div>
                        <div><strong>📅 Review Date:</strong> {request.yotpoReviewDate ? new Date(request.yotpoReviewDate).toLocaleDateString() : "N/A"}</div>
                      </div>
                      <div className="mt-2">
                        <strong>⭐ Review:</strong>
                        <div className="mt-1 bg-neutral-800 p-3 rounded whitespace-pre-wrap text-white">
                          {request.yotpoReview || "No review text"}
                        </div>
                      </div>
                      {request.yotpoSfOrderLink && (
                        <div>
                          <strong>🔗 SF Order:</strong>{' '}
                          <a
                            href={request.yotpoSfOrderLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            Open in Salesforce →
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Message</div>
                    <div className="text-white bg-neutral-800 p-3 rounded">{request.text}</div>
                  </div>
                  )}
                  
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Agent Request</div>
                    <div className="text-white bg-red-800/30 p-3 rounded border border-red-700">
                      <div className="text-sm text-red-300 mb-1">
                        {request.agentName} ({request.agentEmail})
                      </div>
                      {request.assistanceNotes}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Your Response</div>
                    <div className="text-white bg-green-800/30 p-3 rounded border border-green-700">
                      {request.managerResponse}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Pending Tasks — Apple/iMessage styling                                    */
/* ========================================================================== */
function PendingTasksSection({ onTasksMutated }: { onTasksMutated?: () => Promise<void> | void }) {
  const PAGE_SIZE = 50;

  // filters
  const [status, setStatus] = useState<
    "pending" | "in_progress" | "completed" | "spam_review" | "assistance_required" | "resolved" | "all"
  >("pending");
  const [assignedTo, setAssignedTo] = useState<string>(""); // userId or name/email
  const [q, setQ] = useState("");

  // data
  const [items, setItems] = useState<
    Array<{
      id: string;
      taskId?: string | null;
      brand: string | null;
      text: string | null;
      createdAt: string;
      rawStatus?: string;
      taskStatus?: string | null;
      assignedTo?: { id: string; email: string; name: string | null } | null;
    }>
  >([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const [loading, setLoading] = useState(false);

  // selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // sorting
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);

  // agents list for dropdowns
  const [agents, setAgents] = useState<Array<{ id: string; email: string; name: string | null; isLive: boolean; lastSeen: string | null }>>([]);

  const resetSelection = () => setSelected({});

  async function loadAgents() {
    const res = await fetch("/api/manager/agents", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.success && Array.isArray(data.agents)) {
      setAgents(data.agents.map((a: any) => ({ 
        id: a.id, 
        email: a.email, 
        name: a.name ?? null,
        isLive: a.isLive ?? false,
        lastSeen: a.lastSeen
      })));
    }
  }

  async function fetchPage(p: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("take", String(PAGE_SIZE));
      params.set("skip", String((p - 1) * PAGE_SIZE));
      if (q.trim()) params.set("q", q.trim());
      if (assignedTo.trim()) params.set("assigned", assignedTo.trim());
      
      // Add sorting parameters
      if (sort?.key && sort.direction) {
        params.set("sortBy", sort.key);
        params.set("sortOrder", sort.direction);
      }

      const res = await fetch(`/api/manager/tasks?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(p);
      resetSelection();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAgents(); }, []);
  useEffect(() => { fetchPage(1); /* eslint-disable-next-line */ }, [status, assignedTo, sort]);

  const onSearch = () => fetchPage(1);
  
  const handleSort = (key: string, direction: SortDirection) => {
    setSort(direction ? { key, direction } : null);
  };
  const onPrev = () => page > 1 && fetchPage(page - 1);
  const onNext = () => page < totalPages && fetchPage(page + 1);

  const allChecked = items.length > 0 && items.every((r) => selected[r.id]);
  const toggleAll = () =>
    setSelected((m) => {
      if (allChecked) return {};
      const next: Record<string, boolean> = {};
      for (const r of items) next[r.id] = true;
      return next;
    });
  const checkedTaskIds = items
    .filter((r) => selected[r.id] && r.taskId)
    .map((r) => r.taskId as string);
  const checkedRawMessageIds = items
    .filter((r) => selected[r.id] && !r.taskId)
    .map((r) => r.id);

  async function bulkAssign(agentId: string) {
    if (checkedTaskIds.length === 0 && checkedRawMessageIds.length === 0) return;
    // Assign existing tasks (by taskId)
    if (checkedTaskIds.length > 0) {
      const res = await fetch("/api/manager/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: checkedTaskIds, agentId, taskType: "TEXT_CLUB" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { alert(data?.error || "Assign failed"); return; }
    }
    // Promote READY raws and assign (by rawMessageId)
    if (checkedRawMessageIds.length > 0) {
      const res2 = await fetch("/api/manager/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawMessageIds: checkedRawMessageIds, agentId, taskType: "TEXT_CLUB" }),
      });
      const data2 = await res2.json().catch(() => null);
      if (!res2.ok || !data2?.success) { alert(data2?.error || "Assign failed"); return; }
    }
    await fetchPage(page);
    try { await onTasksMutated?.(); } catch {}
  }

  async function bulkUnassign() {
    const ids = [
      ...checkedTaskIds,
      ...checkedRawMessageIds,
    ];
    if (ids.length === 0) return;
    const res = await fetch("/api/manager/tasks/unassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) { alert(data?.error || "Unassign failed"); return; }
    await fetchPage(page);
    try { await onTasksMutated?.(); } catch {}
  }

  async function bulkSpamReview() {
    const ids = [
      ...checkedTaskIds,
      ...checkedRawMessageIds,
    ];
    if (ids.length === 0) return;
    const res = await fetch("/api/manager/tasks/mark-spam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) { alert(data?.error || "Send to Spam Review failed"); return; }
    
    // Learn from manual spam decisions and mark as manual source
    try {
      const spamItems = items.filter(item => ids.includes(item.id));
      for (const item of spamItems) {
        if (item.text) {
          await fetch("/api/spam/learn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: item.text,
              brand: item.brand,
              isSpam: true,
              source: 'manual'
            })
          });
        }
      }
    } catch (error) {
      console.error('Failed to learn from manual spam decisions:', error);
    }
    
    await fetchPage(page);
  }

  async function rowAssign(rowId: string, agentId: string) {
    // Determine if this row currently has a Task (taskId) or a RawMessage
    const row = items.find((r) => r.id === rowId);
    const hasTask = !!row?.taskId;
    const payload = hasTask
      ? { ids: [row!.taskId], agentId, taskType: "TEXT_CLUB" }
      : { rawMessageIds: [rowId], agentId, taskType: "TEXT_CLUB" };

    const res = await fetch("/api/manager/tasks/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) { alert(data?.error || "Assign failed"); return; }
    await fetchPage(page);
    try { await onTasksMutated?.(); } catch {}
  }

  async function rowSpam(taskId: string) {
    const res = await fetch("/api/manager/tasks/mark-spam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [taskId] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) { alert(data?.error || "Send to Spam Review failed"); return; }
    await fetchPage(page);
    try { await onTasksMutated?.(); } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-white/60">{total} total</div>
        <SmallButton onClick={() => fetchPage(page)} disabled={loading}>
          {loading ? "Loading..." : "🔄 Refresh"}
        </SmallButton>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none"
          title="Status filter"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="assistance_required">Assistance Required</option>
          <option value="spam_review">Spam Review</option>
          <option value="resolved">Resolved</option>
          <option value="completed">Completed</option>
          <option value="all">All</option>
        </select>

        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none"
          title="Assigned to"
        >
          <option value="">Assigned: Anyone</option>
          <option value="unassigned">Unassigned</option>
          <option value="__sep__" disabled>—</option>
          {agents.map((a) => (
            <option key={a.id} value={a.name || a.email || a.id}>
              {a.name || a.email}
            </option>
          ))}
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand / text / email / phone…"
          className="w-full md:max-w-md rounded-lg px-3 py-2 bg-white/10 text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none"
        />
        <SmallButton onClick={onSearch} disabled={loading}>{loading ? "Loading…" : "Search"}</SmallButton>
      </div>

      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SmallButton onClick={toggleAll}>{allChecked ? "Clear all" : "Select all"}</SmallButton>

        <select
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            bulkAssign(v);
            e.currentTarget.value = "";
          }}
          className="rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10"
          defaultValue=""
          title="Assign selected to…"
        >
          <option value="" disabled>
            Assign selected to…
          </option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.email}
            </option>
          ))}
        </select>

        <SmallButton onClick={bulkUnassign} disabled={(checkedTaskIds.length + checkedRawMessageIds.length) === 0}>Unassign selected</SmallButton>
        <SmallButton onClick={bulkSpamReview} disabled={(checkedTaskIds.length + checkedRawMessageIds.length) === 0}>Send to Spam Review</SmallButton>
      </div>

      {/* List (iMessage style) */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2 w-10">Sel</th>
              <SortableHeader 
                sortKey="brand" 
                currentSort={sort} 
                onSort={handleSort}
                className="w-40"
              >
                Brand
              </SortableHeader>
              <SortableHeader 
                sortKey="text" 
                currentSort={sort} 
                onSort={handleSort}
              >
                Text
              </SortableHeader>
              <SortableHeader 
                sortKey="assignedTo" 
                currentSort={sort} 
                onSort={handleSort}
                className="w-56"
              >
                Assigned
              </SortableHeader>
              <SortableHeader 
                sortKey="createdAt" 
                currentSort={sort} 
                onSort={handleSort}
                className="w-44"
              >
                Created
              </SortableHeader>
              <th className="px-3 py-2 w-56">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-white/60" colSpan={6}>
                  {loading ? "Loading…" : "No tasks."}
                </td>
              </tr>
            )}
            {items.map((r) => {
              const assigneeName = r.assignedTo ? (r.assignedTo.name || r.assignedTo.email) : null;
              const isAssigned = Boolean(assigneeName);
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={(e) => setSelected((m) => ({ ...m, [r.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="px-3 py-3">{r.brand || "—"}</td>
                  <td className="px-3 py-3">
                    <Bubble sent={isAssigned}>
                      <div className="whitespace-pre-wrap break-words">{r.text || "—"}</div>
                    </Bubble>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs text-white/70 mb-1">
                      {assigneeName ? `Assigned to ${assigneeName}` : "Unassigned"}
                    </div>
                    <select
                      className="rounded-lg px-2 py-1 bg-white/10 text-white text-xs ring-1 ring-white/10"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        rowAssign(r.id, v);
                        e.currentTarget.value = "";
                      }}
                    >
                      <option value="" disabled>Assign to…</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <SmallButton onClick={() => rowSpam(r.id)}>Spam Review</SmallButton>
                      <SmallButton
                        onClick={async () => {
                          const taskId = r.taskId || r.id;
                          const res = await fetch("/api/manager/tasks/unassign", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ids: [taskId] }),
                          });
                          const data = await res.json().catch(() => null);
                          if (!res.ok || !data?.success) { 
                            alert(data?.error || "Unassign failed"); 
                            return; 
                          }
                          await fetchPage(page);
                          try { await onTasksMutated?.(); } catch {}
                        }}
                      >
                        Unassign
                      </SmallButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">
          Page {page} of {totalPages} · Showing {items.length} of {total}
        </div>
        <div className="flex items-center gap-2">
          <SmallButton onClick={onPrev} disabled={loading || page <= 1}>Prev</SmallButton>
          
          {/* Page Selection Dropdown */}
          <select
            value={page}
            onChange={(e) => fetchPage(Number(e.target.value))}
            disabled={loading || totalPages <= 1}
            className="border-none rounded-lg px-2 py-1 bg-white/10 text-white text-xs ring-1 ring-white/10 focus:outline-none min-w-[60px]"
            title="Jump to page"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <option key={pageNum} value={pageNum}>
                {pageNum}
              </option>
            ))}
          </select>
          
          <SmallButton onClick={onNext} disabled={loading || page >= totalPages}>Next</SmallButton>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Spam Preview + Capture                                                     */
/* ========================================================================== */
function PreviewSummaryBlock({ preview }: { preview: PreviewResponse | null }) {
  const summary = React.useMemo<PreviewSummary | null>(() => {
    if (!preview) return null;

    const p: any = preview as any;
    const totalPending = p.totalPending ?? 0;
    const rulesEnabled = p.rules?.length ?? 0;
    const matchedCount = p.matchedCount ?? 0;
    const learningMatchedCount = p.learningMatchedCount ?? 0;
    const totalMatched = matchedCount; // This is the combined count from the API
    const unaffected = Math.max(0, totalPending - totalMatched);

    const freq = new Map<string, number>();
    for (const m of (p.matches || [])) {
      for (const pat of (m.matchedPatterns || [])) {
        freq.set(pat, (freq.get(pat) || 0) + 1);
      }
    }
    const topPhrases: PreviewTopPhrase[] = Array.from(freq.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalPending,
      rulesEnabled,
      wouldMarkSpamReview: matchedCount - learningMatchedCount, // Only phrase rules
      learningMatchedCount,
      totalMatched,
      unaffected,
      topPhrases,
      sampleMatches: (p.matches || []).slice(0, 100).map((m: any, i: number) => ({
        id: `${m.taskId}-${i}`,
        brand: m.brand,
        text: m.text,
        matchedPatterns: m.matchedPatterns || [],
        learningScore: (m as any).learningScore,
        learningReasons: (m as any).learningReasons,
      })),
    };
  }, [preview]);

  if (!summary) return <div className="text-white/60">No preview yet.</div>;

  return (
    <div className="text-sm text-white/80">
      <div className="font-medium mb-1 text-white/90">Spam Preview (Phrases + Learning)</div>
      <ul className="list-disc pl-5 space-y-1">
        <li>Rows considered (Ready to Assign): {summary.totalPending}</li>
        <li>Rules enabled: {summary.rulesEnabled}</li>
        <li>Would mark "Spam Review": {summary.totalMatched}</li>
        <li className="text-blue-400">  ↳ From phrase rules: {summary.wouldMarkSpamReview}</li>
        <li className="text-green-400">  ↳ From learning system: {summary.learningMatchedCount}</li>
        <li>Unaffected: {summary.unaffected}</li>
      </ul>

      <div className="mt-3">
        <div className="font-medium text-white/90">Top phrases:</div>
        {summary.topPhrases.length === 0 ? (
          <div className="text-white/50">—</div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1">
            {summary.topPhrases.map((t) => (
              <Badge key={t.pattern} tone="muted">
                "{t.pattern}" — {t.count}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Show sample matches with learning system highlighting */}
      {summary.sampleMatches.length > 0 && (
        <div className="mt-4">
          <div className="font-medium text-white/90 mb-2">Sample matches:</div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {summary.sampleMatches.slice(0, 5).map((match, index) => (
              <div 
                key={match.id} 
                className={`p-2 rounded border ${
                  match.learningScore && match.learningScore >= 70 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-white/80 text-sm truncate">
                      {match.text?.substring(0, 80)}...
                    </div>
                    <div className="text-white/50 text-xs">
                      {match.brand} • {match.matchedPatterns.length} phrase rules
                      {match.learningScore && match.learningScore >= 70 && (
                        <span className="text-green-400 ml-2">• 🧠 Learning: {match.learningScore}%</span>
                      )}
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
}

function SpamPreviewCaptureSection() {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  async function doPreview() {
    try {
      setPreviewLoading(true);
      const response = await fetch("/api/manager/spam/preview", { cache: "no-store" });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPreview(data);
    } catch (error) {
      console.error("Preview error:", error);
      setPreview(null);
      alert(`Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function doCapture() {
    try {
      setCaptureLoading(true);
      setCaptureMsg(null);
      
      // STEP 1: Fast capture (phrase rules only)
      const res = await fetch("/api/manager/spam/capture", { method: "POST" });
      
      // Use response validator to handle all response types gracefully
      const { validateAndParseResponse } = await import("@/lib/self-healing/response-validator");
      const data = await validateAndParseResponse(res, {
        fallbackError: 'Failed to capture spam'
      });
      
      if (data?.success) {
        const captured = data.updatedCount ?? 0;
        const total = data.totalInQueue ?? 0;
        const remaining = data.remainingInQueue ?? 0;
        const needsBackground = data.needsBackground ?? false;
        const elapsed = data.elapsed ?? 0;
        
        // Show fast capture results
        let message = `✅ Fast capture complete!\n\nCaptured ${captured} spam items (phrase rules)\nTime: ${(elapsed / 1000).toFixed(1)}s\n\n`;
        
        if (needsBackground) {
          message += `🔄 Processing pattern + learning matches in background...`;
          setCaptureMsg(`Captured ${captured} spam items. Processing pattern + learning matches...`);
          
          // STEP 2: Background processing (pattern + learning)
          await processBackgroundCapture(total, remaining);
        } else {
          message += remaining > 0 ? `${remaining} remaining in queue.` : "All done! ✅";
          setCaptureMsg(`Captured ${captured} spam items. ${remaining > 0 ? `${remaining} remaining in queue.` : "All done!"}`);
          alert(message);
        }
      } else {
        throw new Error(data?.error || "Capture failed");
      }
    } catch (error: any) {
      console.error("Capture spam error:", error);
      const errorMsg = error?.message || "Failed to capture spam. Please try again.";
      alert(`Error: ${errorMsg}`);
      setCaptureMsg(errorMsg);
    } finally {
      setCaptureLoading(false);
    }
  }

  async function processBackgroundCapture(totalInQueue: number, initialRemaining: number) {
    let skip = 0;
    let totalBackgroundCaptured = 0;
    let isComplete = false;
    const BATCH_SIZE = 200;
    
    try {
      while (!isComplete) {
        const res = await fetch("/api/manager/spam/capture-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skip, take: BATCH_SIZE })
        });
        
        const { validateAndParseResponse } = await import("@/lib/self-healing/response-validator");
        const data = await validateAndParseResponse(res, {
          fallbackError: 'Background processing failed'
        });
        
        if (data?.success) {
          totalBackgroundCaptured += data.updatedCount ?? 0;
          isComplete = data.complete ?? false;
          skip = data.nextSkip ?? (skip + BATCH_SIZE);
          
          const remaining = data.remaining ?? 0;
          const processed = data.processed ?? 0;
          
          // Update UI with progress
          setCaptureMsg(
            `Captured ${totalBackgroundCaptured} additional spam items (pattern + learning). ` +
            `Processing ${processed} messages... ${remaining > 0 ? `${remaining} remaining.` : "Almost done!"}`
          );
          
          if (isComplete) {
            const finalMessage = `✅ Background processing complete!\n\n` +
              `Total captured: ${totalBackgroundCaptured} spam items (pattern + learning)\n` +
              `All spam detection complete!`;
            alert(finalMessage);
            setCaptureMsg(`Background processing complete! Captured ${totalBackgroundCaptured} additional spam items.`);
            loadSummary(); // Refresh counts
            break;
          }
        } else {
          console.error("Background processing error:", data?.error);
          setCaptureMsg(`Background processing encountered an error: ${data?.error || "Unknown error"}`);
          break;
        }
      }
    } catch (error: any) {
      console.error("Background processing error:", error);
      setCaptureMsg(`Background processing failed: ${error?.message || "Unknown error"}`);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>🧹 Spam (Preview → Capture)</H2>
        {captureMsg && <span className="text-sm text-white/70">{captureMsg}</span>}
      </div>

      {/* Spam Detection System Explanation */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-white/80">
        <div className="font-medium text-white/90 mb-2">📋 How Our Spam Detection Works:</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Phrase Rules (512 active):</strong> Matches exact keywords and phrases from our spam rule database. Uses word boundary matching to avoid false positives.</li>
          <li><strong>Fuzzy Matching:</strong> Catches variations of keywords (e.g., "unlock", "UnLOck", "nlock") using similarity scoring (70%+ match).</li>
          <li><strong>Pattern Detection:</strong> Identifies spam patterns like personal messages ("Just got home"), random strings ("23345"), gibberish, and incomplete messages.</li>
          <li><strong>Learning System:</strong> Learns from manual spam review decisions and historical data to improve detection over time. Only checks items that don't match phrase rules for efficiency.</li>
          <li><strong>Confidence Scoring:</strong> Items scoring 70%+ are marked as spam. Lower scores may require manual review.</li>
        </ul>
        <div className="mt-2 text-white/60 text-xs">
          💡 <strong>Tip:</strong> Use "Preview Spam" to see what would be caught before capturing. The system processes 100 items at a time to prevent timeouts.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SmallButton onClick={doPreview} disabled={previewLoading}>
          {previewLoading ? "Previewing…" : "Preview Spam"}
        </SmallButton>
        <PrimaryButton onClick={doCapture} disabled={captureLoading}>
          {captureLoading ? "Capturing…" : "Capture Spam"}
        </PrimaryButton>
        <SmallButton onClick={() => setShowInsights(true)}>
          🧠 View Learning Insights
        </SmallButton>
      </div>

      <PreviewSummaryBlock preview={preview} />
      
      {showInsights && (
        <SpamInsights onClose={() => setShowInsights(false)} />
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Spam Review — includes Restore & Turn Off Phrase                           */
/* ========================================================================== */
function SpamReviewSection({
  onChangedCounts,
}: {
  onChangedCounts?: (deltaReady: number, deltaSpamReview: number) => void;
}) {
  const PAGE_SIZE = 50;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SpamReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(1);

  const [nextCursorByPage, setNextCursorByPage] = useState<Record<number, string | null>>({});
  const [cacheByPage, setCacheByPage] = useState<Record<number, SpamReviewItem[]>>({});

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [whitelistToggles, setWhitelistToggles] = useState<Record<string, boolean>>({});
  const [applyLoading, setApplyLoading] = useState(false);
  
  // sorting
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  function resetPaging() {
    setItems([]); setTotal(0); setPage(1);
    setCacheByPage({}); setNextCursorByPage({});
  }

  useEffect(() => { if (open) { resetPaging(); fetchPage(1); } }, [open]);
  
  // Fetch page when sort changes
  useEffect(() => {
    if (open) {
      fetchPage(1);
    }
  }, [sort]);

  async function fetchPage(targetPage: number) {
    setLoading(true);
    try {
      if (cacheByPage[targetPage]) { setItems(cacheByPage[targetPage]); setPage(targetPage); return; }
      const params = new URLSearchParams();
      params.set("take", String(PAGE_SIZE));
      const offset = (targetPage - 1) * PAGE_SIZE;
      params.set("offset", String(offset));
      params.set("skip", String(offset));
      if (q.trim()) params.set("q", q.trim());
      
      // Add sorting parameters
      if (sort?.key && sort.direction) {
        params.set("sortBy", sort.key);
        params.set("sortOrder", sort.direction);
      }
      
      const startCursor = nextCursorByPage[targetPage - 1];
      if (targetPage > 1 && startCursor) params.set("cursor", startCursor);

      const res = await fetch(`/api/manager/spam/review?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return;

      const newItems: SpamReviewItem[] = Array.isArray(data.items) ? data.items : [];
      const serverTotal: number = typeof data.total === "number" ? data.total : (total || newItems.length);
      const nextCursor: string | null = data.nextCursor ?? (newItems.length ? String(newItems[newItems.length - 1].id) : null);

      setCacheByPage((prev) => ({ ...prev, [targetPage]: newItems }));
      setNextCursorByPage((prev) => ({ ...prev, [targetPage]: nextCursor }));

      setItems(newItems); setTotal(serverTotal); setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  async function onSearch() { resetPaging(); await fetchPage(1); }
  const onPrev = () => page > 1 && fetchPage(page - 1);
  const onNext = () => page < totalPages && fetchPage(page + 1);
  
  // Refresh current page by clearing cache and refetching
  async function handleRefresh() {
    // Clear cache for current page to force fresh data
    setCacheByPage((prev) => {
      const newCache = { ...prev };
      delete newCache[page];
      return newCache;
    });
    setNextCursorByPage((prev) => {
      const newCursors = { ...prev };
      delete newCursors[page];
      return newCursors;
    });
    await fetchPage(page);
  }
  
  const handleSort = (key: string, direction: SortDirection) => {
    setSort(direction ? { key, direction } : null);
    // Clear cache when sorting changes to force fresh data
    setCacheByPage({});
    setNextCursorByPage({});
    setItems([]);
    setTotal(0);
    setPage(1);
  };

  async function restoreBase(row: SpamReviewItem, whitelist: string[]) {
    const res = await fetch("/api/manager/spam/review/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [row.id], whitelist }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.error || "Restore failed");
    
    // Remove from learning data to prevent future false positives
    try {
      if (row.text) {
        await fetch("/api/spam/unlearn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: row.text,
            brand: row.brand,
            isSpam: true // Remove spam learning for this text
          })
        });
      }
    } catch (error) {
      console.error('Failed to unlearn from restored item:', error);
      // Don't fail the restore if unlearning fails
    }
  }

  async function restore(row: SpamReviewItem) {
    setRestoringId(row.id);
    try {
      const raw = row.previewMatches;
      const phrases = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
      const whitelistOn = whitelistToggles[row.id] ?? true;
      await restoreBase(row, whitelistOn ? phrases : []);
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      setCacheByPage((prev) => ({ ...prev, [page]: (prev[page] || []).filter((x) => x.id !== row.id) }));
      onChangedCounts?.(1, -1);
      setTotal((t) => Math.max(0, t - 1));
      if ((cacheByPage[page]?.length || 1) <= 1 && page > 1) fetchPage(page - 1);
    } finally { setRestoringId(null); }
  }

  async function restoreAndTurnOff(row: SpamReviewItem) {
    setRestoringId(row.id);
    try {
      const raw = row.previewMatches;
      const phrases = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
      // 1) Restore
      await restoreBase(row, []); // don't whitelist; we're turning off rules instead
      // 2) Disable matched phrases
      for (const p of phrases) {
        await fetch("/api/spam/toggle", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: p, enabled: false }),
        }).catch(() => {});
      }
      // update table
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      setCacheByPage((prev) => ({ ...prev, [page]: (prev[page] || []).filter((x) => x.id !== row.id) }));
      onChangedCounts?.(1, -1);
      setTotal((t) => Math.max(0, t - 1));
      if ((cacheByPage[page]?.length || 1) <= 1 && page > 1) fetchPage(page - 1);
    } catch (e: any) {
      alert(e?.message || "Failed to restore & turn off phrase");
    } finally {
      setRestoringId(null);
    }
  }

  async function applyAllFiltered() {
    if (!confirm(`Archive all ${total} spam items that match the current filter?`)) return;
    
    // Use direct database update endpoint - handles any size efficiently
    await processSpamDirectly();
  }

  async function processSpamDirectly() {
    try {
      setApplyLoading(true);
      // Use direct database update endpoint to avoid timeout issues
      // This endpoint uses efficient bulk operations that can handle any size
      const res = await fetch("/api/manager/spam/apply-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { 
        alert(data?.error || "Failed to apply reviewer decisions"); 
        return; 
      }
      const archivedCount = Number(data.archivedCount || 0);
      onChangedCounts?.(0, -archivedCount);
      resetPaging();
      await fetchPage(1);
      
      // Show success message with processing time
      if (data.processingTimeMs && archivedCount > 0) {
        const timeSeconds = (data.processingTimeMs / 1000).toFixed(1);
        console.log(`Successfully archived ${archivedCount} items in ${timeSeconds}s`);
      }
    } finally { 
      setApplyLoading(false); 
    }
  }

  async function processSpamInBackground() {
    try {
      setApplyLoading(true);
      let totalProcessed = 0;
      let hasMore = true;
      let batchCount = 0;
      const maxBatches = 20; // Safety limit

      while (hasMore && batchCount < maxBatches) {
        batchCount++;
        console.log(`Processing batch ${batchCount}...`);
        
        const res = await fetch("/api/manager/spam/apply-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            batchSize: 5, 
            maxBatches: 1, // Process one batch at a time
            q: q.trim() || undefined 
          }),
        });
        
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          alert(`Error processing batch ${batchCount}: ${data?.error || "Unknown error"}`);
          break;
        }
        
        totalProcessed += data.processedCount || 0;
        hasMore = data.hasMore || false;
        
        // Update UI after each batch
        onChangedCounts?.(0, -(data.processedCount || 0));
        await fetchPage(1);
        
        // Small delay between batches to prevent overwhelming the server
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (totalProcessed > 0) {
        alert(`Successfully processed ${totalProcessed} spam items in ${batchCount} batches.`);
      }
      
    } catch (error) {
      console.error("Background spam processing error:", error);
      alert("Error processing spam items. Please try again.");
    } finally { 
      setApplyLoading(false); 
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>🗂️ Spam Review Queue</H2>
        <div className="flex items-center gap-2">
          <div className="text-sm text-white/60">{open ? `${total} total` : ""}</div>
          {open && (
            <SmallButton onClick={applyAllFiltered} disabled={applyLoading || loading || total === 0} title="Archive all matches">
              {applyLoading ? "Processing…" : "Apply reviewer decisions"}
            </SmallButton>
          )}
          <SmallButton onClick={() => setOpen((s) => !s)}>{open ? "Hide" : "Show"}</SmallButton>
        </div>
      </div>

      {!open ? null : (
        <>
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search brand / text…"
              className="w-full md:max-w-sm rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
            <SmallButton onClick={onSearch} disabled={loading}>
              {loading ? "Loading…" : "Search"}
            </SmallButton>
            <SmallButton onClick={handleRefresh} disabled={loading}>
              {loading ? "Loading…" : "🔄 Refresh"}
            </SmallButton>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm rounded-xl overflow-hidden table-fixed">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-white/60">
                  <SortableHeader 
                    sortKey="brand" 
                    currentSort={sort} 
                    onSort={handleSort}
                    className="w-32"
                  >
                    Brand
                  </SortableHeader>
                  <SortableHeader 
                    sortKey="text" 
                    currentSort={sort} 
                    onSort={handleSort}
                    className="w-auto"
                  >
                    Text
                  </SortableHeader>
                  <SortableHeader 
                    sortKey="matched" 
                    currentSort={sort} 
                    onSort={handleSort}
                    className="w-56"
                  >
                    Matched
                  </SortableHeader>
                  <SortableHeader 
                    sortKey="createdAt" 
                    currentSort={sort} 
                    onSort={handleSort}
                    className="w-44"
                  >
                    Created
                  </SortableHeader>
                  <th className="px-3 py-2 w-44">Whitelist?</th>
                  <th className="px-3 py-2 w-[260px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.length === 0 && (
                  <tr><td className="px-3 py-3 text-white/60" colSpan={6}>{loading ? "Loading…" : "No items."}</td></tr>
                )}
                {items.map((row, idx) => {
                  const raw = row.previewMatches;
                  const phrases = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
                  const on = whitelistToggles[row.id] ?? true;

                  return (
                    <tr 
                      key={`${row.id}-${row.createdAt}-${idx}`} 
                      className={`text-white/90 align-top ${
                        row.learningScore && row.learningScore >= 70 
                          ? 'bg-green-500/5 border-l-4 border-green-500/50' 
                          : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        {row.brand || "—"}
                        {row.learningScore && row.learningScore >= 70 && (
                          <div className="text-xs text-green-400 mt-1">🧠 Learning: {row.learningScore}%</div>
                        )}
                        {row.spamSource && (
                          <div className={`text-xs mt-1 ${
                            row.spamSource === 'manual' ? 'text-orange-400' :
                            row.spamSource === 'learning' ? 'text-green-400' :
                            'text-blue-400'
                          }`}>
                            {row.spamSource === 'manual' ? '👤 Manual' :
                             row.spamSource === 'learning' ? '🧠 Learning' :
                             '🤖 Automatic'}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-md">
                        <Bubble><div className="line-clamp-3 break-words overflow-wrap-anywhere">{row.text || "—"}</div></Bubble>
                        {row.learningReasons && row.learningReasons.length > 0 && (
                          <div className="text-xs text-green-400 mt-1">
                            {row.learningReasons.slice(0, 2).join(', ')}
                            {row.learningReasons.length > 2 && '...'}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {phrases.length === 0 ? <Badge tone="muted">—</Badge> :
                            phrases.map((p, i) => <Badge key={`${row.id}-${i}-${p}`} tone="muted">{p}</Badge>)}
                        </div>
                      </td>
                      <td className="px-3 py-2">{fmtDate(row.createdAt)}</td>
                      <td className="px-3 py-2">
                        <label className="text-xs flex items-center gap-2 text-white/80">
                          <input
                            type="checkbox"
                            className="accent-sky-500"
                            checked={on}
                            onChange={(e) => setWhitelistToggles((m) => ({ ...m, [row.id]: e.target.checked }))}
                          />
                          Add matched to whitelist
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <SmallButton onClick={() => restore(row)} disabled={restoringId === row.id}>
                            {restoringId === row.id ? "Restoring…" : "Restore"}
                          </SmallButton>
                          <SmallButton onClick={() => restoreAndTurnOff(row)} disabled={restoringId === row.id}>
                            {restoringId === row.id ? "Working…" : "Restore & Turn Off Phrase"}
                          </SmallButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">
              Page {page} of {totalPages} · Showing {items.length} of {total}
            </div>
            <div className="flex items-center gap-2">
              <SmallButton onClick={() => onPrev()} disabled={loading || page <= 1}>Prev</SmallButton>
              
              {/* Page Selection Dropdown */}
              <select
                value={page}
                onChange={(e) => fetchPage(Number(e.target.value))}
                disabled={loading || totalPages <= 1}
                className="border-none rounded-lg px-2 py-1 bg-white/10 text-white text-xs ring-1 ring-white/10 focus:outline-none min-w-[60px]"
                title="Jump to page"
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <option key={pageNum} value={pageNum}>
                    {pageNum}
                  </option>
                ))}
              </select>
              
              <SmallButton onClick={() => onNext()} disabled={loading || page >= totalPages}>Next</SmallButton>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Completed Work Dashboard                                                   */
/* ========================================================================== */
type CompletedTask = {
  id: string;
  brand: string | null;
  text: string | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
  durationSec: number | null;
  disposition: string | null;
  sfCaseNumber?: string | null;
  assignedTo: {
    name: string | null;
    email: string;
  } | null;
  rawMessage: {
    brand: string | null;
    phone: string | null;
    text: string | null;
  } | null;
};

type CompletedWorkAnalytics = {
  agentAnalytics: Array<{
    agent: { name: string | null; email: string };
    avgDuration: number;
    completedCount: number;
  }>;
  dispositionAnalytics: Array<{
    disposition: string;
    avgDuration: number;
    completedCount: number;
    subcategories?: Array<{
      disposition: string;
      avgDuration: number;
      completedCount: number;
    }>;
  }>;
  completedToday: number;
};

function CompletedWorkDashboard() {
  const [open, setOpen] = useState(true);
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [analytics, setAnalytics] = useState<CompletedWorkAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filters
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [dispositionFilter, setDispositionFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  
  // Date picker and comparison
  const [dateMode, setDateMode] = useState<'single' | 'compare'>('single');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [compareStartDate, setCompareStartDate] = useState<string>('');
  const [compareEndDate, setCompareEndDate] = useState<string>('');
  const [comparisonData, setComparisonData] = useState<CompletedWorkAnalytics | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  async function loadCompletedWork() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter) params.set("agent", agentFilter);
      if (dispositionFilter !== "all") params.set("disposition", dispositionFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("includeAll", "true"); // Request all data for reporting
      params.set("limit", limit.toString());
      params.set("offset", offset.toString());

      const response = await fetch(`/api/manager/dashboard/completed-work?${params.toString()}`, { cache: "no-store" });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          setTasks(data.completedTasks || []);
          setAnalytics(data.analytics || null);
          setTotalCount(data.totalCount || 0);
        }
      }
    } catch (error) {
      console.error("📊 Error loading completed work:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadComparisonData() {
    if (!compareStartDate || !compareEndDate) return;
    
    setComparisonLoading(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter) params.set("agent", agentFilter);
      if (dispositionFilter !== "all") params.set("disposition", dispositionFilter);
      params.set("startDate", compareStartDate);
      params.set("endDate", compareEndDate);
      params.set("limit", limit.toString());
      params.set("offset", offset.toString());

      const response = await fetch(`/api/manager/dashboard/completed-work?${params.toString()}`, { cache: "no-store" });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          setComparisonData(data.analytics || null);
        }
      }
    } catch (error) {
      console.error("📊 Error loading comparison data:", error);
    } finally {
      setComparisonLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadCompletedWork();
      if (dateMode === 'compare' && compareStartDate && compareEndDate) {
        loadComparisonData();
      }
    }
  }, [open, agentFilter, dispositionFilter, limit, offset, startDate, endDate, dateMode, compareStartDate, compareEndDate]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDispositionColor = (disposition: string) => {
    const colors = {
      "Answered in Attentive": "#10B981", // green
      "Answered in SF": "#3B82F6", // blue
      "Spam": "#EF4444", // red
      "Previously Assisted": "#F59E0B", // yellow
      "No Response Required": "#8B5CF6", // purple
    };
    return colors[disposition as keyof typeof colors] || "#6B7280"; // gray fallback
  };

  // Date helper functions
  const setDateRange = (range: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisYear' | 'lastYear') => {
    const today = new Date();
    let start: Date, end: Date;

    switch (range) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'thisWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        end = new Date(today);
        break;
      case 'lastWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() - 7);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        end = new Date(today);
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
        const lastQuarterYear = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
        const lastQuarterMonth = lastQuarter < 0 ? 9 : lastQuarter * 3;
        start = new Date(lastQuarterYear, lastQuarterMonth, 1);
        end = new Date(lastQuarterYear, lastQuarterMonth + 2, new Date(lastQuarterYear, lastQuarterMonth + 3, 0).getDate());
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today);
        break;
      case 'lastYear':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
    }

    // Format dates as YYYY-MM-DD without timezone conversion
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  const setComparisonDateRange = (range: 'previousPeriod' | 'sameLastMonth' | 'sameLastQuarter' | 'sameLastYear') => {
    if (!startDate || !endDate) return;
    
    const currentStart = new Date(startDate);
    const currentEnd = new Date(endDate);
    const periodLength = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
    
    let compareStart: Date, compareEnd: Date;

    switch (range) {
      case 'previousPeriod':
        compareEnd = new Date(currentStart);
        compareEnd.setDate(compareEnd.getDate() - 1);
        compareStart = new Date(compareEnd);
        compareStart.setDate(compareStart.getDate() - periodLength);
        break;
      case 'sameLastMonth':
        compareStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, currentStart.getDate());
        compareEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth() - 1, currentEnd.getDate());
        break;
      case 'sameLastQuarter':
        const quarter = Math.floor(currentStart.getMonth() / 3);
        const lastQuarter = quarter - 1;
        const lastQuarterYear = lastQuarter < 0 ? currentStart.getFullYear() - 1 : currentStart.getFullYear();
        const lastQuarterMonth = lastQuarter < 0 ? 9 : lastQuarter * 3;
        compareStart = new Date(lastQuarterYear, lastQuarterMonth, currentStart.getDate());
        compareEnd = new Date(lastQuarterYear, lastQuarterMonth + 2, currentEnd.getDate());
        break;
      case 'sameLastYear':
        compareStart = new Date(currentStart.getFullYear() - 1, currentStart.getMonth(), currentStart.getDate());
        compareEnd = new Date(currentEnd.getFullYear() - 1, currentEnd.getMonth(), currentEnd.getDate());
        break;
    }

    setCompareStartDate(compareStart.toISOString().split('T')[0]);
    setCompareEndDate(compareEnd.toISOString().split('T')[0]);
  };

  // Comparison calculation functions
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return "text-green-400";
    if (change < 0) return "text-red-400";
    return "text-gray-400";
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return "↗";
    if (change < 0) return "↘";
    return "→";
  };

  // CSV download function
  const downloadCompletedTasksCSV = () => {
    if (!tasks || tasks.length === 0) {
      alert('No data available to export. Please load the dashboard first.');
      return;
    }

    // Create CSV headers
    const headers = [
      'Brand',
      'Phone',
      'Agent Name',
      'Agent Email',
      'Start Time',
      'End Time',
      'Duration (min)',
      'Disposition',
      'SF Case #',
      'Message Text'
    ];

    // Create CSV rows
    const rows = tasks.map(task => [
      task.brand || '',
      task.rawMessage?.phone || '',
      task.assignedTo?.name || '',
      task.assignedTo?.email || '',
      task.startTime ? new Date(task.startTime).toLocaleString() : '',
      task.endTime ? new Date(task.endTime).toLocaleString() : '',
      task.durationSec ? Math.round(task.durationSec / 60) : '',
      task.disposition || '',
      task.sfCaseNumber || '',
      (task.text || task.rawMessage?.text || '').replace(/"/g, '""') // Escape quotes
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename with date range
    const dateRange = startDate && endDate 
      ? `_${startDate}_to_${endDate}` 
      : `_${new Date().toISOString().split('T')[0]}`;
    
    link.setAttribute('download', `completed_tasks${dateRange}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show success message
    alert(
      `CSV Export Complete!\n\n` +
      `Total Tasks: ${tasks.length}\n` +
      `Date Range: ${startDate && endDate ? `${startDate} to ${endDate}` : 'Current period'}\n\n` +
      `File saved as: completed_tasks${dateRange}.csv`
    );
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📊 Completed Work Dashboard</H2>
        <div className="flex items-center gap-2">
          <SmallButton onClick={loadCompletedWork} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </SmallButton>
          <SmallButton onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Show"}
          </SmallButton>
        </div>
      </div>

      {!open ? null : (
        <div className="space-y-6">


          {/* Analytics Summary */}
          {analytics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-sm text-white/60">Completed {dateMode === 'compare' ? 'Current Period' : 'Today'}</div>
                <div className="text-2xl font-bold mt-1">{analytics.completedToday}</div>
                {dateMode === 'compare' && comparisonData && (
                  <div className={`text-sm mt-1 ${getChangeColor(calculateChange(analytics.completedToday, comparisonData.completedToday))}`}>
                    {getChangeIcon(calculateChange(analytics.completedToday, comparisonData.completedToday))} {Math.abs(calculateChange(analytics.completedToday, comparisonData.completedToday)).toFixed(1)}% vs {compareStartDate} to {compareEndDate}
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <div className="text-sm text-white/60">Total Completed</div>
                <div className="text-2xl font-bold mt-1">{totalCount}</div>
                {dateMode === 'compare' && comparisonData && (
                  <div className={`text-sm mt-1 ${getChangeColor(calculateChange(totalCount, comparisonData.completedToday))}`}>
                    {getChangeIcon(calculateChange(totalCount, comparisonData.completedToday))} {Math.abs(calculateChange(totalCount, comparisonData.completedToday)).toFixed(1)}% vs {compareStartDate} to {compareEndDate}
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <div className="text-sm text-white/60">Avg Handle Time</div>
                <div className="text-2xl font-bold mt-1">
                  {analytics.agentAnalytics.length > 0 
                    ? formatDuration(Math.round(analytics.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / analytics.agentAnalytics.length))
                    : "—"
                  }
                </div>
                {dateMode === 'compare' && comparisonData && comparisonData.agentAnalytics.length > 0 && (
                  <div className={`text-sm mt-1 ${getChangeColor(calculateChange(
                    Math.round(analytics.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / analytics.agentAnalytics.length),
                    Math.round(comparisonData.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / comparisonData.agentAnalytics.length)
                  ))}`}>
                    {getChangeIcon(calculateChange(
                      Math.round(analytics.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / analytics.agentAnalytics.length),
                      Math.round(comparisonData.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / comparisonData.agentAnalytics.length)
                    ))} {Math.abs(calculateChange(
                      Math.round(analytics.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / analytics.agentAnalytics.length),
                      Math.round(comparisonData.agentAnalytics.reduce((sum, a) => sum + a.avgDuration, 0) / comparisonData.agentAnalytics.length)
                    )).toFixed(1)}% vs {compareStartDate} to {compareEndDate}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Disposition Totals */}
          {analytics && analytics.dispositionAnalytics.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Clean Disposition List */}
              <Card className="p-4">
                <div className="text-xl font-semibold mb-4">📊 Disposition Totals</div>
                <div className="space-y-3">
                  {analytics.dispositionAnalytics.map((dispo) => {
                    const comparisonDispo = comparisonData?.dispositionAnalytics.find(d => d.disposition === dispo.disposition);
                    const countChange = comparisonDispo ? calculateChange(dispo.completedCount, comparisonDispo.completedCount) : 0;
                    const durationChange = comparisonDispo ? calculateChange(dispo.avgDuration || 0, comparisonDispo.avgDuration || 0) : 0;
                    
                    return (
                      <div key={dispo.disposition} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                        <div className="font-medium">{dispo.disposition}</div>
                        <div className="text-right">
                          <div className="font-bold flex items-center gap-2">
                            {dispo.completedCount}
                            {dateMode === 'compare' && comparisonDispo && (
                              <span className={`text-sm ${getChangeColor(countChange)}`}>
                                {getChangeIcon(countChange)} {Math.abs(countChange).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-white/60 flex items-center gap-2">
                            {formatDuration(dispo.avgDuration)} avg
                            {dateMode === 'compare' && comparisonDispo && (
                              <span className={`text-xs ${getChangeColor(durationChange)}`}>
                                {getChangeIcon(durationChange)} {Math.abs(durationChange).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Pie Chart */}
              <Card className="p-4">
                <div className="text-xl font-semibold mb-4">📈 Distribution</div>
                <div className="h-64 flex items-center justify-center">
                  <PieChart width={200} height={200}>
                    <Pie
                      data={analytics.dispositionAnalytics.map(dispo => ({
                        name: dispo.disposition,
                        value: dispo.completedCount,
                        fill: getDispositionColor(dispo.disposition)
                      }))}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {analytics.dispositionAnalytics.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getDispositionColor(entry.disposition)} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </div>
              </Card>
            </div>
          )}

          {/* Date Picker and Comparison */}
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">📅 Date Range & Comparison</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDateMode('single')}
                    className={`px-3 py-1 rounded text-sm ${
                      dateMode === 'single' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    Single Period
                  </button>
                  <button
                    onClick={() => setDateMode('compare')}
                    className={`px-3 py-1 rounded text-sm ${
                      dateMode === 'compare' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    Compare Periods
                  </button>
                </div>
              </div>

              {/* Quick Date Selection */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setDateRange('today')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Today</button>
                <button onClick={() => setDateRange('yesterday')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Yesterday</button>
                <button onClick={() => setDateRange('thisWeek')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">This Week</button>
                <button onClick={() => setDateRange('lastWeek')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Last Week</button>
                <button onClick={() => setDateRange('thisMonth')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">This Month</button>
                <button onClick={() => setDateRange('lastMonth')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Last Month</button>
                <button onClick={() => setDateRange('thisQuarter')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">This Quarter</button>
                <button onClick={() => setDateRange('lastQuarter')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Last Quarter</button>
                <button onClick={() => setDateRange('thisYear')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">This Year</button>
                <button onClick={() => setDateRange('lastYear')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Last Year</button>
              </div>

              {/* Custom Date Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-white/60 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/60 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Comparison Date Inputs */}
              {dateMode === 'compare' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h4 className="text-md font-medium">Comparison Period</h4>
                    <div className="flex gap-2">
                      <button onClick={() => setComparisonDateRange('previousPeriod')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Previous Period</button>
                      <button onClick={() => setComparisonDateRange('sameLastMonth')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Same Last Month</button>
                      <button onClick={() => setComparisonDateRange('sameLastQuarter')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Same Last Quarter</button>
                      <button onClick={() => setComparisonDateRange('sameLastYear')} className="px-3 py-1 bg-white/10 text-white text-sm rounded hover:bg-white/20">Same Last Year</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-white/60 block mb-1">Compare Start Date</label>
                      <input
                        type="date"
                        value={compareStartDate}
                        onChange={(e) => setCompareStartDate(e.target.value)}
                        className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-white/60 block mb-1">Compare End Date</label>
                      <input
                        type="date"
                        value={compareEndDate}
                        onChange={(e) => setCompareEndDate(e.target.value)}
                        className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-sm text-white/60 block mb-1">Filter by Agent</label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none"
              >
                <option value="">All Agents</option>
                {analytics?.agentAnalytics.map((a) => (
                  <option key={a.agent.email} value={a.agent.email}>
                    {a.agent.name || a.agent.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-1">Filter by Disposition</label>
              <select
                value={dispositionFilter}
                onChange={(e) => setDispositionFilter(e.target.value)}
                className="border-none rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 focus:outline-none"
              >
                <option value="all">All Dispositions</option>
                {analytics?.dispositionAnalytics.map((d) => (
                  <option key={d.disposition} value={d.disposition}>
                    {d.disposition}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Analytics Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Agent Analytics */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
              <div className="space-y-3">
                {analytics?.agentAnalytics.map((agent) => {
                  const comparisonAgent = comparisonData?.agentAnalytics.find(a => a.agent.email === agent.agent.email);
                  const countChange = comparisonAgent ? calculateChange(agent.completedCount, comparisonAgent.completedCount) : 0;
                  const durationChange = comparisonAgent ? calculateChange(agent.avgDuration || 0, comparisonAgent.avgDuration || 0) : 0;
                  
                  return (
                    <div key={agent.agent.email} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                      <div>
                        <div className="font-medium">{agent.agent.name || agent.agent.email}</div>
                        <div className="text-sm text-white/60 flex items-center gap-2">
                          {agent.completedCount} completed
                          {dateMode === 'compare' && comparisonAgent && (
                            <span className={`text-xs ${getChangeColor(countChange)}`}>
                              {getChangeIcon(countChange)} {Math.abs(countChange).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono flex items-center gap-2">
                          {formatDuration(agent.avgDuration)}
                          {dateMode === 'compare' && comparisonAgent && (
                            <span className={`text-xs ${getChangeColor(durationChange)}`}>
                              {getChangeIcon(durationChange)} {Math.abs(durationChange).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-white/60">avg time</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Disposition Analytics */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Disposition Performance</h3>
              <div className="space-y-3">
                {analytics?.dispositionAnalytics.map((disp) => {
                  const comparisonDisp = comparisonData?.dispositionAnalytics.find(d => d.disposition === disp.disposition);
                  const countChange = comparisonDisp ? calculateChange(disp.completedCount, comparisonDisp.completedCount) : 0;
                  const durationChange = comparisonDisp ? calculateChange(disp.avgDuration || 0, comparisonDisp.avgDuration || 0) : 0;
                  
                  return (
                    <div key={disp.disposition} className="p-3 bg-white/5 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{disp.disposition}</div>
                          <div className="text-sm text-white/60 flex items-center gap-2">
                            {disp.completedCount} completed
                            {dateMode === 'compare' && comparisonDisp && (
                              <span className={`text-xs ${getChangeColor(countChange)}`}>
                                {getChangeIcon(countChange)} {Math.abs(countChange).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono flex items-center gap-2">
                            {formatDuration(disp.avgDuration)}
                            {dateMode === 'compare' && comparisonDisp && (
                              <span className={`text-xs ${getChangeColor(durationChange)}`}>
                                {getChangeIcon(durationChange)} {Math.abs(durationChange).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-white/60">avg time</div>
                        </div>
                      </div>
                      {/* Show subcategories if available */}
                      {disp.subcategories && disp.subcategories.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="text-xs text-white/50 mb-2">Breakdown:</div>
                          <div className="grid grid-cols-2 gap-2">
                            {disp.subcategories.map((sub) => (
                              <div key={sub.disposition} className="text-xs bg-white/5 p-2 rounded">
                                <div className="font-medium">{sub.disposition}</div>
                                <div className="text-white/60">{sub.completedCount} ({formatDuration(sub.avgDuration)})</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Completed Tasks Table */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Raw Data from selected source</h3>
              <button
                onClick={() => downloadCompletedTasksCSV()}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                📥 Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.04]">
                  <tr className="text-left text-white/60">
                    <th className="px-3 py-2">Brand</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Start Time</th>
                    <th className="px-3 py-2">End Time</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Disposition</th>
                    <th className="px-3 py-2">SF Case #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-white/40">
                        {loading ? "Loading..." : "No data found for selected criteria."}
                      </td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-white/5">
                        <td className="px-3 py-2">
                          <div className="font-medium">{task.brand || "—"}</div>
                          <div className="text-xs text-white/50 truncate max-w-48">
                            {task.text || task.rawMessage?.text || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-sm">{task.rawMessage?.phone || "—"}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{task.assignedTo?.name || "—"}</div>
                          <div className="text-xs text-white/50">{task.assignedTo?.email || "—"}</div>
                        </td>
                        <td className="px-3 py-2">{fmtDate(task.startTime)}</td>
                        <td className="px-3 py-2">{fmtDate(task.endTime)}</td>
                        <td className="px-3 py-2 font-mono">{formatDuration(task.durationSec)}</td>
                        <td className="px-3 py-2">
                          <Badge tone="success">{task.disposition || "—"}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-sm">{task.sfCaseNumber || "—"}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Agent Progress                                                             */
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
      const res = await fetch("/api/manager/dashboard/agent-progress", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.agentProgress) {
        setRows(data.agentProgress as AgentProgress[]);
      }
    } catch (error) {
      console.error("Error loading agent progress:", error);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (open) load(); }, [open]);

  async function openDrawer(agent: AgentProgress) {
    setDrawerAgent(agent);
    setDrawerTasks([]); setDrawerLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("agentId", agent.id);
      params.set("status", "in_progress");
      params.set("take", "50");
      params.set("skip", "0");
      const res = await fetch(`/api/manager/tasks?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.items)) setDrawerTasks(data.items as Task[]);
    } finally { setDrawerLoading(false); }
  }

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
              {rows.length === 0 && (
                <tr><td className="px-3 py-3 text-white/60" colSpan={7}>{loading ? "Loading…" : "No agents yet."}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="text-white/90">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name || r.email}</div>
                    <div className="text-xs text-white/50">{r.email}</div>
                    {(r as any).isLive && <div className="text-xs text-green-400">● Live</div>}
                  </td>
                  <td className="px-3 py-2"><Badge tone="muted">{r.assigned}</Badge></td>
                  <td className="px-3 py-2"><Badge tone="warning">{r.inProgress}</Badge></td>
                  <td className="px-3 py-2"><Badge tone="success">{r.completedToday}</Badge></td>
                  <td className="px-3 py-2">
                    {r.taskTypeBreakdown ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-blue-400">💬</span>
                          <span>Text: {r.taskTypeBreakdown.textClub.assigned}</span>
                          <span className="text-white/40">•</span>
                          <span>WOD: {r.taskTypeBreakdown.wodIvcs.assigned}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-green-400">📧</span>
                          <span>Email: {r.taskTypeBreakdown.emailRequests.assigned}</span>
                          <span className="text-white/40">•</span>
                          <span>Refund: {r.taskTypeBreakdown.standaloneRefunds.assigned}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{fmtDate(r.lastActivity || null)}</td>
                  <td className="px-3 py-2"><SmallButton onClick={() => openDrawer(r)}>Open</SmallButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {drawerAgent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setDrawerAgent(null)}>
          <div
            className="absolute right-0 top-0 h-full w-full max-w-lg bg-neutral-900 border-l border-white/10 p-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-white/90 font-semibold">In Progress — {drawerAgent.name || drawerAgent.email}</div>
                <div className="text-white/50 text-sm">{drawerAgent.email}</div>
              </div>
              <SmallButton onClick={() => setDrawerAgent(null)}>Close</SmallButton>
            </div>

            {drawerLoading ? (
              <div className="text-white/60">Loading…</div>
            ) : drawerTasks.length === 0 ? (
              <div className="text-white/60">No active tasks.</div>
            ) : (
              <div className="space-y-2">
                {drawerTasks.map((t) => (
                  <div key={t.id} className="rounded-lg bg-white/[0.03] ring-1 ring-white/10 p-3">
                    <div className="text-xs text-white/50 mb-1">
                      <span className="mr-2"><Badge tone="muted">{t.brand || "—"}</Badge></span>
                      <span>Created: {fmtDate(t.createdAt)}</span>
                    </div>
                    <div className="text-sm text-white/90">{t.text || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Spam Archive (kept)                                                        */
/* ========================================================================== */
function SpamArchiveSection() {
  const PAGE_SIZE = 50;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SpamArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [cacheByPage, setCacheByPage] = useState<Record<number, SpamArchiveItem[]>>({});
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  function reset() { setItems([]); setTotal(0); setPage(1); setCacheByPage({}); }
  useEffect(() => { if (open) { reset(); fetchPage(1); } }, [open]);

  async function fetchPage(targetPage: number) {
    setLoading(true);
    try {
      if (cacheByPage[targetPage]) { setItems(cacheByPage[targetPage]); setPage(targetPage); return; }
      const params = new URLSearchParams();
      params.set("take", String(PAGE_SIZE));
      params.set("skip", String((targetPage - 1) * PAGE_SIZE));
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/manager/spam/archive?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return;
      const rows: SpamArchiveItem[] = Array.isArray(data.items) ? data.items : [];
      const serverTotal: number = typeof data.total === "number" ? data.total : rows.length;

      setCacheByPage((prev) => ({ ...prev, [targetPage]: rows }));
      setItems(rows); setTotal(serverTotal); setPage(targetPage);
    } finally { setLoading(false); }
  }

  async function onSearch() { reset(); await fetchPage(1); }
  const onPrev = () => page > 1 && fetchPage(page - 1);
  const onNext = () => page < totalPages && fetchPage(page + 1);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>🗄️ Spam Archive</H2>
        <div className="flex items-center gap-2">
          <div className="text-sm text-white/60">{open ? `${total} total` : ""}</div>
          <SmallButton onClick={() => setOpen((s) => !s)}>{open ? "Hide" : "Show"}</SmallButton>
        </div>
      </div>

      {!open ? null : (
        <>
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search brand / text…"
              className="w-full md:max-w-sm rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
            <SmallButton onClick={onSearch} disabled={loading}>
              {loading ? "Loading…" : "Search"}
            </SmallButton>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm rounded-xl overflow-hidden">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-white/60">
                  <th className="px-3 py-2 w-32">Brand</th>
                  <th className="px-3 py-2">Text</th>
                  <th className="px-3 py-2 w-44">Archived</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.length === 0 && (
                  <tr><td className="px-3 py-3 text-white/60" colSpan={3}>{loading ? "Loading…" : "No archived items."}</td></tr>
                )}
                {items.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className="text-white/90 align-top">
                    <td className="px-3 py-2">{row.brand || "—"}</td>
                    <td className="px-3 py-2">
                      <Bubble><div className="line-clamp-3">{row.text || "—"}</div></Bubble>
                    </td>
                    <td className="px-3 py-2">{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">Page {page} of {totalPages} · Showing {items.length} of {total}</div>
            <div className="flex items-center gap-2">
              <SmallButton onClick={() => onPrev()} disabled={loading || page <= 1}>Prev</SmallButton>
              
              {/* Page Selection Dropdown */}
              <select
                value={page}
                onChange={(e) => fetchPage(Number(e.target.value))}
                disabled={loading || totalPages <= 1}
                className="border-none rounded-lg px-2 py-1 bg-white/10 text-white text-xs ring-1 ring-white/10 focus:outline-none min-w-[60px]"
                title="Jump to page"
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <option key={pageNum} value={pageNum}>
                    {pageNum}
                  </option>
                ))}
              </select>
              
              <SmallButton onClick={() => onNext()} disabled={loading || page >= totalPages}>Next</SmallButton>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ========================================================================== */
/*  Spam Rules + Bulk Import                                                  */
/* ========================================================================== */
function RulesSection() {
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [pattern, setPattern] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [showList, setShowList] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/spam", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) setRules(data.rules as Rule[]);
    } finally { setLoading(false); }
  }
  React.useEffect(() => { load(); }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => r.pattern.toLowerCase().includes(q));
  }, [rules, query]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    const text = pattern.trim();
    if (!text) return;
    setCreating(true);
    try {
      const res = await fetch("/api/spam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: text }),
      });
      const data = await res.json();
      if (data?.success) {
        setPattern("");
        await load();
        setShowList(true);
      } else { alert(data?.error || "Failed to create rule"); }
    } finally { setCreating(false); }
  }

  async function toggle(rule: Rule, next: boolean) {
    setSavingId(rule.id);
    try {
      const res = await fetch("/api/spam/toggle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) alert(data?.error || "Failed to toggle");
      else setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)));
    } finally { setSavingId(null); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule?")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/spam", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) alert(data?.error || "Failed to delete");
      else setRules((prev) => prev.filter((r) => r.id !== id));
    } finally { setDeletingId(null); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <H2>🛡️ Spam Rules</H2>
        <div className="flex items-center gap-2 text-white/60">
          {loading ? "Loading…" : `${rules.length} total`}
          <SmallButton onClick={() => setShowList((s) => !s)}>
            {showList ? "Hide rules" : `Show rules (${rules.length})`}
          </SmallButton>
        </div>
      </div>

      <form onSubmit={createRule} className="flex flex-col md:flex-row gap-2">
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder='Add a new phrase… (e.g., "unsubscribe")'
          className="w-full rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <PrimaryButton disabled={creating || !pattern.trim()}>
          {creating ? "Adding…" : "Add Rule"}
        </PrimaryButton>
      </form>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rules…"
          className="w-full md:max-w-sm rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
      </div>

      {showList && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm rounded-xl overflow-hidden">
            <thead className="bg-white/[0.04]">
              <tr className="text-left text-white/60">
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2 w-28">Enabled</th>
                <th className="px-3 py-2 w-48">Created</th>
                <th className="px-3 py-2 w-20">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 && (
                <tr><td className="px-3 py-3 text-white/60" colSpan={4}>{loading ? "Loading rules…" : "No rules found."}</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="text-white/90">
                  <td className="px-3 py-2">{r.pattern}</td>
                  <td className="px-3 py-2">
                    <SmallButton onClick={() => toggle(r, !r.enabled)} disabled={savingId === r.id}>
                      {savingId === r.id ? "Saving…" : r.enabled ? "On" : "Off"}
                    </SmallButton>
                  </td>
                  <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <SmallButton onClick={() => remove(r.id)} disabled={deletingId === r.id} title="Delete rule">
                      {deletingId === r.id ? "…" : "🗑️"}
                    </SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SpamImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    const data = new FormData(); data.append("file", file);
    try {
      const res = await fetch("/api/spam/import", { method: "POST", body: data });
      const json = await res.json();
      setMsg(json?.success
        ? `Read ${json.totalRead} • Inserted ${json.inserted} • Skipped existing ${json.skippedExisting} • Skipped blank ${json.skippedBlank}`
        : json?.error || "Import failed");
    } catch { setMsg("Import failed"); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5 space-y-4">
      <H2>📚 Bulk Import Spam Phrases</H2>
      <p className="text-sm text-white/60">
        Upload a CSV: one phrase per line, or headers <code>pattern</code>/<code>phrase</code> with optional <code>enabled</code>.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="max-w-md text-sm file:mr-3 file:rounded-md file:bg-white/10 file:text-white file:px-3 file:py-1.5 file:border-0 file:hover:bg-white/20"
        />
        <div className="flex items-center gap-2">
          <PrimaryButton disabled={busy || !file}>{busy ? "Importing…" : "Import Phrases"}</PrimaryButton>
          {msg && <span className="text-sm text-white/70">{msg}</span>}
        </div>
      </form>
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

/* ========================================================================== */
/*  PAGE                                                                       */
/* ========================================================================== */
export default function ManagerPage() {
  // SECURITY: Middleware handles auth - client-side guard removed to prevent login loops
  // The middleware already verifies JWT and role, which is sufficient protection
  
  // Auto-logout functionality
  const {
    timeLeft,
    showWarning,
    extendSession,
    formatTime
  } = useAutoLogout({
    timeoutMinutes: 120, // 2 hours
    warningMinutes: 5,   // 5 minutes warning
    onLogout: () => {
      localStorage.removeItem('currentRole');
      fetch('/api/auth/logout', { method: 'Post' });
      window.location.href = '/login';
    }
  });

  // Navigation state
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [showPendingTasks, setShowPendingTasks] = useState(true);
  
  // Summary counters
  const [pending, setPending] = useState<number | null>(null);
  const [spamReview, setSpamReview] = useState<number | null>(null);
  const [completed, setCompleted] = useState<number | null>(null);
  const [completedToday, setCompletedToday] = useState<number | null>(null);
  const [inProgress, setInProgress] = useState<number | null>(null);
  const [assistanceRequired, setAssistanceRequired] = useState<number | null>(null);
  const [pctDone, setPctDone] = useState<number | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

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
  }>>([]);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);

  // Agents (for Assign block at end)
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agentWorkloads, setAgentWorkloads] = useState<Record<string, any>>({});

  const [perAgent, setPerAgent] = useState<number>(50);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const allSelected = useMemo(
    () => agents.length > 0 && selectedAgents.length === agents.length,
    [agents.length, selectedAgents.length]
  );

    async function loadSummary() {
    setLoadingSummary(true);
    try {
      const response = await fetch("/api/manager/dashboard/metrics", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const metrics = data.metrics;
          setPending(metrics.pending);
          setSpamReview(metrics.spamReview);
          setCompleted(metrics.totalCompleted);
          setCompletedToday(metrics.completedToday);
          setInProgress(metrics.inProgress);
          setAssistanceRequired(metrics.assistanceRequired);
          setPctDone(metrics.pctDone);
        }
      }
    } catch (error) {
      console.error("Error loading summary:", error);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadAssistanceRequests() {
    try {
      console.log("🔍 Loading assistance requests...");
      const response = await fetch("/api/manager/assistance", { cache: "no-store" });
      console.log("🔍 Assistance API response status:", response.status);
      
      // Use response validator to handle all response types gracefully
      const { validateAndParseResponse } = await import("@/lib/self-healing/response-validator");
      const data = await validateAndParseResponse(response, {
        fallbackError: 'Unable to load assistance requests'
      });
      
      if (data.success) {
        console.log("🔍 Assistance API data:", data);
        // Filter out HOLDS tasks - they should only appear in Holds dashboard
        const filteredRequests = (data.requests || []).filter((req: any) => req.taskType !== 'HOLDS');
        const newRequests = filteredRequests;
        console.log("🔍 New requests count (excluding HOLDS):", newRequests.length);
        
        // Check for new requests
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
        // Handle error response (already parsed by validator)
        console.error("🔍 Assistance API error:", data.error || 'Unknown error');
        
        // Auto-retry if retryAfter is provided
        if (data.retryAfter) {
          console.log(`[SELF-HEAL] Auto-retrying assistance requests in ${data.retryAfter} seconds`);
          setTimeout(() => {
            loadAssistanceRequests();
          }, data.retryAfter * 1000);
        }
      }
    } catch (error) {
      console.error("Error loading assistance requests:", error);
      
      // Auto-retry on network errors
      console.log("[SELF-HEAL] Network error, retrying in 5 seconds");
      setTimeout(() => {
        loadAssistanceRequests();
      }, 5000);
    }
  }

  async function loadAgents() {
    try {
      setAgentsLoading(true);
      // Filter to only show TEXT_CLUB agents (exclude Holds-only agents)
      const res = await fetch("/api/manager/agents?filter=TEXT_CLUB", { cache: "no-store" });
      const data = await res.json();
      if (data?.success && Array.isArray(data.agents)) {
        setAgents(data.agents as Agent[]);
        setSelectedAgents((prev) => prev.filter((e) => data.agents.some((a: Agent) => a.email === e)));
      }
    } finally { setAgentsLoading(false); }
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

  const toggleSelectAll = () => setSelectedAgents(allSelected ? [] : agents.map((a) => a.email));

    // --- Helper: fetch oldest unassigned pending task IDs and raw message IDs up to a limit ---
  async function fetchUnassignedIds(limit: number): Promise<{ taskIds: string[], rawMessageIds: string[], needsPromotion: boolean }> {
    try {
      console.log(`[DEBUG] Fetching unassigned items with limit=${limit}`);
      
      // Use the new endpoint that returns both Task IDs and RawMessage IDs
      // Default to TEXT_CLUB since this is the Text Club dashboard
      const res = await fetch(`/api/manager/tasks/unassigned?limit=${limit}&taskType=TEXT_CLUB`, { 
        method: "GET",
        cache: "no-store" 
      });
      
      console.log(`[DEBUG] Response status:`, res.status);
      
      const data = await res.json().catch(() => null);
      console.log(`[DEBUG] Response data:`, data);
      
      if (data?.success) {
        const taskIds = Array.isArray(data?.taskIds) ? data.taskIds : [];
        const rawMessageIds = Array.isArray(data?.rawMessageIds) ? data.rawMessageIds : [];
        const needsPromotion = Boolean(data?.needsPromotion);
        
        console.log(`[DEBUG] Successfully fetched ${taskIds.length} task IDs and ${rawMessageIds.length} raw message IDs`);
        return { taskIds, rawMessageIds, needsPromotion };
      }
      
      console.warn("Failed to fetch unassigned items:", data);
      return { taskIds: [], rawMessageIds: [], needsPromotion: false };
    } catch (error) {
      console.error("Error fetching unassigned items:", error);
      return { taskIds: [], rawMessageIds: [], needsPromotion: false };
    }
  }

  // --- Helper: assign a batch of ids to one agent (uses existing API you already use row-by-row) ---
  async function assignBatch(ids: string[], agentId: string) {
    if (ids.length === 0) return { success: true };
    const res = await fetch("/api/manager/tasks/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, agentId, taskType: "TEXT_CLUB" }),
    });
    return res.json().catch(() => ({ success: false, error: "Assign failed" }));
  }

  // --- Helper: assign raw messages to one agent (promotes and assigns) ---
  async function assignRawMessages(rawMessageIds: string[], agentId: string) {
    if (rawMessageIds.length === 0) return { success: true };
    const res = await fetch("/api/manager/tasks/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawMessageIds, agentId, taskType: "TEXT_CLUB" }),
    });
    return res.json().catch(() => ({ success: false, error: "Assign failed" }));
  }

  async function doAssign() {
    try {
      setAssignLoading(true);
      setAssignMsg(null);

      // map selected agent emails -> agent objects (need ids for the assign API)
      const chosen = agents.filter(a => selectedAgents.includes(a.email));
      if (chosen.length === 0) {
        setAssignMsg("Pick at least one agent.");
        return;
      }

      // Pull a pool of candidate tasks = sum of per-agent caps (we’ll round-robin them)
      const totalNeed = chosen.length * Math.max(1, perAgent);
      const unassignedItems = await fetchUnassignedIds(totalNeed);

      if (unassignedItems.taskIds.length === 0 && unassignedItems.rawMessageIds.length === 0) {
        setAssignMsg("Assigned ✅ no tasks");
        return;
      }

      // Round-robin → build a plan per agent (respect perAgent cap)
      const perAgentIds: Record<string, string[]> = {};
      for (const a of chosen) perAgentIds[a.id] = [];

      let i = 0;
      // Combine task IDs and raw message IDs for assignment
      const allIds = [...unassignedItems.taskIds, ...unassignedItems.rawMessageIds];
      
      outer: for (const t of allIds) {
        // advance to next agent that still has capacity
        for (let hop = 0; hop < chosen.length; hop++) {
          const ag = chosen[(i + hop) % chosen.length];
          if (perAgentIds[ag.id].length < perAgent) {
            perAgentIds[ag.id].push(t);
            i = (i + hop + 1) % chosen.length; // next time, start after the one we just used
            continue outer;
          }
        }
        // if we got here, everyone is at cap — stop early
        break;
      }

      // Persist in batches of ~50 per agent to keep payloads small
      const BATCH = 50;
      const results: Array<{ email: string; count: number }> = [];

      for (const ag of chosen) {
        const list = perAgentIds[ag.id];
        if (!list || list.length === 0) { results.push({ email: ag.email, count: 0 }); continue; }

        // Separate task IDs from raw message IDs
        const taskIds = list.filter(id => unassignedItems.taskIds.includes(id));
        const rawMessageIds = list.filter(id => unassignedItems.rawMessageIds.includes(id));

        // Assign existing tasks first
        if (taskIds.length > 0) {
          for (let p = 0; p < taskIds.length; p += BATCH) {
            const slice = taskIds.slice(p, p + BATCH);
            const r = await assignBatch(slice, ag.id);
            if (!r?.success) {
              setAssignMsg(r?.error || "Assign failed.");
              return;
            }
          }
        }

        // Assign raw messages (promote and assign)
        if (rawMessageIds.length > 0) {
          for (let p = 0; p < rawMessageIds.length; p += BATCH) {
            const slice = rawMessageIds.slice(p, p + BATCH);
            const r = await assignRawMessages(slice, ag.id);
            if (!r?.success) {
              setAssignMsg(r?.error || "Assign failed.");
              return;
            }
          }
        }

        results.push({ email: ag.email, count: list.length });
      }

      // UI feedback + refresh counters/agents
      const totals = results.map(r => `${r.email}: ${r.count}`).join(" • ");
      setAssignMsg(`Assigned ✅  ${totals}`);
      await loadSummary();
      await loadAgents();
      await loadAgentWorkloads();
    } catch (e) {
      setAssignMsg("Assign failed.");
    } finally {
      setAssignLoading(false);
    }
  }

  useEffect(() => { 
    loadSummary(); 
    loadAgents(); 
    loadAgentWorkloads();
    loadAssistanceRequests();
    
    // Auto-refresh dashboard metrics and assistance requests every 30 seconds
    const interval = setInterval(() => {
      loadSummary();
      loadAssistanceRequests();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Check if user needs to change password
  useEffect(() => {
    const checkPasswordChange = async () => {
      try {
        const response = await fetch('/api/auth/check-password-change', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.mustChangePassword) {
            setShowPasswordModal(true);
          }
        }
      } catch (error) {
        console.error('Error checking password change status:', error);
      }
    };
    
    const getCurrentUserRole = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setCurrentUserRole(data.user?.role || null);
        }
      } catch (error) {
        console.error('Error getting current user role:', error);
      }
    };
    
    checkPasswordChange();
    getCurrentUserRole();
  }, []);

  const totalAll = (pending ?? 0) + (spamReview ?? 0) + (completed ?? 0) + (inProgress ?? 0) + (assistanceRequired ?? 0);

  const navigationItems = [
    { id: "overview", label: "📊 Overview", description: "Dashboard metrics and progress" },
    { id: "tasks", label: "📋 Task Management", description: "Import, assign, and manage tasks" },
    { id: "assistance", label: "🆘 Assistance Requests", description: "Respond to agent assistance requests", badge: assistanceRequests.filter(r => r.status === "ASSISTANCE_REQUIRED").length },
    { id: "agents", label: "👥 Agent Management", description: "Monitor agent progress and performance" },
    { id: "analytics", label: "📈 Analytics", description: "Text Club specific analytics and insights" },
    { id: "team-analytics", label: "📊 Team Analytics", description: "Team-wide performance and task insights", external: true, href: "/analytics" }
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
              <h1 className="text-3xl font-semibold tracking-tight">Text Club Dashboard</h1>
              <p className="text-sm text-white/60">Text Club Task Management & Analytics</p>
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
            
            {/* Session Timer */}
            <SessionTimer 
              timeLeft={timeLeft} 
              onExtend={extendSession} 
            />
            
            {/* Switch to Agent Button (only if user has MANAGER_AGENT role) */}
            {currentUserRole === 'MANAGER_AGENT' && (
              <button
                onClick={async () => {
                  try {
                    // Get current user's email from the auth endpoint
                    const response = await fetch('/api/auth/me', { cache: 'no-store' });
                    if (response.ok) {
                      const data = await response.json();
                      if (data.success && data.user?.email) {
                        // Store current role and email, then switch to agent
                        localStorage.setItem('currentRole', 'MANAGER');
                        localStorage.setItem('agentEmail', data.user.email);
                        window.location.href = '/agent';
                      }
                    }
                  } catch (error) {
                    console.error('Error getting user email:', error);
                    // Fallback: just switch to agent
                    localStorage.setItem('currentRole', 'MANAGER');
                    window.location.href = '/agent';
                  }
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Switch to Agent
              </button>
            )}
            
            {/* Logout Button */}
            <button
              onClick={() => {
                localStorage.removeItem('currentRole');
                fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
          </div>
          
          {/* Navigation */}
          <nav className="mt-4 flex flex-wrap gap-2">
          {navigationItems.map((item) => {
            if (item.external && item.href) {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors relative bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                  title={item.description}
                >
                  {item.label}
                  {(item as any).badge && (item as any).badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                      {(item as any).badge}
                    </span>
                  )}
                </a>
              );
            }
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                  activeSection === item.id
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                }`}
                title={item.description}
              >
                {item.label}
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        
        {/* Dashboard Switcher */}
        <DashboardSwitcher />
        </div>
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

      <div className="mt-6 space-y-8">

      {/* Overview Section */}
      {activeSection === "overview" && (
        <div className="space-y-8">
          {/* Live Dashboard Metrics */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/60">Overall Progress</div>
                <Badge tone="muted">{pctDone ?? "…"}% done</Badge>
              </div>
              <ProgressBar value={pctDone ?? 0} />
              <div className="text-xs text-white/50">
                Pending {pending ?? "…"} • Spam Review {spamReview ?? "…"} • Completed {completed ?? "…"}
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-white/60">Queue Health</div>
                <div className="text-3xl font-bold mt-1">{pending ?? "…"}</div>
                <div className="text-xs text-white/50">Ready to assign</div>
              </div>
              <Donut percent={clamp(Math.round(((spamReview ?? 0) / Math.max(1, totalAll)) * 100))} label="Spam review share" />
            </Card>

            <Card className="p-4">
              <div className="text-sm text-white/60">Completed Today</div>
              <div className="text-3xl font-bold mt-1">{completedToday ?? "…"}</div>
              <div className="text-xs text-white/50 mt-1">Keep it rolling ✨</div>
            </Card>

            <Card className="p-4">
              <div className="text-sm text-white/60">Active Work</div>
              <div className="text-3xl font-bold mt-1">{inProgress ?? "…"}</div>
              <div className="text-xs text-white/50 mt-1">
                In Progress • {assistanceRequired ?? "…"} Need Help
              </div>
            </Card>
          </section>

          {/* Live Agent Status Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <H2>Live Agent Status</H2>
              <button
                onClick={loadAgents}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const isLive = agent.isLive;
                const lastSeen = agent.lastSeen ? new Date(agent.lastSeen) : null;
                const now = new Date();
                const timeDiff = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60)) : null;
                
                let status = "🔴 Inactive";
                let statusColor = "text-red-400";
                
                if (isLive && timeDiff !== null) {
                  if (timeDiff <= 15) {
                    status = "🟢 Live";
                    statusColor = "text-green-400";
                  } else if (timeDiff <= 30) {
                    status = "🟡 Away";
                    statusColor = "text-yellow-400";
                  }
                }
                
                return (
                  <Card key={agent.id} className="p-4 border border-neutral-700">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-white">{agent.name || agent.email}</h3>
                      <span className={`text-sm font-medium ${statusColor}`}>{status}</span>
                    </div>
                    <div className="text-sm text-white/60 space-y-1">
                      <p>Email: {agent.email}</p>
                      {lastSeen && (
                        <p>Last seen: {lastSeen.toLocaleString()}</p>
                      )}
                      {timeDiff !== null && (
                        <p className="text-xs">
                          {timeDiff <= 1 ? "Just now" : 
                           timeDiff <= 15 ? `${timeDiff} min ago` : 
                           timeDiff <= 30 ? `${timeDiff} min ago` : 
                           `${Math.floor(timeDiff / 60)}h ${timeDiff % 60}m ago`}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Task Management Section */}
      {activeSection === "tasks" && (
        <div className="space-y-8">

      {/* ORDER: Import → Assign → Pending → Spam (Preview/Capture) → Spam Review → Agent Progress → Completed Work → Users/Admin → Agents → Rules → Bulk Phrases */}
      <ImportSection />
      {/* Assign block moved up */}
      <Card className="p-5 space-y-4">
        <H2>🎯 Assign Tasks</H2>

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
              value={perAgent}
              onChange={(e) => setPerAgent(Number(e.target.value || 0))}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
            <div className="text-xs text-white/50 mt-1">Absolute hard cap is 200 per agent.</div>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <PrimaryButton onClick={doAssign} disabled={assignLoading || selectedAgents.length === 0 || perAgent <= 0}>
            {assignLoading ? "Assigning…" : "Assign Now"}
          </PrimaryButton>
          {assignMsg && <span className="text-sm text-white/70">{assignMsg}</span>}
        </div>
      </Card>

      {/* Pending Tasks Section with Hide/Unhide Toggle */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <H2>📋 Pending Tasks</H2>
          <button
            onClick={() => setShowPendingTasks(!showPendingTasks)}
            className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded-lg text-white/80 transition-colors"
          >
            {showPendingTasks ? '👁️ Hide' : '👁️ Show'}
          </button>
        </div>
        {showPendingTasks && <PendingTasksSection onTasksMutated={loadAgents} />}
      </Card>
          <SpamPreviewCaptureSection />
          <SpamReviewSection
            onChangedCounts={(deltaReady, deltaSpam) => {
              setPending((p) => (p ?? 0) + deltaReady);
              setSpamReview((s) => (s ?? 0) + deltaSpam);
            }}
          />
        </div>
      )}

      {/* Assistance Requests Section */}
      {activeSection === "assistance" && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">🆘 Assistance Requests</h2>
            <button
              onClick={loadAssistanceRequests}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
          <AssistanceRequestsSection 
            requests={assistanceRequests} 
            onRequestsChange={setAssistanceRequests} 
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
          <CompletedWorkDashboard />
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
          // Refresh the page to update the JWT token
          window.location.reload();
        }}
      />

      {/* Auto-Logout Warning Modal */}
      <AutoLogoutWarning
        isOpen={showWarning}
        timeLeft={timeLeft}
        onExtend={extendSession}
        onLogout={() => {
          localStorage.removeItem('currentRole');
          fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }}
      />
    </main>
  );
}