'use client';

import { useEffect, useMemo, useState } from 'react';

type PendingItem = {
  id: string;
  brand: string | null;
  text: string | null;
  email: string | null;
  phone: string | null;
  status: 'pending' | 'in_progress' | 'assistance_required' | 'resolved' | 'completed' | string;
  assignedToId: string | null;
  createdAt: string | null;
  startTime: string | null;
  updatedAt: string | null;
  assistanceNotes?: string | null;
  managerResponse?: string | null;
  assignedTo?: { id: string; name: string | null; email: string | null } | null;
};

async function fetchPending(params: {
  q?: string;
  assigned?: string;  // 'any' | 'unassigned' | userId
  status?: string;    // 'all' | 'pending' | 'in_progress' | etc.
  page?: number;
  pageSize?: number;
}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.assigned) sp.set('assigned', params.assigned);
  if (params.status && params.status !== 'all') sp.set('status', params.status);
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));

  // Use the new Tasks endpoint instead of the old pending endpoint
  const res = await fetch(`/api/tasks?` + sp.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load tasks');
  return res.json() as Promise<{ items: PendingItem[]; total: number; pageSize: number; offset: number }>;
}

async function assignRow(id: string, userId: string) {
  const res = await fetch(`/api/raw-messages/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error('Assign failed');
}

async function unassignRow(id: string) {
  const res = await fetch(`/api/raw-messages/${id}/unassign`, { method: 'POST' });
  if (!res.ok) throw new Error('Unassign failed');
}

async function spamRow(id: string) {
  const res = await fetch(`/api/raw-messages/${id}/spam`, { method: 'POST' });
  if (!res.ok) throw new Error('Spam action failed');
}

async function handleManagerResponse(taskId: string, response: string) {
  const res = await fetch(`/api/manager/tasks/${taskId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  });
  if (!res.ok) throw new Error('Failed to send response');
  // Refresh the list to show the response
  window.location.reload();
}

export default function PendingTasksSection() {
  const [rows, setRows] = useState<PendingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage]   = useState(1);
  const [pageSize]        = useState(25);
  const [q, setQ]         = useState('');
  const [status, setStatus] = useState<'all' | 'pending' | 'in_progress' | 'assistance_required' | 'resolved' | 'completed'>('all');
  const [assigned, setAssigned] = useState<'any' | 'unassigned' | string>('any');
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = async (opts?: Partial<{ q: string; assigned: string; status: string; page: number }>) => {
    setLoading(true);
    try {
      const res = await fetchPending({
        q: opts?.q ?? q,
        assigned: opts?.assigned ?? assigned,
        status: opts?.status ?? status,
        page: opts?.page ?? page,
        pageSize,
      });
      setRows(res.items);
      setTotal(res.total);
      // Update page if needed (handle offset vs page)
      if (res.offset !== undefined) {
        setPage(Math.floor(res.offset / pageSize) + 1);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPage = async (newPage: number) => {
    const offset = (newPage - 1) * pageSize;
    setLoading(true);
    try {
      const res = await fetchPending({
        q,
        assigned,
        page: newPage,
        pageSize,
      });
      setRows(res.items);
      setTotal(res.total);
      setPage(newPage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  
  // Refresh every 30 seconds to catch new assignments
  useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const allSelected = useMemo(() => rows.length > 0 && selectedIds.length === rows.length, [rows, selectedIds]);

  const handleSelectAll = () => {
    setSelectedIds(allSelected ? [] : rows.map(r => r.id));
  };

  const handleSearch = async () => {
    setPage(1);
    await load({ q, page: 1 });
  };

  const handleFilterChange = async (newAssigned: string) => {
    setAssigned(newAssigned as any);
    setPage(1);
    await load({ assigned: newAssigned, page: 1 });
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus as any);
    setPage(1);
    await load({ status: newStatus, page: 1 });
  };

  const handleAssignSelected = async (userId: string) => {
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => assignRow(id, userId)));
    setSelectedIds([]);
    await load();
  };

  const handleUnassignSelected = async () => {
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => unassignRow(id)));
    setSelectedIds([]);
    await load();
  };

  const handleSpamSelected = async () => {
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => spamRow(id)));
    setSelectedIds([]);
    await load();
  };

  return (
    <div className="space-y-3">
      {/* Status and Assignment Filters */}
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="px-2 py-2 rounded bg-neutral-900 border border-neutral-700"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="assistance_required">Assistance Required</option>
          <option value="resolved">Resolved</option>
          <option value="completed">Completed</option>
        </select>
        
        <select
          value={assigned}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
        >
          <option value="any">All Assignments</option>
          <option value="unassigned">Unassigned</option>
          <option value="daniel.murcia@goldenboltllc.com">Daniel Murcia</option>
          <option value="daniel.murcia@goldencustomercare.com">Daniel Murcia 2</option>
          <option value="tester@goldencustomercare.com">Tester</option>
        </select>
        
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand/text/email/phone…"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 w-full"
        />
        <button onClick={handleSearch} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600">
          Search
        </button>
        <button onClick={() => load()} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600">
          Refresh
        </button>
      </div>

      {/* bulk actions */}
      <div className="flex items-center gap-2">
        <button onClick={handleSelectAll} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600">
          {allSelected ? 'Unselect all' : 'Select all'}
        </button>
        {/* Example assign-to-self button — replace with your dropdown/round-robin */}
        <button
          onClick={() => handleAssignSelected('YOUR_AGENT_USER_ID')}
          className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600"
        >
          Assign selected…
        </button>
        <button onClick={handleUnassignSelected} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600">
          Unassign selected
        </button>
        <button onClick={handleSpamSelected} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600">
          Send to Spam Review
        </button>
      </div>

      {/* table */}
      <div className="rounded border border-neutral-700">
        {loading ? (
          <div className="p-6 text-neutral-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-neutral-400">No tasks.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-900">
                <th className="p-2">Sel</th>
                <th className="p-2">Brand</th>
                <th className="p-2">Text</th>
                <th className="p-2">Assigned</th>
                <th className="p-2">Created</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr 
                  key={r.id} 
                  className={`border-t border-neutral-800 ${
                    r.assignedToId ? 'bg-blue-900/20' : ''
                  }`}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td className="p-2">{r.brand ?? '—'}</td>
                  <td className="p-2">{r.text ?? '—'}</td>
                  <td className="p-2">
                    {r.assignedTo ? (
                      <span className="text-blue-400 font-medium">
                        {r.assignedTo.name || r.assignedTo.email}
                      </span>
                    ) : (
                      <span className="text-neutral-400">Unassigned</span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col">
                      <span className="text-xs text-neutral-500">
                        {r.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</span>
                    </div>
                  </td>
                  <td className="p-2">
                    {r.status === "ASSISTANCE_REQUIRED" && r.assistanceNotes && (
                      <div className="space-y-2">
                        <div className="text-xs text-red-400 font-medium">🆘 Assistance Requested</div>
                        <div className="text-xs text-neutral-300 bg-red-900/20 p-2 rounded">
                          {r.assistanceNotes}
                        </div>
                        <input
                          type="text"
                          placeholder="Type your response..."
                          className="w-full text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-600"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              handleManagerResponse(r.id, e.currentTarget.value.trim());
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-neutral-400">Total: {total}</div>
    </div>
  );
}