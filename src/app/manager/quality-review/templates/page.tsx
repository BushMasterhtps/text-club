"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/app/_components/DashboardLayout";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import type { TaskType } from "@prisma/client";

type OverviewRow = {
  taskType: TaskType;
  active: {
    templateId: string;
    templateVersionId: string;
    displayName: string;
    slug: string;
    version: number;
    lineCount: number;
  } | null;
  activeTemplateCount: number;
  misconfiguredMultipleActives: boolean;
};

function TemplatesListContent() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<TaskType | null>(null);
  const [createSlug, setCreateSlug] = useState("");
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/manager/quality-review/templates/overview", {
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Failed to load");
        setRows(json.data as OverviewRow[]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const headerActions = useMemo(
    () => (
      <>
        <ThemeToggle />
        <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
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
    ),
    [timeLeft, extendSession]
  );

  const startCreate = (taskType: TaskType) => {
    setCreatingFor(taskType);
    setCreateSlug(`qr-${taskType.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`);
    setCreateName(`Quality Review – ${taskType.replace(/_/g, " ")}`);
  };

  const submitCreate = async () => {
    if (!creatingFor || !createSlug.trim() || !createName.trim()) return;
    setCreateBusy(true);
    setError(null);
    try {
      const starterLines = [
        {
          slug: "overall-quality",
          sectionOrder: 1,
          sectionTitle: "General",
          lineOrder: 1,
          label: "Overall quality of work for this task",
          helpText: null,
          weight: "10",
          isCritical: true,
          allowNa: false,
        },
      ];
      const res = await fetch("/api/manager/quality-review/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: creatingFor,
          slug: createSlug.trim(),
          displayName: createName.trim(),
          lines: starterLines,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Create failed");
      setCreatingFor(null);
      window.location.href = `/manager/quality-review/templates/${json.data.templateId}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <DashboardLayout headerActions={headerActions}>
      <div className="max-w-4xl mx-auto space-y-8 text-white pb-16">
        <header className="border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300/90 mb-1">
            Manager tools
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Quality Review templates</h1>
          <p className="text-sm text-white/55 mt-2">
            One active checklist per task type. Saving edits creates a new version; past reviews stay
            on the version they used.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {creatingFor && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Create template for {creatingFor}</h2>
            <label className="block text-sm">
              <span className="text-white/50">Slug (unique)</span>
              <input
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm font-mono text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/50">Display name</span>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white"
              />
            </label>
            <p className="text-xs text-white/45">
              Starts with one starter line. Add more and publish from the editor.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={createBusy}
                onClick={() => void submitCreate()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-40"
              >
                {createBusy ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setCreatingFor(null)}
                className="px-4 py-2 rounded-lg bg-white/10 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="px-4 py-3">Task type</th>
                <th className="px-4 py-3">Active template</th>
                <th className="px-4 py-3">Version / lines</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-white/50">
                    Loading…
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.taskType} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-violet-200/90">{r.taskType}</td>
                    <td className="px-4 py-3 text-white/85">
                      {r.active ? (
                        <>
                          {r.active.displayName}
                          {r.misconfiguredMultipleActives && (
                            <span className="ml-2 text-amber-300 text-xs">⚠ multiple actives</span>
                          )}
                        </>
                      ) : (
                        <span className="text-white/40">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      {r.active ? `v${r.active.version} · ${r.active.lineCount} lines` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {r.active ? (
                        <Link
                          href={`/manager/quality-review/templates/${r.active.templateId}`}
                          className="text-violet-300 hover:text-violet-200 underline text-xs"
                        >
                          Edit
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startCreate(r.taskType)}
                          className="text-emerald-300 hover:text-emerald-200 underline text-xs"
                        >
                          Create
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
    </DashboardLayout>
  );
}

export default function QualityReviewTemplatesPage() {
  return (
    <DashboardNavigationProvider>
      <TemplatesListContent />
    </DashboardNavigationProvider>
  );
}
