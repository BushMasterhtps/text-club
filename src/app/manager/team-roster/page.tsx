"use client";

import React, { useCallback, useEffect, useState } from "react";
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

export default function TeamRosterPage() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<TeamRosterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

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
            <p className="text-sm text-white/55 mt-2 max-w-3xl">
              Read-only overview of agent roster fields: identity, org team label, QA settings,
              productivity eligibility, and work queues. Editing will be added in a later release.
            </p>
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
                    <th colSpan={1} className={groupHead}>
                      Team / supervisor
                    </th>
                    <th colSpan={3} className={groupHead}>
                      QA
                    </th>
                    <th colSpan={2} className={groupHead}>
                      Productivity
                    </th>
                    <th colSpan={1} className={`${groupHead} pr-3`}>
                      Work queues
                    </th>
                  </tr>
                  <tr className="bg-black/40 text-left text-[11px] uppercase tracking-wide text-white/45 border-b border-white/10">
                    <th className="px-3 py-2 border-l border-white/5 first:border-l-0">Agent</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Live</th>
                    <th className="px-3 py-2 border-l border-white/10">Roster team</th>
                    <th className="px-3 py-2 border-l border-white/10">Tracked</th>
                    <th className="px-3 py-2">QA team</th>
                    <th className="px-3 py-2 min-w-[8rem]">QA note</th>
                    <th className="px-3 py-2 border-l border-white/10">Eligible</th>
                    <th className="px-3 py-2 min-w-[8rem]">Productivity note</th>
                    <th className="px-3 py-2 border-l border-white/10 pr-3 min-w-[12rem]">
                      Capabilities
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-white/45">
                        Loading…
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-white/45">
                        No matching users.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.03] align-top">
                        <td className="px-3 py-2 border-l border-white/5">
                          <div className="font-medium">{u.name || u.email}</div>
                        </td>
                        <td className="px-3 py-2 text-white/70 text-xs">{u.email}</td>
                        <td className="px-3 py-2 text-xs text-white/50 whitespace-nowrap">{u.role}</td>
                        <td className="px-3 py-2 text-xs">{u.isLive ? "Yes" : "No"}</td>
                        <td className="px-3 py-2 border-l border-white/10 text-white/80 max-w-[10rem] truncate" title={u.rosterTeam ?? ""}>
                          {u.rosterTeam ?? "—"}
                        </td>
                        <td className="px-3 py-2 border-l border-white/10 text-xs">{u.qaIsTracked ? "Yes" : "No"}</td>
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
                        <td className="px-3 py-2 border-l border-white/10 text-xs text-white/70 pr-3">
                          {formatQueues(u.agentTypes ?? [])}
                        </td>
                      </tr>
                    ))
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
