"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import type { TaskType } from "@prisma/client";

type ApiLine = {
  id: string;
  slug: string;
  sectionOrder: number;
  sectionTitle: string;
  lineOrder: number;
  label: string;
  helpText: string | null;
  weight: string;
  isCritical: boolean;
  allowNa: boolean;
};

type DraftLine = ApiLine & { _key: string };

function newDraftKey() {
  return `k-${Math.random().toString(36).slice(2, 11)}`;
}

function toDraft(lines: ApiLine[]): DraftLine[] {
  return lines.map((l) => ({ ...l, _key: newDraftKey() }));
}

function TemplateEditorContent() {
  const params = useParams();
  const templateId = params.templateId as string;
  const { timeLeft, extendSession, showWarning } = useAutoLogout();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [taskType, setTaskType] = useState<TaskType | "">("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/manager/quality-review/templates/${templateId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Load failed");
      const t = json.data.template as {
        displayName: string;
        taskType: TaskType;
      };
      setDisplayName(t.displayName);
      setTaskType(t.taskType);
      setLines(toDraft((json.data.lines as ApiLine[]) ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const headerActions = useMemo(
    () => (
      <>
        <ThemeToggle />
        <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
        <Link
          href="/manager/quality-review/templates"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
        >
          ← All templates
        </Link>
      </>
    ),
    [timeLeft, extendSession]
  );

  const saveDisplayName = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/manager/quality-review/templates/${templateId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Update failed");
      setSuccess("Display name saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        lines: lines.map((l) => ({
          slug: l.slug,
          sectionOrder: Number(l.sectionOrder),
          sectionTitle: l.sectionTitle,
          lineOrder: Number(l.lineOrder),
          label: l.label,
          helpText: l.helpText || null,
          weight: l.weight,
          isCritical: l.isCritical,
          allowNa: l.allowNa,
        })),
      };
      const res = await fetch(`/api/manager/quality-review/templates/${templateId}/publish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Publish failed");
      setSuccess(`Published version ${json.data.version} (${json.data.lineCount} lines).`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        _key: newDraftKey(),
        id: "",
        slug: `line-${prev.length + 1}`,
        sectionOrder: 1,
        sectionTitle: "Section",
        lineOrder: prev.length + 1,
        label: "",
        helpText: null,
        weight: "1",
        isCritical: false,
        allowNa: false,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l._key !== key));
  };

  const moveLine = (index: number, dir: -1 | 1) => {
    setLines((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  };

  return (
    <DashboardLayout headerActions={headerActions}>
      <div className="max-w-4xl mx-auto space-y-6 text-white pb-16">
        <header>
          <h1 className="text-2xl font-semibold">Edit template</h1>
          <p className="text-sm text-white/50 mt-1 font-mono">{templateId}</p>
          {taskType && (
            <p className="text-xs text-white/40 mt-2">
              Task type: <span className="text-violet-200/90">{taskType}</span>
            </p>
          )}
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        )}

        {loading ? (
          <p className="text-white/50">Loading…</p>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
              <label className="block text-sm">
                <span className="text-white/50">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-white"
                />
              </label>
              <button
                type="button"
                disabled={saving || !displayName.trim()}
                onClick={() => void saveDisplayName()}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/15 disabled:opacity-40"
              >
                Save name only
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-medium">Checklist lines</h2>
              <button
                type="button"
                onClick={addLine}
                className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500"
              >
                Add line
              </button>
            </div>

            <div className="space-y-4">
              {lines.map((line, idx) => (
                <div
                  key={line._key}
                  className="rounded-xl border border-white/10 bg-neutral-950/60 p-4 space-y-3"
                >
                  <div className="flex flex-wrap gap-2 justify-between items-center">
                    <span className="text-xs text-white/40">Line {idx + 1}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-white/60 hover:text-white"
                        onClick={() => moveLine(idx, -1)}
                        disabled={idx === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="text-xs text-white/60 hover:text-white"
                        onClick={() => moveLine(idx, 1)}
                        disabled={idx === lines.length - 1}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-300 hover:text-red-200"
                        onClick={() => removeLine(line._key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <label className="block">
                      <span className="text-white/45 text-xs">Slug</span>
                      <input
                        value={line.slug}
                        onChange={(e) => updateLine(line._key, { slug: e.target.value })}
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 font-mono text-xs text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-white/45 text-xs">Weight</span>
                      <input
                        value={line.weight}
                        onChange={(e) => updateLine(line._key, { weight: e.target.value })}
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 font-mono text-xs text-white"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-white/45 text-xs">Section title</span>
                      <input
                        value={line.sectionTitle}
                        onChange={(e) => updateLine(line._key, { sectionTitle: e.target.value })}
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-white/45 text-xs">Section order</span>
                      <input
                        type="number"
                        value={line.sectionOrder}
                        onChange={(e) =>
                          updateLine(line._key, { sectionOrder: parseInt(e.target.value, 10) || 0 })
                        }
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-white/45 text-xs">Line order</span>
                      <input
                        type="number"
                        value={line.lineOrder}
                        onChange={(e) =>
                          updateLine(line._key, { lineOrder: parseInt(e.target.value, 10) || 0 })
                        }
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-white/45 text-xs">Label</span>
                      <input
                        value={line.label}
                        onChange={(e) => updateLine(line._key, { label: e.target.value })}
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-white/45 text-xs">Help text</span>
                      <textarea
                        value={line.helpText ?? ""}
                        onChange={(e) => updateLine(line._key, { helpText: e.target.value || null })}
                        rows={2}
                        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white text-sm"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={line.isCritical}
                        onChange={(e) => updateLine(line._key, { isCritical: e.target.checked })}
                        className="accent-violet-500"
                      />
                      <span className="text-sm text-white/80">Critical</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={line.allowNa}
                        onChange={(e) => updateLine(line._key, { allowNa: e.target.checked })}
                        className="accent-violet-500"
                      />
                      <span className="text-sm text-white/80">Allow N/A</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-500/25 bg-amber-950/30 p-4 text-sm text-amber-100/90">
              <strong>Publish new version</strong> creates a new checklist version and makes it the
              active one for this task type. Historical reviews keep their old version.
            </div>

            <button
              type="button"
              disabled={saving || lines.length === 0}
              onClick={() => void publish()}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold disabled:opacity-40"
            >
              {saving ? "Saving…" : "Publish new active version"}
            </button>
          </>
        )}
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

export default function TemplateEditorPage() {
  return (
    <DashboardNavigationProvider>
      <TemplateEditorContent />
    </DashboardNavigationProvider>
  );
}
