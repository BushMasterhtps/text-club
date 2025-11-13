"use client";

import { useState, useEffect } from "react";
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
}

export default function ResolvedOrdersReport() {
  const [tasks, setTasks] = useState<ResolvedTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
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
      
      const response = await fetch(`/api/holds/resolved-report?${params.toString()}`);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holds-resolved-report-${new Date().toISOString().split('T')[0]}.csv`;
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

  const uniqueDispositions = Array.from(new Set(tasks.map(t => t.disposition))).filter(Boolean);

  return (
    <Card>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">📊 Resolved Orders Report</h2>
        <p className="text-white/60 text-sm">
          View and export completed holds tasks with timeline and disposition details
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
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Queue Times</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map(task => (
                <tr key={task.id} className="hover:bg-white/5">
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
                  <td className="px-3 py-2 text-white/80 text-xs">
                    {task.completedDate ? new Date(task.completedDate).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-white/80">
                    {formatDuration(task.duration || 0)}
                  </td>
                  <td className="px-3 py-2 text-white/60 text-xs">
                    <div className="space-y-1">
                      {Object.entries(task.queueTimes).map(([queue, time]) => (
                        <div key={queue} className="flex justify-between gap-2">
                          <span className="text-white/40">{queue.substring(0, 12)}:</span>
                          <span>{formatDuration(time as number)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

