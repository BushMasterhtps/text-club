"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface ResolvedTask {
  id: string;
  orderNumber: string;
  customerEmail: string;
  orderDate: string;
  priority: number;
  finalQueue: string;
  disposition: string;
  agentName: string;
  agentEmail: string;
  completedDate: string;
  duration: number;
  queueTimes: Record<string, number>;
  queueHistory: any[];
  orderAmount: number;
  notes: string;
}

interface DispositionStats {
  disposition: string;
  count: number;
  totalAmount: number;
  avgAmount: number;
}

interface AgentStats {
  agentName: string;
  agentEmail: string;
  totalResolved: number;
  totalAmountSaved: number;
  avgResolutionTime: number;
  dispositions: Record<string, { count: number; amount: number }>;
}

export default function ResolvedOrdersReportWithComments() {
  const [tasks, setTasks] = useState<ResolvedTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<ResolvedTask | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7); // Default: last 7 days
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedDisposition, setSelectedDisposition] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Agents list
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    loadData();
  }, [startDate, endDate, selectedAgent, selectedDisposition]);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedAgent !== 'all') params.append('agentId', selectedAgent);
      if (selectedDisposition !== 'all') params.append('disposition', selectedDisposition);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(`/api/holds/resolved-report?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setTasks(data.data.tasks);
        setTotal(data.data.total);
      }
    } catch (error) {
      console.error('Error loading resolved orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedAgent !== 'all') params.append('agentId', selectedAgent);
      if (selectedDisposition !== 'all') params.append('disposition', selectedDisposition);
      if (searchQuery) params.append('search', searchQuery);
      params.append('export', 'true');
      params.append('includeComments', 'true');
      
      const response = await fetch(`/api/holds/resolved-report?${params.toString()}`);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holds-resolved-report-with-comments-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('✅ Report exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const toggleRow = (taskId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedRows(newExpanded);
  };

  const openModal = (task: ResolvedTask) => {
    setSelectedTask(task);
    setShowModal(true);
  };

  // Calculate disposition stats
  const dispositionStats: DispositionStats[] = Object.entries(
    tasks.reduce((acc, task) => {
      const disp = task.disposition || 'Unknown';
      if (!acc[disp]) {
        acc[disp] = { count: 0, totalAmount: 0 };
      }
      acc[disp].count++;
      // Ensure orderAmount is parsed as a number
      const amount = typeof task.orderAmount === 'number' ? task.orderAmount : parseFloat(String(task.orderAmount || 0)) || 0;
      acc[disp].totalAmount += amount;
      return acc;
    }, {} as Record<string, { count: number; totalAmount: number }>)
  ).map(([disposition, data]) => ({
    disposition,
    count: data.count,
    totalAmount: data.totalAmount,
    avgAmount: data.count > 0 ? data.totalAmount / data.count : 0
  })).sort((a, b) => b.totalAmount - a.totalAmount);

  // Calculate agent stats
  const agentStats: AgentStats[] = Object.entries(
    tasks.reduce((acc, task) => {
      const agentKey = task.agentEmail || 'unassigned';
      if (!acc[agentKey]) {
        acc[agentKey] = {
          agentName: task.agentName || 'Unassigned',
          agentEmail: task.agentEmail || '',
          totalResolved: 0,
          totalAmountSaved: 0,
          totalDuration: 0,
          dispositions: {}
        };
      }
      acc[agentKey].totalResolved++;
      // Ensure orderAmount is parsed as a number
      const amount = typeof task.orderAmount === 'number' ? task.orderAmount : parseFloat(String(task.orderAmount || 0)) || 0;
      acc[agentKey].totalAmountSaved += amount;
      acc[agentKey].totalDuration += typeof task.duration === 'number' ? task.duration : parseFloat(String(task.duration || 0)) || 0;
      
      const disp = task.disposition || 'Unknown';
      if (!acc[agentKey].dispositions[disp]) {
        acc[agentKey].dispositions[disp] = { count: 0, amount: 0 };
      }
      acc[agentKey].dispositions[disp].count++;
      acc[agentKey].dispositions[disp].amount += amount;
      
      return acc;
    }, {} as Record<string, any>)
  ).map(([_, data]) => ({
    agentName: data.agentName,
    agentEmail: data.agentEmail,
    totalResolved: data.totalResolved,
    totalAmountSaved: data.totalAmountSaved,
    avgResolutionTime: data.totalResolved > 0 ? data.totalDuration / data.totalResolved : 0,
    dispositions: data.dispositions
  })).sort((a, b) => b.totalResolved - a.totalResolved);

  const uniqueDispositions = Array.from(new Set(tasks.map(t => t.disposition))).filter(Boolean);

  return (
    <Card>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">📊 Resolved Orders Report with Comments</h2>
        <p className="text-white/60 text-sm">
          View resolved orders with comments, dollar amounts saved, and agent performance stats
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm text-white/60 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Agent</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">All Agents</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name || agent.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Disposition</label>
          <select
            value={selectedDisposition}
            onChange={(e) => setSelectedDisposition(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">All Dispositions</option>
            {uniqueDispositions.map(disp => (
              <option key={disp} value={disp}>
                {disp}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <label className="block text-sm text-white/60 mb-1">Search</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by order number or email..."
            className="flex-1 px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <SmallButton 
            onClick={loadData}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Searching...' : 'Search'}
          </SmallButton>
          <SmallButton 
            onClick={handleExport}
            disabled={exporting || tasks.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {exporting ? 'Exporting...' : '📥 Export CSV'}
          </SmallButton>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-blue-200 mb-1">Total Resolved</h3>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>
        <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-green-200 mb-1">Total Amount Saved</h3>
          <p className="text-2xl font-bold text-white">
            ${tasks.reduce((sum, t) => {
              const amount = typeof t.orderAmount === 'number' ? t.orderAmount : parseFloat(String(t.orderAmount || 0)) || 0;
              return sum + amount;
            }, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-purple-200 mb-1">Avg Resolution Time</h3>
          <p className="text-2xl font-bold text-white">
            {formatDuration(Math.round(tasks.reduce((sum, t) => {
              const duration = typeof t.duration === 'number' ? t.duration : parseFloat(String(t.duration || 0)) || 0;
              return sum + duration;
            }, 0) / (tasks.length || 1)))}
          </p>
        </div>
      </div>

      {/* Disposition Breakdown */}
      {dispositionStats.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">💰 Dollar Amount Saved by Disposition</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-white/60">
                  <th className="px-3 py-2">Disposition</th>
                  <th className="px-3 py-2">Count</th>
                  <th className="px-3 py-2">Total Amount</th>
                  <th className="px-3 py-2">Avg Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {dispositionStats.map((stat) => (
                  <tr key={stat.disposition} className="hover:bg-white/5">
                    <td className="px-3 py-2 text-white">{stat.disposition}</td>
                    <td className="px-3 py-2 text-white">{stat.count}</td>
                    <td className="px-3 py-2 text-green-300 font-semibold">
                      ${stat.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-white/80">
                      ${stat.avgAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Stats */}
      {agentStats.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">👥 Agent Performance Stats</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-white/60">
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Total Resolved</th>
                  <th className="px-3 py-2">Total Amount Saved</th>
                  <th className="px-3 py-2">Avg Resolution Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {agentStats.map((stat) => (
                  <tr key={stat.agentEmail} className="hover:bg-white/5">
                    <td className="px-3 py-2 text-white">{stat.agentName}</td>
                    <td className="px-3 py-2 text-white">{stat.totalResolved}</td>
                    <td className="px-3 py-2 text-green-300 font-semibold">
                      ${stat.totalAmountSaved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-white/80">{formatDuration(Math.round(stat.avgResolutionTime))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-200">
          Found {total} resolved orders
        </p>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="text-center py-8 text-white/60">Loading resolved orders...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          No resolved orders found for the selected filters
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-white/60">
                <th className="px-3 py-2">Order #</th>
                <th className="px-3 py-2">Customer Email</th>
                <th className="px-3 py-2">Disposition</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Comments</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map(task => (
                <React.Fragment key={task.id}>
                  <tr className="hover:bg-white/5">
                    <td className="px-3 py-2 text-white font-mono text-xs">
                      {task.orderNumber || 'N/A'}
                    </td>
                    <td className="px-3 py-2 text-white/80 text-xs">
                      {task.customerEmail || 'N/A'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                        {task.disposition}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/80 text-xs">
                      {task.agentName}
                    </td>
                    <td className="px-3 py-2 text-green-300 font-semibold text-xs">
                      ${(typeof task.orderAmount === 'number' ? task.orderAmount : parseFloat(String(task.orderAmount || 0)) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-white/80 text-xs">
                      {task.completedDate ? new Date(task.completedDate).toLocaleString('en-US', { 
                        timeZone: 'America/Los_Angeles',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                      }) : 'N/A'}
                    </td>
                    <td className="px-3 py-2 text-white/80">
                      {formatDuration(task.duration || 0)}
                    </td>
                    <td className="px-3 py-2">
                      {task.notes ? (
                        <button
                          onClick={() => toggleRow(task.id)}
                          className="text-blue-400 hover:text-blue-300 text-xs underline"
                        >
                          {expandedRows.has(task.id) ? 'Hide' : 'Show'} Comments
                        </button>
                      ) : (
                        <span className="text-white/40 text-xs">No comments</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => openModal(task)}
                        className="text-blue-400 hover:text-blue-300 text-xs underline"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                  {expandedRows.has(task.id) && task.notes && (
                    <tr>
                      <td colSpan={9} className="px-3 py-3 bg-white/5">
                        <div className="text-sm text-white/90 whitespace-pre-wrap">
                          <strong className="text-white">Comments:</strong>
                          <div className="mt-2 p-3 bg-blue-900/20 rounded border border-blue-500/30">
                            {task.notes}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-white">Order Details</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-white/60">Order Number:</span>
                <span className="text-white ml-2 font-mono">{selectedTask.orderNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-white/60">Customer Email:</span>
                <span className="text-white ml-2">{selectedTask.customerEmail || 'N/A'}</span>
              </div>
              <div>
                <span className="text-white/60">Disposition:</span>
                <span className="text-green-300 ml-2">{selectedTask.disposition}</span>
              </div>
              <div>
                <span className="text-white/60">Agent:</span>
                <span className="text-white ml-2">{selectedTask.agentName}</span>
              </div>
              <div>
                <span className="text-white/60">Order Amount:</span>
                <span className="text-green-300 ml-2 font-semibold">
                  ${(typeof selectedTask.orderAmount === 'number' ? selectedTask.orderAmount : parseFloat(String(selectedTask.orderAmount || 0)) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-white/60">Completed:</span>
                <span className="text-white ml-2">
                  {selectedTask.completedDate ? new Date(selectedTask.completedDate).toLocaleString('en-US', { 
                    timeZone: 'America/Los_Angeles',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                  }) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-white/60">Duration:</span>
                <span className="text-white ml-2">{formatDuration(selectedTask.duration || 0)}</span>
              </div>
              
              {selectedTask.notes && (
                <div>
                  <span className="text-white/60 block mb-2">Comments:</span>
                  <div className="p-3 bg-blue-900/20 rounded border border-blue-500/30 text-white/90 whitespace-pre-wrap">
                    {selectedTask.notes}
                  </div>
                </div>
              )}
              
              {selectedTask.queueHistory && selectedTask.queueHistory.length > 0 && (
                <div>
                  <span className="text-white/60 block mb-2">Queue Journey:</span>
                  <div className="space-y-2">
                    {selectedTask.queueHistory.map((entry: any, idx: number) => (
                      <div key={idx} className="p-2 bg-white/5 rounded text-xs">
                        <div className="text-white">{entry.queue || 'Unknown'}</div>
                        {entry.enteredAt && (
                          <div className="text-white/60">
                            Entered: {new Date(entry.enteredAt).toLocaleString('en-US', { 
                              timeZone: 'America/Los_Angeles',
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}
                          </div>
                        )}
                        {entry.exitedAt && (
                          <div className="text-white/60">
                            Exited: {new Date(entry.exitedAt).toLocaleString('en-US', { 
                              timeZone: 'America/Los_Angeles',
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

