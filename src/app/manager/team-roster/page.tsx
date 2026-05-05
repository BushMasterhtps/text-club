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
const QA_TEAM_MAX = 120;

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

function productivityNoteDirty(draft: string, server: string | null): boolean {
  return draftToStored(draft) !== draftToStored(server ?? "");
}

type RowDraft = {
  rosterTeam: string;
  qaIsTracked: boolean;
  qaTeam: string;
  qaExemptReason: string;
  productivityEligible: boolean;
  productivityExemptReason: string;
};

function draftFromUser(u: TeamRosterUser): RowDraft {
  return {
    rosterTeam: u.rosterTeam ?? "",
    qaIsTracked: u.qaIsTracked,
    qaTeam: u.qaTeam ?? "",
    qaExemptReason: u.qaExemptReason ?? "",
    productivityEligible: u.productivityEligible,
    productivityExemptReason: u.productivityExemptReason ?? "",
  };
}

type RowFeedback = {
  state: "idle" | "saving" | "saved" | "error";
  message?: string;
};

export default function TeamRosterPage() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<TeamRosterUser[]>([]);
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});
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
      const d: Record<string, RowDraft> = {};
      for (const u of list) {
        d[u.id] = draftFromUser(u);
      }
      setRowDrafts(d);
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
    const draft = rowDrafts[userId];
    if (!draft) return;
    const serverUser = users.find((u) => u.id === userId);
    if (!serverUser) return;

    const dirtyRoster = rosterDirty(draft.rosterTeam, serverUser.rosterTeam);
    const dirtyQaTracked = draft.qaIsTracked !== serverUser.qaIsTracked;
    const dirtyQaTeam = rosterDirty(draft.qaTeam, serverUser.qaTeam);
    const dirtyQaNote = productivityNoteDirty(draft.qaExemptReason, serverUser.qaExemptReason);
    const dirtyProdEligible = draft.productivityEligible !== serverUser.productivityEligible;
    const dirtyProdNote = productivityNoteDirty(
      draft.productivityExemptReason,
      serverUser.productivityExemptReason
    );
    if (
      !dirtyRoster &&
      !dirtyQaTracked &&
      !dirtyQaTeam &&
      !dirtyQaNote &&
      !dirtyProdEligible &&
      !dirtyProdNote
    ) {
      return;
    }

    const body: Record<string, unknown> = { userId };
    if (dirtyRoster) body.rosterTeam = draftToStored(draft.rosterTeam);
    if (dirtyQaTracked) body.qaIsTracked = draft.qaIsTracked;
    if (dirtyQaTeam) body.qaTeam = draftToStored(draft.qaTeam);
    if (dirtyQaNote) body.qaExemptReason = draftToStored(draft.qaExemptReason);
    if (dirtyProdEligible) body.productivityEligible = draft.productivityEligible;
    if (dirtyProdNote) {
      body.productivityExemptReason = draftToStored(draft.productivityExemptReason);
    }

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
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");

      const updated = json.data.user as TeamRosterUser;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setRowDrafts((prev) => ({
        ...prev,
        [userId]: draftFromUser(updated),
      }));
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
              Edit <span className="text-white/75">Roster team</span>, <span className="text-white/75">QA roster</span>{" "}
              fields, and <span className="text-white/75">productivity eligibility</span> per row (one Save). Work
              queues stay read-only; manage them in Settings → Agent Specializations. The standalone QA roster page
              remains available.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-xs text-white/50 max-w-4xl leading-relaxed border-t border-white/10 pt-4">
              <div>
                <dt className="font-medium text-white/65">Roster Team</dt>
                <dd className="mt-0.5 space-y-1.5">
                  <p>Roster Team is the neutral future team/supervisor field.</p>
                  <p>QA Team is still the field currently used by QA dashboard filters.</p>
                  <p>
                    A later phase will cut QA dashboards over to Roster Team after validation. Until then, filters
                    keep using QA Team.
                  </p>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-white/65">QA roster (tracked, team, note)</dt>
                <dd className="mt-0.5 space-y-1.5">
                  <p>Same data as the QA roster page: coverage expectations, QA team label for filters, and notes.</p>
                  <p>
                    You can still use{" "}
                    <Link href="/manager/quality-review/roster" className="text-violet-300/90 underline hover:text-violet-200/90">
                      QA roster
                    </Link>{" "}
                    if you prefer that layout.
                  </p>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-white/65">Productivity · Eligible</dt>
                <dd className="mt-0.5 space-y-1.5">
                  <p>
                    Productivity eligible controls whether this user can appear in manager productivity scorecard
                    APIs.
                  </p>
                  <p>This does not affect QA tracking or QA scores.</p>
                  <p>This does not change scoring formulas.</p>
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
                    <th colSpan={3} className={`${groupHead} align-bottom`}>
                      <div className="flex flex-col items-center gap-0.5 py-1">
                        <span>QA</span>
                        <span className="max-w-[16rem] font-normal normal-case tracking-normal text-[10px] leading-snug text-white/40">
                          Tracked / QA team / note — same row Save
                        </span>
                      </div>
                    </th>
                    <th colSpan={2} className={`${groupHead} align-bottom`}>
                      <div className="flex flex-col items-center gap-0.5 py-1">
                        <span>Productivity</span>
                        <span className="max-w-[16rem] font-normal normal-case tracking-normal text-[10px] leading-snug text-white/40">
                          Eligible / note — same row Save (with Roster + QA)
                        </span>
                      </div>
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
                    <th className="px-3 py-2 border-l border-white/10 min-w-[6.5rem]">Tracked</th>
                    <th className="px-3 py-2 min-w-[12rem] max-w-[18rem]">QA team</th>
                    <th className="px-3 py-2 min-w-[10rem] max-w-[18rem]">QA note</th>
                    <th className="px-3 py-2 border-l border-white/10 min-w-[7rem]">Eligible</th>
                    <th className="px-3 py-2 min-w-[12rem] max-w-[18rem]">Productivity note</th>
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
                      const draft = rowDrafts[u.id];
                      const dirtyRoster = draft ? rosterDirty(draft.rosterTeam, u.rosterTeam) : false;
                      const dirtyProdEligible = draft
                        ? draft.productivityEligible !== u.productivityEligible
                        : false;
                      const dirtyProdNote = draft
                        ? productivityNoteDirty(draft.productivityExemptReason, u.productivityExemptReason)
                        : false;
                      const dirtyQaTracked = draft ? draft.qaIsTracked !== u.qaIsTracked : false;
                      const dirtyQaTeam = draft ? rosterDirty(draft.qaTeam, u.qaTeam) : false;
                      const dirtyQaNote = draft
                        ? productivityNoteDirty(draft.qaExemptReason, u.qaExemptReason)
                        : false;
                      const dirty =
                        dirtyRoster ||
                        dirtyQaTracked ||
                        dirtyQaTeam ||
                        dirtyQaNote ||
                        dirtyProdEligible ||
                        dirtyProdNote;
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
                              value={draft?.rosterTeam ?? ""}
                              onChange={(e) =>
                                setRowDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    ...(prev[u.id] ?? draftFromUser(u)),
                                    rosterTeam: e.target.value,
                                  },
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
                                <span className="text-[10px] text-red-300/95 max-w-[11rem] leading-tight">
                                  {fb.message}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-l border-white/10 text-xs align-top">
                            <label className="flex flex-col gap-1 cursor-pointer select-none">
                              <span className="text-[10px] uppercase tracking-wide text-white/35">QA tracked</span>
                              <input
                                type="checkbox"
                                checked={draft?.qaIsTracked ?? u.qaIsTracked}
                                onChange={(e) =>
                                  setRowDrafts((prev) => ({
                                    ...prev,
                                    [u.id]: {
                                      ...(prev[u.id] ?? draftFromUser(u)),
                                      qaIsTracked: e.target.checked,
                                    },
                                  }))
                                }
                                disabled={saving || !draft}
                                className="w-4 h-4 rounded accent-violet-500"
                                aria-label={`QA tracked for ${u.name || u.email}`}
                              />
                            </label>
                          </td>
                          <td className="px-3 py-2 text-white/80 max-w-[18rem] align-top">
                            <label className="block text-[10px] uppercase tracking-wide text-white/35 mb-1">
                              QA team (dashboard filters)
                            </label>
                            <input
                              value={draft?.qaTeam ?? ""}
                              onChange={(e) =>
                                setRowDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    ...(prev[u.id] ?? draftFromUser(u)),
                                    qaTeam: e.target.value,
                                  },
                                }))
                              }
                              maxLength={QA_TEAM_MAX}
                              placeholder="e.g. Team A"
                              disabled={saving || !draft}
                              className="w-full min-h-[2.25rem] rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-xs text-white/95 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50"
                              aria-label={`QA team for ${u.name || u.email}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-white/55 max-w-[18rem] align-top">
                            <label className="block text-[10px] uppercase tracking-wide text-white/35 mb-1">
                              QA note / exempt reason
                            </label>
                            <textarea
                              value={draft?.qaExemptReason ?? ""}
                              onChange={(e) =>
                                setRowDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    ...(prev[u.id] ?? draftFromUser(u)),
                                    qaExemptReason: e.target.value,
                                  },
                                }))
                              }
                              rows={2}
                              disabled={saving || !draft}
                              placeholder="Optional internal note"
                              className="w-full min-w-[10rem] rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 resize-y min-h-[2.75rem]"
                              aria-label={`QA exempt reason for ${u.name || u.email}`}
                            />
                          </td>
                          <td className="px-3 py-2 border-l border-white/10 text-xs align-top">
                            <label className="flex flex-col gap-1 cursor-pointer select-none">
                              <span className="text-[10px] uppercase tracking-wide text-white/35">Eligible</span>
                              <input
                                type="checkbox"
                                checked={draft?.productivityEligible ?? u.productivityEligible}
                                onChange={(e) =>
                                setRowDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    ...(prev[u.id] ?? draftFromUser(u)),
                                    productivityEligible: e.target.checked,
                                  },
                                }))
                                }
                                disabled={saving || !draft}
                                className="w-4 h-4 rounded accent-emerald-500"
                                aria-label={`Productivity eligible for ${u.name || u.email}`}
                              />
                            </label>
                          </td>
                          <td className="px-3 py-2 text-xs text-white/55 max-w-[18rem] align-top">
                            <label className="block text-[10px] uppercase tracking-wide text-white/35 mb-1">
                              Note / exempt reason
                            </label>
                            <textarea
                              value={draft?.productivityExemptReason ?? ""}
                              onChange={(e) =>
                                setRowDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    ...(prev[u.id] ?? draftFromUser(u)),
                                    productivityExemptReason: e.target.value,
                                  },
                                }))
                              }
                              rows={2}
                              disabled={saving || !draft}
                              placeholder="Optional internal note"
                              className="w-full min-w-[10rem] rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 resize-y min-h-[2.75rem]"
                              aria-label={`Productivity exempt reason for ${u.name || u.email}`}
                            />
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
