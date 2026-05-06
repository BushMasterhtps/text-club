'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { SmallButton } from '@/app/_components/SmallButton';

type Person = { id: string; email: string; name: string | null };

type QueueItem = {
  taskId: string;
  agent: Person | null;
  completedBy: Person | null;
  createdAt: string;
  endTime: string | null;
  disposition: string | null;
  emailRequestFor: string | null;
  submittedName: string | null;
  submittedEmail: string | null;
  details: string | null;
  salesforceCaseNumber: string | null;
  review: {
    verdict: 'CORRECT' | 'INCORRECT' | 'NEEDS_FOLLOW_UP';
    note: string | null;
    reviewedAt: string;
    reviewer: Person;
  } | null;
};

type VerdictFilter = 'unreviewed' | 'correct' | 'incorrect' | 'needs_follow_up' | 'all';

const VERDICT_OPTIONS: { value: VerdictFilter; label: string }[] = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'needs_follow_up', label: 'Needs follow-up' },
  { value: 'all', label: 'All' },
];

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  } catch {
    return '—';
  }
}

function verdictLabel(v: QueueItem['review']) {
  if (!v) return 'Unreviewed';
  if (v.verdict === 'CORRECT') return 'Correct';
  if (v.verdict === 'INCORRECT') return 'Incorrect';
  return 'Needs follow-up';
}

export default function EmailRequestsDispositionReview() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('unreviewed');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<QueueItem | null>(null);
  const [draftVerdict, setDraftVerdict] = useState<'CORRECT' | 'INCORRECT' | 'NEEDS_FOLLOW_UP'>('CORRECT');
  const [draftNote, setDraftNote] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(startOfMonth.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const loadQueue = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        startDate,
        endDate,
        verdict: verdictFilter,
      });
      const res = await fetch(`/api/manager/email-requests/disposition-reviews?${qs}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || `Request failed (${res.status})`);
        setItems([]);
        return;
      }
      setItems(data.items as QueueItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, verdictFilter]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const openDrawer = (row: QueueItem) => {
    setDrawerItem(row);
    setDraftVerdict(row.review?.verdict ?? 'CORRECT');
    setDraftNote(row.review?.note ?? '');
    setSaveState('idle');
    setSaveMessage(null);
  };

  const closeDrawer = () => {
    setDrawerItem(null);
    setSaveState('idle');
    setSaveMessage(null);
  };

  const saveReview = async () => {
    if (!drawerItem) return;
    setSaveState('saving');
    setSaveMessage(null);
    try {
      const res = await fetch('/api/manager/email-requests/disposition-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: drawerItem.taskId,
          verdict: draftVerdict,
          note: draftNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveState('err');
        setSaveMessage(data.error || 'Save failed');
        return;
      }
      setSaveState('ok');
      setSaveMessage('Review saved.');
      const review = data.review as QueueItem['review'];
      setDrawerItem((prev) =>
        prev && prev.taskId === drawerItem.taskId ? { ...prev, review } : prev
      );
      setItems((prev) =>
        prev.map((it) => (it.taskId === drawerItem.taskId ? { ...it, review } : it))
      );
      await loadQueue();
    } catch (e) {
      setSaveState('err');
      setSaveMessage(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
        <p className="text-sm text-amber-200/90 leading-relaxed">
          This review does not change the agent&apos;s original disposition. It is used for internal
          reporting and coaching.
        </p>
        <p className="text-xs text-white/55 leading-relaxed">
          Submitted Name/Email are pulled from the Email Request import fields.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-white/50 mb-1">Start (created)</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md bg-white/10 border border-white/20 px-3 py-2 text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">End (created)</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md bg-white/10 border border-white/20 px-3 py-2 text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Review status</label>
          <select
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value as VerdictFilter)}
            className="rounded-md bg-white/10 border border-white/20 px-3 py-2 text-white text-sm min-w-[180px]"
          >
            {VERDICT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-gray-900">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <SmallButton onClick={() => loadQueue()} className="bg-sky-600 hover:bg-sky-700 text-white">
          Refresh
        </SmallButton>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/5 text-white/70 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Case #</th>
                <th className="px-3 py-2">Request for</th>
                <th className="px-3 py-2">Submitted Name</th>
                <th className="px-3 py-2">Submitted Email</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Review</th>
                <th className="px-3 py-2 w-[100px]" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-white/50">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-white/50">
                    No tasks in this queue for the selected range and filters.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((row) => (
                  <tr key={row.taskId} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-3 py-2 text-white/80 whitespace-nowrap">{fmt(row.createdAt)}</td>
                    <td className="px-3 py-2 text-white/90 font-mono text-xs">
                      {row.salesforceCaseNumber || '—'}
                    </td>
                    <td className="px-3 py-2 text-white/80 max-w-[200px] truncate">
                      {row.emailRequestFor || '—'}
                    </td>
                    <td className="px-3 py-2 text-white/80 max-w-[140px] truncate" title={row.submittedName || undefined}>
                      {row.submittedName || '—'}
                    </td>
                    <td className="px-3 py-2 text-white/80 max-w-[180px] truncate font-mono text-xs" title={row.submittedEmail || undefined}>
                      {row.submittedEmail || '—'}
                    </td>
                    <td className="px-3 py-2 text-white/80">
                      {row.agent?.name || row.agent?.email || '—'}
                    </td>
                    <td className="px-3 py-2 text-white/80">{verdictLabel(row.review)}</td>
                    <td className="px-3 py-2">
                      <SmallButton
                        onClick={() => openDrawer(row)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                      >
                        Review
                      </SmallButton>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {drawerItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 rounded-lg border border-white/20 max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="p-4 border-b border-white/10 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-white">Unable / Unfeasible review</h3>
                <p className="text-xs text-white/50 mt-1 font-mono">{drawerItem.taskId}</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="text-white/60 hover:text-white px-2 py-1 rounded bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4 text-sm">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-amber-100/90 text-xs space-y-2">
                <p>
                  This review does not change the agent&apos;s original disposition. It is used for
                  internal reporting and coaching.
                </p>
                <p className="text-amber-200/75">
                  Submitted Name/Email are pulled from the Email Request import fields.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 text-white/85">
                <div>
                  <span className="text-white/50">Salesforce case #</span>{' '}
                  <span className="font-mono">{drawerItem.salesforceCaseNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-white/50">Request for</span> {drawerItem.emailRequestFor || '—'}
                </div>
                <div>
                  <span className="text-white/50">Submitted Name</span>{' '}
                  <span className="text-white">{drawerItem.submittedName || '—'}</span>
                </div>
                <div>
                  <span className="text-white/50">Submitted Email</span>{' '}
                  <span className="font-mono text-sm">{drawerItem.submittedEmail || '—'}</span>
                </div>
                <div>
                  <span className="text-white/50">Agent (assigned)</span>{' '}
                  {drawerItem.agent?.name || drawerItem.agent?.email || '—'}
                </div>
                <div>
                  <span className="text-white/50">Completed by</span>{' '}
                  {drawerItem.completedBy?.name || drawerItem.completedBy?.email || '—'}
                </div>
                <div>
                  <span className="text-white/50">Disposition</span>{' '}
                  <span className="text-white">{drawerItem.disposition || '—'}</span>
                </div>
                <div>
                  <span className="text-white/50">Details / notes</span>
                  <div className="mt-1 rounded bg-white/5 border border-white/10 p-2 text-white/80 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {drawerItem.details || '—'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/65">
                  <span>
                    Created: {fmt(drawerItem.createdAt)}
                  </span>
                  <span>
                    Completed: {fmt(drawerItem.endTime)}
                  </span>
                </div>
                {drawerItem.review && (
                  <div className="border-t border-white/10 pt-3 text-xs text-white/60">
                    <div>
                      Current: <strong className="text-white/90">{verdictLabel(drawerItem.review)}</strong>
                    </div>
                    {drawerItem.review.reviewer && (
                      <div>
                        By {drawerItem.review.reviewer.name || drawerItem.review.reviewer.email} ·{' '}
                        {fmt(drawerItem.review.reviewedAt)}
                      </div>
                    )}
                    {drawerItem.review.note && (
                      <div className="mt-1 text-white/75 whitespace-pre-wrap">{drawerItem.review.note}</div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="text-white/90 font-medium text-xs uppercase tracking-wide">
                  Manager verdict
                </div>
                <div className="space-y-2">
                  {(
                    [
                      ['CORRECT', 'Correct'],
                      ['INCORRECT', 'Incorrect'],
                      ['NEEDS_FOLLOW_UP', 'Needs follow-up'],
                    ] as const
                  ).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 text-white/85 cursor-pointer">
                      <input
                        type="radio"
                        name="verdict"
                        checked={draftVerdict === val}
                        onChange={() => setDraftVerdict(val)}
                        className="accent-sky-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Optional note</label>
                  <textarea
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-md bg-white/10 border border-white/20 px-3 py-2 text-white text-sm"
                    placeholder="Coaching context or follow-up items…"
                  />
                </div>
              </div>

              {saveMessage && (
                <div
                  className={
                    saveState === 'ok'
                      ? 'text-emerald-300 text-sm'
                      : saveState === 'err'
                        ? 'text-red-300 text-sm'
                        : 'text-white/60 text-sm'
                  }
                >
                  {saveMessage}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <SmallButton onClick={closeDrawer} className="bg-white/10 hover:bg-white/20 text-white">
                Close
              </SmallButton>
              <SmallButton
                onClick={saveReview}
                disabled={saveState === 'saving'}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {saveState === 'saving' ? 'Saving…' : 'Save review'}
              </SmallButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
