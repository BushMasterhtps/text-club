"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardLayout from '@/app/_components/DashboardLayout';
import { DashboardNavigationProvider } from '@/contexts/DashboardNavigationContext';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import ThemeToggle from '@/app/_components/ThemeToggle';
import UnifiedSettings from '@/app/_components/UnifiedSettings';
import YotpoAnalytics from '@/app/_components/YotpoAnalytics';
import { AssistanceRequestsSection } from '@/app/manager/_components/AssistanceRequestsSection';
import SortableHeader, { SortDirection } from '@/app/_components/SortableHeader';
import SubmissionsReport from '@/app/yotpo/_components/SubmissionsReport';
import SessionTimer from '@/app/_components/SessionTimer';

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
interface YotpoTask {
  id: string;
  status: string;
  dateSubmitted: string | null;
  prOrYotpo: string | null;
  customerName: string | null;
  email: string | null;
  orderDate: string | null;
  product: string | null;
  issueTopic: string | null;
  reviewDate: string | null;
  review: string | null;
  sfOrderLink: string | null;
  importSource: string | null;
  submittedBy: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  email: string;
  name: string;
  emailRequests: { assigned: number; inProgress: number; completedToday: number };
}

// Utils
function fmtDate(d: string | Date | null | undefined) {
  try {
    const dt = typeof d === "string" ? new Date(d) : d ?? new Date(0);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
  } catch {
    return "—";
  }
}

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
      className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

/* ========================================================================== */
/*  CSV Import Section                                                        */
/* ========================================================================== */
function CsvImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleImport = async () => {
    if (!file) {
      setMessage("Please select a CSV file first");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/yotpo/import', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        setMessage(`✓ Success! Imported ${data.results.imported} tasks, ${data.results.duplicates} duplicates skipped, ${data.results.errors} errors`);
        setFile(null);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) input.value = '';
      } else {
        setMessage(`✗ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      setMessage('✗ Failed to import CSV');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>📥 CSV Import</H2>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.startsWith('✓') ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
        }`}>
          {message}
        </div>
      )}

      <div className="bg-white/5 rounded-lg p-4 space-y-4 border border-white/10">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-white/80
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-700
              file:cursor-pointer"
          />
        </div>

        <button
          onClick={handleImport}
          disabled={!file || uploading}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold text-sm transition-colors"
        >
          {uploading ? '⏳ Importing...' : '📥 Import Yotpo CSV'}
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-300 mb-2">💡 CSV Format</h4>
        <div className="text-xs text-white/70 space-y-1">
          <div>• <strong>Column A:</strong> Date Submitted</div>
          <div>• <strong>Column B:</strong> PRs or Yotpo?</div>
          <div>• <strong>Column C:</strong> Customer Name</div>
          <div>• <strong>Column D:</strong> Email</div>
          <div>• <strong>Column E:</strong> Order Date</div>
          <div>• <strong>Column F:</strong> Product</div>
          <div>• <strong>Column G:</strong> Issue Topic</div>
          <div>• <strong>Column H:</strong> Review Date</div>
          <div>• <strong>Column I:</strong> Review (full text)</div>
          <div>• <strong>Column J:</strong> SF Order Referenced (link)</div>
          <div className="pt-2 text-white/60">
            <strong>Duplicate Check:</strong> Email + Product + Review Date
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Pending Tasks Section                                                     */
/* ========================================================================== */
function PendingTasksSection() {
  const PAGE_SIZE = 50;

  const [tasks, setTasks] = useState<YotpoTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [assignedFilter, setAssignedFilter] = useState('unassigned');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  
  // Sorting
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  
  // View Modal
  const [viewTask, setViewTask] = useState<YotpoTask | null>(null);

  const fetchPage = async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      // Pagination
      params.append('take', String(PAGE_SIZE));
      params.append('skip', String((p - 1) * PAGE_SIZE));
      
      // Handle assigned filter - can be 'all', 'unassigned', or specific agent ID
      if (assignedFilter !== 'all') {
        if (assignedFilter === 'unassigned') {
          params.append('assigned', 'unassigned');
        } else {
          // It's a specific agent ID
          params.append('assignedTo', assignedFilter);
        }
      }
      
      if (searchQuery) params.append('search', searchQuery);

      // Sorting
      if (sort?.key && sort.direction) {
        params.append('sortBy', sort.key);
        params.append('sortOrder', sort.direction);
      }

      const res = await fetch(`/api/yotpo/queues?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setTasks(data.tasks);
        setTotal(data.total || data.tasks.length);
        setPage(p);
        setSelectedTasks(new Set()); // Clear selection on page change
      }
    } catch (error) {
      console.error('Error loading Yotpo tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = () => fetchPage(1);

  useEffect(() => {
    loadTasks();
    loadAgents();
  }, [statusFilter, assignedFilter, sort]);

  const handleSort = (key: string, direction: SortDirection) => {
    setSort(direction ? { key, direction } : null);
  };

  const onPrev = () => page > 1 && fetchPage(page - 1);
  const onNext = () => page < totalPages && fetchPage(page + 1);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/manager/agents');
      const data = await res.json();
      if (data.success && data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const toggleTask = (taskId: string) => {
    const newSet = new Set(selectedTasks);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setSelectedTasks(newSet);
  };

  const handleBulkAssign = async (agentId: string) => {
    if (selectedTasks.size === 0) {
      alert('Please select at least one task');
      return;
    }

    setAssignLoading(true);
    try {
      const res = await fetch('/api/yotpo/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: Array.from(selectedTasks),
          agentIds: [agentId]
        })
      });

      const data = await res.json();
      
      if (data.success) {
        alert(`✓ Assigned ${data.results.assigned} tasks successfully`);
        setSelectedTasks(new Set());
        fetchPage(page); // Refresh current page
      } else {
        alert(`✗ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Assignment error:', error);
      alert('✗ Failed to assign tasks');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (selectedTasks.size === 0) {
      alert('Please select at least one task');
      return;
    }

    if (!confirm(`Unassign ${selectedTasks.size} task(s)?`)) {
      return;
    }

    setAssignLoading(true);
    try {
      // Unassign by setting assignedToId to null and status to PENDING
      const updates = Array.from(selectedTasks).map(taskId =>
        fetch(`/api/manager/tasks/${taskId}/unassign`, {
          method: 'POST'
        })
      );

      await Promise.all(updates);
      
      alert(`✓ Unassigned ${selectedTasks.size} tasks`);
      setSelectedTasks(new Set());
      fetchPage(page); // Refresh current page
    } catch (error) {
      console.error('Unassign error:', error);
      alert('✗ Failed to unassign tasks');
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <H2>📁 Pending Yotpo Request Tasks</H2>
          <div className="text-xs text-white/60 mt-1">{total} total</div>
        </div>
        <SmallButton onClick={loadTasks} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading ? 'Refreshing...' : 'Refresh'}
        </SmallButton>
      </div>

      {/* Bulk Toolbar - Always visible like Text Club */}
      <div className="flex flex-wrap items-center gap-2">
        <SmallButton onClick={() => {
          const allIds = tasks.map(t => t.id);
          if (selectedTasks.size === tasks.length) {
            setSelectedTasks(new Set()); // Clear all
          } else {
            setSelectedTasks(new Set(allIds)); // Select all
          }
        }}>
          {selectedTasks.size === tasks.length && tasks.length > 0 ? "Clear all" : "Select all"}
        </SmallButton>

        <select
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            handleBulkAssign(v);
            e.currentTarget.value = "";
          }}
          disabled={assignLoading || selectedTasks.size === 0}
          className="rounded-lg px-3 py-2 bg-white/10 text-white text-sm ring-1 ring-white/10 disabled:opacity-50"
          defaultValue=""
          title="Assign selected to…"
          style={{ colorScheme: 'dark' }}
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

        <SmallButton 
          onClick={handleUnassign} 
          disabled={assignLoading || selectedTasks.size === 0}
        >
          Unassign selected
        </SmallButton>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-white/60 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Assigned</label>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">Anyone</option>
            <option value="unassigned">Unassigned</option>
            <optgroup label="Filter by Agent">
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Search</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email, name, topic..."
              className="flex-1 px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <SmallButton onClick={loadTasks} className="bg-blue-600 hover:bg-blue-700">
              Search
            </SmallButton>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2 w-8"><input type="checkbox" onChange={(e) => {
                const allIds = tasks.map(t => t.id);
                if (e.target.checked) {
                  setSelectedTasks(new Set(allIds));
                } else {
                  setSelectedTasks(new Set());
                }
              }} /></th>
              <SortableHeader sortKey="status" currentSort={sort} onSort={handleSort}>
                Status
              </SortableHeader>
              <SortableHeader sortKey="dateSubmitted" currentSort={sort} onSort={handleSort}>
                Date Submitted
              </SortableHeader>
              <SortableHeader sortKey="prOrYotpo" currentSort={sort} onSort={handleSort}>
                PR/Yotpo
              </SortableHeader>
              <SortableHeader sortKey="customerName" currentSort={sort} onSort={handleSort}>
                Customer Name
              </SortableHeader>
              <SortableHeader sortKey="email" currentSort={sort} onSort={handleSort}>
                Email
              </SortableHeader>
              <SortableHeader sortKey="orderDate" currentSort={sort} onSort={handleSort}>
                Order Date
              </SortableHeader>
              <SortableHeader sortKey="product" currentSort={sort} onSort={handleSort}>
                Product
              </SortableHeader>
              <SortableHeader sortKey="issueTopic" currentSort={sort} onSort={handleSort}>
                Issue Topic
              </SortableHeader>
              <SortableHeader sortKey="reviewDate" currentSort={sort} onSort={handleSort}>
                Review Date
              </SortableHeader>
              <th className="px-3 py-2 min-w-64">Review</th>
              <SortableHeader sortKey="assignedTo" currentSort={sort} onSort={handleSort}>
                Assigned To
              </SortableHeader>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-white/50">
                  {loading ? 'Loading...' : 'No Yotpo tasks found'}
                </td>
              </tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <input 
                      type="checkbox" 
                      checked={selectedTasks.has(task.id)}
                      onChange={() => toggleTask(task.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        task.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                        task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        {task.status}
                      </span>
                      {task.importSource && (
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          task.importSource === 'Form' 
                            ? 'bg-purple-500/20 text-purple-300' 
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {task.importSource === 'Form' ? '📝 Form' : '📄 CSV'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-white/80">{fmtDate(task.dateSubmitted)}</td>
                  <td className="px-3 py-2 text-white/80">{task.prOrYotpo || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{task.customerName || '—'}</td>
                  <td className="px-3 py-2 text-white/80 text-xs">{task.email || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{fmtDate(task.orderDate)}</td>
                  <td className="px-3 py-2 text-white/80">{task.product || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{task.issueTopic || '—'}</td>
                  <td className="px-3 py-2 text-white/80">{fmtDate(task.reviewDate)}</td>
                  <td className="px-3 py-2 text-white/80">
                    <div className="max-h-20 overflow-y-auto text-xs leading-relaxed">
                      {task.review ? (
                        <div className="max-w-xs break-words">{task.review}</div>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-white/80 text-xs">
                    {task.assignedTo ? task.assignedTo.name : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <SmallButton 
                        onClick={() => setViewTask(task)}
                        className="bg-blue-600 hover:bg-blue-700 text-xs"
                      >
                        View
                      </SmallButton>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleBulkAssign(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="px-2 py-1 bg-white/10 rounded text-xs text-white ring-1 ring-white/10"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="">Assign to...</option>
                        {agents.map(agent => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">
          Page {page} of {totalPages} · Showing {tasks.length} of {total}
          {selectedTasks.size > 0 && ` · ${selectedTasks.size} selected`}
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          
          <SmallButton onClick={onNext} disabled={loading || page >= totalPages}>Next</SmallButton>
        </div>
      </div>

      {/* View Task Modal */}
      {viewTask && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setViewTask(null)}
        >
          <div 
            className="bg-neutral-900 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">📋 Yotpo Task Details</h3>
              <SmallButton onClick={() => setViewTask(null)} className="bg-white/10 hover:bg-white/20">
                ✕ Close
              </SmallButton>
            </div>

            <div className="space-y-4">
              {/* Status */}
              <div>
                <div className="text-xs text-white/50 mb-1">Status</div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  viewTask.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                  viewTask.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-green-500/20 text-green-300'
                }`}>
                  {viewTask.status}
                </span>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-white/50 mb-1">Customer Name</div>
                  <div className="text-white">{viewTask.customerName || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Email</div>
                  <div className="text-white text-sm">{viewTask.email || '—'}</div>
                </div>
              </div>

              {/* Product & Issue */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-white/50 mb-1">Product</div>
                  <div className="text-white">{viewTask.product || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Issue Topic</div>
                  <div className="text-white">{viewTask.issueTopic || '—'}</div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-white/50 mb-1">Date Submitted</div>
                  <div className="text-white text-sm">{fmtDate(viewTask.dateSubmitted)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Order Date</div>
                  <div className="text-white text-sm">{fmtDate(viewTask.orderDate)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Review Date</div>
                  <div className="text-white text-sm">{fmtDate(viewTask.reviewDate)}</div>
                </div>
              </div>

              {/* Review Text */}
              <div>
                <div className="text-xs text-white/50 mb-1">Review</div>
                <div className="text-white bg-white/5 rounded-lg p-3 max-h-48 overflow-y-auto border border-white/10">
                  {viewTask.review || 'No review text provided'}
                </div>
              </div>

              {/* SF Order Link */}
              {viewTask.sfOrderLink && (
                <div>
                  <div className="text-xs text-white/50 mb-1">Salesforce Order</div>
                  <a 
                    href={viewTask.sfOrderLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline text-sm"
                  >
                    {viewTask.sfOrderLink}
                  </a>
                </div>
              )}

              {/* Assigned To */}
              <div>
                <div className="text-xs text-white/50 mb-1">Assigned To</div>
                <div className="text-white">
                  {viewTask.assignedTo ? `${viewTask.assignedTo.name} (${viewTask.assignedTo.email})` : 'Unassigned'}
                </div>
              </div>

              {/* PR/Yotpo */}
              <div>
                <div className="text-xs text-white/50 mb-1">PR/Yotpo</div>
                <div className="text-white">{viewTask.prOrYotpo || '—'}</div>
              </div>
              
              {/* Import Source */}
              {viewTask.importSource && (
                <div>
                  <div className="text-xs text-white/50 mb-1">Import Source</div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    viewTask.importSource === 'Form' 
                      ? 'bg-purple-500/20 text-purple-300' 
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {viewTask.importSource === 'Form' ? '📝 Form Submission' : '📄 CSV Import'}
                  </span>
                </div>
              )}
              
              {/* Submitted By (for Form submissions) */}
              {viewTask.submittedBy && (
                <div>
                  <div className="text-xs text-white/50 mb-1">Submitted By</div>
                  <div className="text-white font-medium">{viewTask.submittedBy}</div>
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
/*  Assign Tasks Section                                                      */
/* ========================================================================== */
function AssignTasksSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [perAgentCap, setPerAgentCap] = useState(50);
  const [loading, setLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentWorkloads, setAgentWorkloads] = useState<Record<string, any>>({});

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch('/api/manager/agents', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.agents) {
        setAgents(data.agents);
        setSelectedAgents((prev) => prev.filter((e) => data.agents.some((a: any) => a.email === e)));
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setAgentsLoading(false);
    }
  };

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

  useEffect(() => {
    loadAgents();
    loadAgentWorkloads();
  }, []);

  const toggleSelectAll = () => {
    const allSelected = selectedAgents.length === agents.length;
    setSelectedAgents(allSelected ? [] : agents.map(agent => agent.email));
  };

  const toggleAgent = (agentEmail: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentEmail) ? prev.filter((e) => e !== agentEmail) : [...prev, agentEmail]
    );
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>🎯 Assign Yotpo Tasks</H2>
        <SmallButton onClick={() => { loadAgents(); loadAgentWorkloads(); }} disabled={agentsLoading || loading} className="bg-blue-600 hover:bg-blue-700">
          {loading || agentsLoading ? "Loading..." : "🔄 Refresh"}
        </SmallButton>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/60">
            Choose agents ({selectedAgents.length}/{agents.length} selected)
          </div>
          <SmallButton onClick={toggleSelectAll} disabled={agentsLoading || agents.length === 0}>
            {selectedAgents.length === agents.length ? "Clear all" : "Select all"}
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
            value={perAgentCap}
            onChange={(e) => setPerAgentCap(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
          />
          <div className="text-xs text-white/50 mt-1">Absolute hard cap is 200 per agent.</div>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <PrimaryButton 
          onClick={async () => {
            if (selectedAgents.length === 0) return;
            setLoading(true);
            try {
              // Map agent emails to agent IDs
              const agentIdMap = new Map(agents.map(a => [a.email, a.id]));
              const agentIds = selectedAgents.map(email => agentIdMap.get(email)).filter(Boolean) as string[];
              
              if (agentIds.length === 0) {
                alert('No valid agents selected');
                return;
              }

              const res = await fetch('/api/yotpo/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  agentIds: agentIds,
                  perAgentCap
                })
              });
              const data = await res.json();
              if (res.ok && data.success) {
                alert(`Successfully assigned ${data.assigned || data.message} Yotpo tasks!`);
                setSelectedAgents([]);
                loadAgents();
                loadAgentWorkloads();
              } else {
                alert(`Assignment failed: ${data.error || data.message || 'Unknown error'}`);
              }
            } catch (error) {
              console.error('Failed to assign tasks:', error);
              alert('Failed to assign tasks');
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading || selectedAgents.length === 0 || perAgentCap <= 0}
        >
          {loading ? "Assigning…" : "Assign Now"}
        </PrimaryButton>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/*  Main Page Component                                                       */
/* ========================================================================== */
function YotpoPageContent() {
  const { activeSection, setActiveSection } = useDashboardNavigation();
  
  // Overview data
  const [overviewData, setOverviewData] = useState({
    pendingCount: 0,
    inProgressCount: 0,
    completedTodayCount: 0,
    totalCompletedCount: 0,
    progressPercentage: 0,
    totalTasks: 0,
    lastImport: null as { date: string; imported: number; duplicates: number; errors: number } | null
  });
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [assistanceRequests, setAssistanceRequests] = useState<Array<{
    id: string;
    taskType: string;
    agentName: string;
    agentEmail: string;
    assistanceNotes: string;
    managerResponse?: string;
    createdAt: string;
    updatedAt: string;
    status: string;
  }>>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Auto logout hook
  const { timeLeft, extendSession } = useAutoLogout({ timeoutMinutes: 50 });

  // Load overview data
  const loadOverviewData = async () => {
    setOverviewLoading(true);
    try {
      console.log("🔍 [Yotpo] Loading overview data...");
      const response = await fetch('/api/yotpo/overview');
      console.log("🔍 [Yotpo] Overview API response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 [Yotpo] Overview API data:", data);
        
        if (data.success) {
          setOverviewData(data.data);
        }
      } else {
        console.error("🔍 [Yotpo] Overview API error:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("🔍 [Yotpo] Error loading overview data:", error);
    } finally {
      setOverviewLoading(false);
    }
  };

  // Load assistance requests - get all non-Holds requests for cross-visibility
  const loadAssistanceRequests = async () => {
    try {
      console.log("🔍 [Yotpo] Loading assistance requests...");
      const response = await fetch('/api/manager/assistance', { cache: 'no-store' });
      console.log("🔍 [Yotpo] Assistance API response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 [Yotpo] Assistance API data:", data);
        
        if (data.success) {
          // Get all non-Holds requests (for cross-task-type visibility)
          const allNonHoldsRequests = (data.requests || []).filter((req: any) => 
            req.taskType !== 'HOLDS' && 
            (req.taskType === 'TEXT_CLUB' || 
             req.taskType === 'WOD_IVCS' || 
             req.taskType === 'EMAIL_REQUESTS' || 
             req.taskType === 'YOTPO' ||
             req.taskType === 'STANDALONE_REFUNDS')
          );
          
          console.log("🔍 [Yotpo] All non-Holds requests count:", allNonHoldsRequests.length);
          
          setAssistanceRequests(allNonHoldsRequests);
          
          // Notification is now handled by DashboardLayout via useAssistanceRequests hook
        }
      } else {
        console.error("🔍 [Yotpo] Assistance API error:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("🔍 [Yotpo] Error loading assistance requests:", error);
    }
  };

  useEffect(() => {
    loadAssistanceRequests();
    const interval = setInterval(loadAssistanceRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load overview data when overview section is active
  useEffect(() => {
    if (activeSection === "overview") {
      loadOverviewData();
    }
  }, [activeSection]);

  // Check for password change requirement
  useEffect(() => {
    const checkPasswordChange = async () => {
      try {
        const res = await fetch('/api/auth/check-password-change');
        const data = await res.json();
        if (data.mustChangePassword) {
          setShowPasswordModal(true);
        }
      } catch (error) {
        console.error('Error checking password change:', error);
      }
    };
    checkPasswordChange();
  }, []);

  // Header actions
  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <SmallButton 
        onClick={() => window.location.href = '/agent'}
        className="bg-green-600 hover:bg-green-700"
      >
        Switch to Agent
      </SmallButton>
      <SmallButton 
        onClick={() => {
          localStorage.removeItem('agentEmail');
          localStorage.removeItem('currentRole');
          window.location.href = '/login';
        }}
        className="bg-red-600 hover:bg-red-700"
      >
        Logout
      </SmallButton>
    </>
  );

  return (
    <DashboardLayout headerActions={headerActions}>

      {/* Auto Logout Warning - Handled by useAutoLogout hook */}


      {/* Content Sections */}
      <div className="space-y-8 mt-8">
        {/* Overview Section */}
        {activeSection === "overview" && (
          <div className="space-y-8">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">⭐ Yotpo Overview</h3>
                <SmallButton onClick={loadOverviewData} disabled={overviewLoading} className="bg-blue-600 hover:bg-blue-700">
                  {overviewLoading ? "Loading..." : "Refresh"}
                </SmallButton>
              </div>
              
              {/* Progress Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg p-4 border border-blue-500/30">
                  <div className="text-blue-400 text-sm font-medium">Progress</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.progressPercentage}% done</div>
                  <div className="mt-2">
                    <ProgressBar value={overviewData.progressPercentage} />
                  </div>
                  <div className="text-xs text-white/40 mt-2">Pending {overviewData.pendingCount} • Completed {overviewData.totalCompletedCount}</div>
                </div>
                
                <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 rounded-lg p-4 border border-yellow-500/30">
                  <div className="text-yellow-400 text-sm font-medium">Pending</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.pendingCount}</div>
                  <div className="text-xs text-white/40 mt-1">Awaiting assignment</div>
                </div>
                
                <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-lg p-4 border border-green-500/30">
                  <div className="text-green-400 text-sm font-medium">Completed Today</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.completedTodayCount}</div>
                  <div className="text-xs text-white/40 mt-1">Finished today</div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg p-4 border border-purple-500/30">
                  <div className="text-purple-400 text-sm font-medium">In Progress</div>
                  <div className="text-2xl font-bold mt-1">{overviewData.inProgressCount}</div>
                  <div className="text-xs text-white/40 mt-1">Currently being worked on</div>
                </div>
              </div>

              {/* Last Import Info */}
              {overviewData.lastImport && (
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <h4 className="text-md font-semibold mb-2">📥 Last Import</h4>
                  <div className="text-sm text-white/80">
                    <div>Date: {new Date(overviewData.lastImport.date).toLocaleString()}</div>
                    <div>Imported: {overviewData.lastImport.imported} tasks</div>
                    {overviewData.lastImport.duplicates > 0 && (
                      <div className="text-yellow-400">Duplicates found: {overviewData.lastImport.duplicates}</div>
                    )}
                    {overviewData.lastImport.errors > 0 && (
                      <div className="text-red-400">Errors: {overviewData.lastImport.errors}</div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Task Management Section */}
        {activeSection === "tasks" && (
          <div className="space-y-8">
            <CsvImportSection />
            <AssignTasksSection />
            <PendingTasksSection />
          </div>
        )}

        {/* Assistance Requests Section */}
        {activeSection === "assistance" && (
          <div className="space-y-8">
            <AssistanceRequestsSection 
              taskType="YOTPO" 
              onPendingCountChange={(count) => {
                const previousCount = assistanceRequests.filter((r: any) => r.status === 'ASSISTANCE_REQUIRED').length;
                // Update badge count
                setAssistanceRequests((prev: any[]) => {
                  // Create a dummy array with the right count for badge calculation
                  const newArray = Array(count).fill({ status: 'ASSISTANCE_REQUIRED' });
                  return newArray as any[];
                });
                // Show notification if count increased
                if (count > 0 && (previousCount === 0 || count > previousCount)) {
                  // Notification is now handled by DashboardLayout
                }
              }}
            />
          </div>
        )}

        {/* Agent Management Section */}
        {activeSection === "agents" && (
          <Card className="p-6">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-xl font-semibold text-white mb-2">Agent Management</h3>
              <p className="text-white/60">Agent progress tracking for Yotpo tasks coming soon</p>
            </div>
          </Card>
        )}

        {/* Form Submissions Report */}
        {activeSection === "submissions" && (
          <SubmissionsReport />
        )}

        {/* Analytics Section */}
        {activeSection === "analytics" && (
          <div className="space-y-8">
            <YotpoAnalytics />
          </div>
        )}

        {/* Settings Section */}
      </div>

      {/* Password Change Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false);
          window.location.reload();
        }}
      />
    </DashboardLayout>
  );
}

// Export with provider wrapper
export default function YotpoPage() {
  return (
    <DashboardNavigationProvider>
      <YotpoPageContent />
    </DashboardNavigationProvider>
  );
}
