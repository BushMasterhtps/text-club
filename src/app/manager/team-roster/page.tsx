"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/app/_components/DashboardLayout";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";

type TeamRosterUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isLive: boolean;
  rosterTeam: string | null;
  qaIsTracked: boolean;
  qaTeam: string | null;
  qaExemptReason: string | null;
  productivityEligible: boolean;
  productivityExemptReason: string | null;
  agentTypes: string[];
};

const ROSTER_TEAM_MAX = 120;

const QUEUE_LABELS: Record<string, string> = {
  TEXT_CLUB: "Text Club",
  HOLDS: "Holds",
  WOD_IVCS: "WOD/IVCS",
  EMAIL_REQUESTS: "Email",
  YOTPO: "Yotpo",
  STANDALONE_REFUNDS: "Refunds",
};

function formatQueues(types: string[]): string {
  if (!types?.length) return "—";
  return types
    .map((t) => QUEUE_LABELS[t] ?? t)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .join(", ");
}

function draftToStored(draft: string): string | null {
  const t = draft.trim();
  return t ? t : null;
}

function rosterDirty(draft: string | undefined, server: string | null): boolean {
  return draftToStored(draft ?? "") !== (server ?? null);
}

type RowFeedback = {
  state: "idle" | "saving" | "saved" | "error";
  message?: string;
};

export default function TeamRosterPage() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<TeamRosterUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const savedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSavedTimer = useCallback((userId: string) => {
    const t = savedTimers.current.get(userId);
    if (t) clearTimeout(t);
    savedTimers.current.delete(userId);
  }, []);

  const scheduleSavedClear = useCallback(
    (userId: string) => {
      clearSavedTimer(userId);
      const t = setTimeout(() => {
        setRowFeedback((prev) => {
          const cur = prev[userId];
          if (cur?.state !== "saved") return prev;
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        savedTimers.current.delete(userId);
      }, 2500);
      savedTimers.current.set(userId, t);
    },
    [clearSavedTimer]
  );

  useEffect(() => {
    return () => {
      for (const t of savedTimers.current.values()) clearTimeout(t);
      savedTimers.current.clear();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/manager/team-roster${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load roster");
      const list = json.data.users as TeamRosterUser[];
      setUsers(list);
      const d: Record<string, string> = {};
      for (const u of list) {
        d[u.id] = u.rosterTeam ?? "";
      }
      setDrafts(d);
      setRowFeedback({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (userId: string) => {
    const draft = drafts[userId];
    if (draft === undefined) return;
    const serverUser = users.find((u) => u.id === userId);
    if (!serverUser || !rosterDirty(draft, serverUser.rosterTeam)) return;

    clearSavedTimer(userId);
    setRowFeedback((prev) => ({
      ...prev,
      [userId]: { state: "saving" },
    }));

    try {
      const res = await fetch("/api/manager/team-roster", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          rosterTeam: draftToStored(draft),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");

      const updated = json.data.user as TeamRosterUser;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setDrafts((prev) => ({ ...prev, [userId]: updated.rosterTeam ?? "" }));
      setRowFeedback((prev) => ({
        ...prev,
        [userId]: { state: "saved" },
      }));
      scheduleSavedClear(userId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setRowFeedback((prev) => ({
        ...prev,
        [userId]: { state: "error", message: msg },
      }));
    }
  };

  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <Link
        href="/manager/quality-review/roster"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        QA roster
      </Link>
      <Link
        href="/manager"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        Manager
      </Link>
    </>
  );

  const groupHead =
    "bg-black/50 text-[10px] uppercase tracking-wider text-white/50 text-center font-semibold border-b border-white/10 border-l border-white/10 first:border-l-0";

  return (
    <DashboardNavigationProvider>
      <DashboardLayout headerActions={headerActions}>
        <AutoLogoutWarning
          isOpen={showWarning}
          timeLeft={timeLeft}
          onExtend={extendSession}
          onLogout={() => {
            localStorage.removeItem("currentRole");
            void fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        />
        <div className="max-w-[min(100vw-2rem,90rem)] mx-auto space-y-6 text-white pb-16 px-4">
          <header className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300/90 mb-2">
              Manager tools
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Team Roster Configuration</h1>
            <p className="text-sm text-white/55 mt-2 max-w-4xl">
              Use this page to edit each agent&apos;s <span className="text-white/75">Roster team</span> label.
              Everything else in the table is read-only for now (change QA fields on QA roster; change queues in
              Settings).
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-xs text-white/50 max-w-4xl leading-relaxed border-t border-white/10 pt-4">
              <div>
                <dt className="font-medium text-white/65">Roster Team</dt>
                <dd className="mt-0.5">
                  Neutral org / supervisor grouping. Editable here. Not used for QA dashboard filters yet.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-white/65">QA Team</dt>
                <dd className="mt-0.5">
                  Current QA dashboard grouping and filters. Unchanged for now; edit on the QA roster page.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-white/65">Productivity · Eligible</dt>
                <dd className="mt-0.5">
                  Controls whether the user is included in manager productivity scorecard and sprint-ranking
                  subject lists (same rules as before).
                </dd>
              </div>
              <div>
                <dt className="font-medium text-white/65">Work queues · Capabilities</dt>
                <dd className="mt-0.5">
                  Reflects the same specialization flags as the manager task queues. Managed today from{" "}
                  <Link href="/manager" className="text-emerald-300/90 underline hover:text-emerald-200/90">
                    Manager → Settings → Agent Specializations
                  </Link>
                  .
                </dd>
              </div>
            </dl>
          </header>

          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-white/50 block flex-1 min-w-[14rem]">
              Search
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name or email…"
                className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th colSpan={4} className={`${groupHead} pl-3 text-left`}>
                      Identity
                    </th>
                    <th colSpan={2} className={groupHead}>
                      Team / supervisor
                    </th>
                    <th colSpan={3} className={groupHead}>
                      QA
                    </th>
                    <th colSpan={2} className={groupHead}>
                      Productivity
                    </th>
                    <th colSpan={1} className={`${groupHead} pr-3 py-2 align-bottom`}>
                      <div className="flex flex-col items-center gap-1">
                        <span>Work queues</span>
                        <span className="max-w-[14rem] font-normal normal-case tracking-normal text-[10px] leading-snug text-white/40">
                          Capabilities:{" "}
                          <Link
                            href="/manager"
                            className="text-emerald-300/85 underline hover:text-emerald-200/90"
                          >
                            Settings → Agent Specializations
                          </Link>
                        </span>
                      </div>
                    </th>
                  </tr>
                  <tr className="bg-black/40 text-left text-[11px] uppercase tracking-wide text-white/45 border-b border-white/10">
                    <th className="px-3 py-2 border-l border-white/5 first:border-l-0">Agent</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Live</th>
                    <th className="px-3 py-2 border-l border-white/10 min-w-[18rem] w-[min(22rem,28vw)]">
                      Roster team
                    </th>
                    <th className="px-3 py-2 w-[5.5rem]">Save</th>
                    <th className="px-3 py-2 border-l border-white/10">Tracked</th>
                    <th className="px-3 py-2">QA team</th>
                    <th className="px-3 py-2 min-w-[8rem]">QA note</th>
                    <th className="px-3 py-2 border-l border-white/10">Eligible</th>
                    <th className="px-3 py-2 min-w-[8rem]">Productivity note</th>
                    <th className="px-3 py-2 border-l border-white/10 pr-3 min-w-[14rem] max-w-[22rem]">
                      <span className="block">Capabilities</span>
                      <span className="mt-1 block font-normal normal-case tracking-normal text-[10px] leading-snug text-white/40">
                        Queue capabilities are currently managed in{" "}
                        <Link href="/manager" className="text-emerald-300/85 underline hover:text-emerald-200/90">
                          Settings → Agent Specializations
                        </Link>
                        .
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center text-white/45">
                        Loading…
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center text-white/45">
                        No matching users.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const draft = drafts[u.id];
                      const dirty = rosterDirty(draft, u.rosterTeam);
                      const fb = rowFeedback[u.id];
                      const saving = fb?.state === "saving";
                      const saved = fb?.state === "saved";
                      const err = fb?.state === "error";

                      return (
                        <tr key={u.id} className="hover:bg-white/[0.03] align-top">
                          <td className="px-3 py-2 border-l border-white/5">
                            <div className="font-medium">{u.name || u.email}</div>
                          </td>
                          <td className="px-3 py-2 text-white/70 text-xs">{u.email}</td>
                          <td className="px-3 py-2 text-xs text-white/50 whitespace-nowrap">{u.role}</td>
                          <td className="px-3 py-2 text-xs">{u.isLive ? "Yes" : "No"}</td>
                          <td className="px-3 py-2 border-l border-white/10 min-w-[18rem] w-[min(22rem,28vw)] align-top">
                            <input
                              value={draft ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value,
                                }))
                              }
                              maxLength={ROSTER_TEAM_MAX}
                              placeholder="e.g. Team Daniel, Social Media"
                              disabled={saving}
                              className="w-full min-h-[2.5rem] rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white/95 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                              aria-label={`Roster team for ${u.name || u.email}`}
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex flex-col gap-1 items-start">
                              <button
                                type="button"
                                disabled={!dirty || saving}
                                onClick={() => void save(u.id)}
                                className="text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-600/85 text-white disabled:opacity-35 disabled:pointer-events-none hover:bg-emerald-600"
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                              {saved && (
                                <span className="text-[10px] text-emerald-400/90">Saved</span>
                              )}
                              {err && fb?.message && (
                                <span className="text-[10px] text-red-300/95 max-w-[9rem] leading-tight">
                                  {fb.message}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-l border-white/10 text-xs">
                            {u.qaIsTracked ? "Yes" : "No"}
                          </td>
                          <td className="px-3 py-2 text-white/70 max-w-[8rem] truncate" title={u.qaTeam ?? ""}>
                            {u.qaTeam ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-white/55 max-w-[14rem]">
                            <span className="line-clamp-2" title={u.qaExemptReason ?? ""}>
                              {u.qaExemptReason?.trim() ? u.qaExemptReason : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 border-l border-white/10 text-xs">
                            {u.productivityEligible ? "Yes" : "No"}
                          </td>
                          <td className="px-3 py-2 text-xs text-white/55 max-w-[14rem]">
                            <span className="line-clamp-2" title={u.productivityExemptReason ?? ""}>
                              {u.productivityExemptReason?.trim() ? u.productivityExemptReason : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 border-l border-white/10 text-sm text-white/75 pr-3 min-w-[14rem] max-w-[22rem] whitespace-normal break-words">
                            {formatQueues(u.agentTypes ?? [])}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </DashboardNavigationProvider>
  );
}
