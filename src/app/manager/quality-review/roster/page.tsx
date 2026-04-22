"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/app/_components/DashboardLayout";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";

type RosterUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  qaIsTracked: boolean;
  qaTeam: string | null;
  qaExemptReason: string | null;
};

export default function QaRosterPage() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<RosterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { team: string; reason: string; tracked: boolean }>>(
    {}
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/manager/quality-review/roster${qs}`, { credentials: "include" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load roster");
      const list = json.data.users as RosterUser[];
      setUsers(list);
      const d: Record<string, { team: string; reason: string; tracked: boolean }> = {};
      for (const u of list) {
        d[u.id] = {
          tracked: u.qaIsTracked,
          team: u.qaTeam ?? "",
          reason: u.qaExemptReason ?? "",
        };
      }
      setDrafts(d);
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
    const d = drafts[userId];
    if (!d) return;
    setSavingId(userId);
    setError(null);
    try {
      const res = await fetch("/api/manager/quality-review/roster", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          qaIsTracked: d.tracked,
          qaTeam: d.team.trim() || null,
          qaExemptReason: d.reason.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <Link
        href="/manager/quality-review/dashboard"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        QA dashboard
      </Link>
      <Link
        href="/manager/quality-review"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        ← Quality Review
      </Link>
      <Link
        href="/manager"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        Manager
      </Link>
    </>
  );

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
        <div className="max-w-6xl mx-auto space-y-6 text-white pb-16 px-4">
          <header className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300/90 mb-2">
              Manager tools
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">QA roster</h1>
            <p className="text-sm text-white/55 mt-2 max-w-2xl">
              Control who appears on the coverage dashboard, optional team labels for filters, and
              internal notes. Exempt users are not counted toward sprint coverage targets.
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
                <thead className="bg-black/40 text-left text-[11px] uppercase tracking-wide text-white/45">
                  <tr>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Tracked</th>
                    <th className="px-3 py-2">QA team</th>
                    <th className="px-3 py-2 min-w-[12rem]">Note</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-white/45">
                        Loading…
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-white/45">
                        No matching users.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const d = drafts[u.id];
                      const dirty =
                        d &&
                        (d.tracked !== u.qaIsTracked ||
                          (d.team.trim() || "") !== (u.qaTeam ?? "") ||
                          (d.reason.trim() || "") !== (u.qaExemptReason ?? ""));
                      return (
                        <tr key={u.id} className="hover:bg-white/[0.03] align-top">
                          <td className="px-3 py-2">
                            <div className="font-medium">{u.name || u.email}</div>
                            <div className="text-[11px] text-white/40">{u.email}</div>
                            <div className="text-[10px] text-white/30 mt-0.5">{u.role}</div>
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={d?.tracked ?? u.qaIsTracked}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [u.id]: {
                                      team: prev[u.id]?.team ?? u.qaTeam ?? "",
                                      reason: prev[u.id]?.reason ?? u.qaExemptReason ?? "",
                                      tracked: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              <span className="text-white/60">QA tracked</span>
                            </label>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={d?.team ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    tracked: prev[u.id]?.tracked ?? u.qaIsTracked,
                                    reason: prev[u.id]?.reason ?? u.qaExemptReason ?? "",
                                    team: e.target.value,
                                  },
                                }))
                              }
                              placeholder="e.g. Team A"
                              className="w-full max-w-[10rem] rounded-lg bg-black/40 border border-white/15 px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <textarea
                              value={d?.reason ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    tracked: prev[u.id]?.tracked ?? u.qaIsTracked,
                                    team: prev[u.id]?.team ?? u.qaTeam ?? "",
                                    reason: e.target.value,
                                  },
                                }))
                              }
                              rows={2}
                              placeholder="Optional internal note"
                              className="w-full min-w-[12rem] rounded-lg bg-black/40 border border-white/15 px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={!dirty || savingId === u.id}
                              onClick={() => void save(u.id)}
                              className="text-xs font-semibold px-2 py-1 rounded-lg bg-violet-600/80 text-white disabled:opacity-35"
                            >
                              {savingId === u.id ? "…" : "Save"}
                            </button>
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
