"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { DeleteConfirmationModal } from "@/app/_components/DeleteConfirmationModal";

interface QueueData {
  total: number;
  aging: number;
  approaching: number;
  tasks: any[];
}

interface QueueStats {
  [key: string]: QueueData;
}

export default function AssemblyLineQueues() {
  const [queueStats, setQueueStats] = useState<QueueStats>({});
  const [loading, setLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Range selection with shift+click support
  // Note: We'll create a new selection hook for each queue when it's selected
  const [currentQueueTasks, setCurrentQueueTasks] = useState<any[]>([]);
  const {
    selected: selectedTasks,
    selectedCount,
    toggleSelection,
    clearSelection,
    selectAll: selectAllItems,
    isSelected,
    setSelected,
  } = useRangeSelection(currentQueueTasks, (task) => task.id);
  
  // Check if current queue is assignable (not Duplicates or Completed)
  const isAssignableQueue = selectedQueue && 
    selectedQueue !== 'Duplicates' && 
    selectedQueue !== 'Completed';
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedJourneys, setExpandedJourneys] = useState<Set<string>>(new Set());
  const tasksPerPage = 50;
  
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

  const queueColors = {
    'Agent Research': 'bg-blue-900/20 border-blue-500/30',
    'Customer Contact': 'bg-yellow-900/20 border-yellow-500/30',
    'Escalated Call 4+ Day': 'bg-red-900/20 border-red-500/30',
    'Duplicates': 'bg-purple-900/20 border-purple-500/30',
    'Completed': 'bg-green-900/20 border-green-500/30',
  };

  useEffect(() => {
    fetchQueueStats();
    fetchAgents();
  }, []);

  const fetchQueueStats = async () => {
    try {
      console.log('Fetching queue stats...');
      const response = await fetch('/api/holds/queues');
      const data = await response.json();
      
      console.log('Queue stats API response:', data);
      
      if (data.success && data.data && data.data.queues) {
        setQueueStats(data.data.queues);
        console.log('Queue stats loaded:', data.data.queues);
      } else {
        console.error('Invalid queue stats response:', data);
        setQueueStats({});
      }
    } catch (error) {
      console.error('Error fetching queue stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/manager/agents');
      const data = await response.json();
      if (data.success && data.agents) {
        setAgents(data.agents.filter((agent: any) => agent.isLive));
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const assignTask = async (taskId: string, agentId: string) => {
    try {
      setAssigningTaskId(taskId);
      const response = await fetch('/api/holds/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: [taskId], agentId }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh queue stats
        await fetchQueueStats();
        alert('Task assigned successfully!');
      } else {
        alert(`Error: ${data.error || 'Failed to assign task'}`);
      }
    } catch (error) {
      console.error('Error assigning task:', error);
      alert('Failed to assign task');
    } finally {
      setAssigningTaskId(null);
    }
  };

  const bulkAssign = async (agentId: string) => {
    if (selectedTasks.size === 0) {
      alert('Please select at least one task');
      return;
    }
    
    try {
      setBulkAssigning(true);
      const response = await fetch('/api/holds/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          taskIds: Array.from(selectedTasks), 
          agentId 
        }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchQueueStats();
        clearSelection();
        alert(`Successfully assigned ${data.data.assigned} tasks!`);
      } else {
        alert(`Error: ${data.error || 'Failed to assign tasks'}`);
      }
    } catch (error) {
      console.error('Error assigning tasks:', error);
      alert('Failed to assign tasks');
    } finally {
      setBulkAssigning(false);
    }
  };

  const bulkUnassign = async () => {
    if (selectedTasks.size === 0) {
      alert('Please select at least one task');
      return;
    }
    
    if (!confirm(`Unassign ${selectedTasks.size} task(s)?`)) {
      return;
    }
    
    try {
      setBulkAssigning(true);
      const response = await fetch('/api/holds/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: Array.from(selectedTasks) }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchQueueStats();
        clearSelection();
        alert(`Successfully unassigned ${data.data.unassigned} tasks!`);
      } else {
        alert(`Error: ${data.error || 'Failed to unassign tasks'}`);
      }
    } catch (error) {
      console.error('Error unassigning tasks:', error);
      alert('Failed to unassign tasks');
    } finally {
      setBulkAssigning(false);
    }
  };

  async function handleDeleteTasks(taskIds: string[]) {
    if (taskIds.length === 0) return;
    
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/manager/tasks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: taskIds }),
      });
      const data = await res.json().catch(() => null);
      
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to delete tasks");
        return;
      }

      let message = `✅ Successfully deleted ${data.deletedCount} task(s)`;
      if (data.skippedCount > 0) {
        message += `\n⚠️ Skipped ${data.skippedCount} task(s) (${data.skippedTasks.map((t: any) => t.reason).join(', ')})`;
      }
      alert(message);

      clearSelection();
      await fetchQueueStats();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete tasks");
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
      setPendingDeleteIds([]);
    }
  }

  const handleBulkDelete = () => {
    if (selectedCount === 0) return;
    setPendingDeleteIds(Array.from(selectedTasks));
    setShowDeleteModal(true);
  };

  const handleSingleDelete = (taskId: string) => {
    setPendingDeleteIds([taskId]);
    setShowDeleteModal(true);
  };

  const toggleSelectAll = (tasks: any[]) => {
    const paginatedTasks = getPaginatedTasks(tasks);
    const paginatedTaskIds = paginatedTasks.map(t => t.id);
    
    const allSelected = paginatedTaskIds.every(id => isSelected(id));
    
    if (allSelected) {
      // Deselect all on current page
      const newSelected = new Set(selectedTasks);
      paginatedTaskIds.forEach(id => newSelected.delete(id));
      setSelected(newSelected);
    } else {
      // Select all on current page
      const newSelected = new Set(selectedTasks);
      paginatedTaskIds.forEach(id => newSelected.add(id));
      setSelected(newSelected);
    }
  };

  const toggleJourney = (taskId: string) => {
    const newExpanded = new Set(expandedJourneys);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedJourneys(newExpanded);
  };

  const handleQueueClick = (queueName: string) => {
    setSelectedQueue(selectedQueue === queueName ? null : queueName);
    setCurrentPage(1); // Reset to page 1 when switching queues
    clearSelection(); // Clear selections
  };
  
  // Update current queue tasks when queue or tasks change
  useEffect(() => {
    if (selectedQueue && queueStats[selectedQueue]) {
      const tasks = queueStats[selectedQueue].tasks;
      const filtered = !searchQuery.trim() 
        ? tasks 
        : tasks.filter(task => {
            const query = searchQuery.toLowerCase();
            return task.holdsOrderNumber?.toLowerCase().includes(query) ||
                   task.holdsCustomerEmail?.toLowerCase().includes(query) ||
                   (task.holdsOrderDate && new Date(task.holdsOrderDate).toLocaleDateString().includes(query));
          });
      setCurrentQueueTasks(filtered);
    } else {
      setCurrentQueueTasks([]);
    }
  }, [selectedQueue, queueStats, searchQuery]);

  const runAutoEscalation = async () => {
    if (!confirm('Auto-escalate all tasks that are 4+ days old to Escalated Call queue?')) {
      return;
    }
    
    try {
      setEscalating(true);
      const response = await fetch('/api/holds/auto-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Auto-escalated ${data.escalated} task(s)!`);
        await fetchQueueStats(); // Refresh to show updated queues
      } else {
        alert(`Error: ${data.error || 'Failed to auto-escalate'}`);
      }
    } catch (error) {
      console.error('Error running auto-escalation:', error);
      alert('Failed to run auto-escalation');
    } finally {
      setEscalating(false);
    }
  };

  // Filter tasks by search query
  const getFilteredTasks = (tasks: any[]) => {
    if (!searchQuery.trim()) return tasks;
    
    const query = searchQuery.toLowerCase();
    return tasks.filter(task => 
      task.holdsOrderNumber?.toLowerCase().includes(query) ||
      task.holdsCustomerEmail?.toLowerCase().includes(query) ||
      (task.holdsOrderDate && new Date(task.holdsOrderDate).toLocaleDateString().includes(query))
    );
  };

  // Paginate tasks
  const getPaginatedTasks = (tasks: any[]) => {
    const startIndex = (currentPage - 1) * tasksPerPage;
    const endIndex = startIndex + tasksPerPage;
    return tasks.slice(startIndex, endIndex);
  };

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">🏭 Assembly Line Queues</h2>
        <div className="text-white/60">Loading queue data...</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            <span className="text-xl">{isExpanded ? '▼' : '▶'}</span>
            <div className="text-left">
              <h2 className="text-xl font-semibold">🏭 Workflow Queues</h2>
              <p className="text-white/70 mt-1 text-sm">
                Visualize and manage tasks across different holds queues. Click to {isExpanded ? 'collapse' : 'expand'}.
              </p>
            </div>
          </button>
          {isExpanded && (
            <SmallButton 
              onClick={runAutoEscalation}
              disabled={escalating}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {escalating ? '⏳ Escalating...' : '🚨 Auto-Escalate 4+ Days'}
            </SmallButton>
          )}
        </div>
        
        {isExpanded && (
          <>
        
        {/* Search Bar */}
        <div className="mb-6">
          <label className="block text-sm text-white/60 mb-2">🔍 Search Orders</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order number, email, or date..."
              className="flex-1 px-3 py-2 bg-white/10 rounded-md text-white text-sm placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white text-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(queueStats).map(([queueName, stats]) => {
            const colorClass = queueColors[queueName as keyof typeof queueColors] || 'bg-gray-900/20 border-gray-500/30';
            const isSelected = selectedQueue === queueName;
            
            return (
              <div
                key={queueName}
                className={`p-4 rounded-lg border cursor-pointer transition-all hover:scale-105 ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                } ${colorClass}`}
                onClick={() => handleQueueClick(queueName)}
              >
                <h3 className="font-semibold text-white mb-2">{queueName}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/70">Total:</span>
                    <span className="text-white font-medium">{stats.total}</span>
                  </div>
                  {/* Only show approaching count for Agent Research and Customer Contact */}
                  {(queueName === 'Agent Research' || queueName === 'Customer Contact') && (
                    <div className="flex justify-between">
                      <span className="text-white/70">Approaching 4 days:</span>
                      <span className="text-yellow-300 font-medium">{stats.approaching}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
          </>
        )}
      </Card>

      {isExpanded && selectedQueue && queueStats[selectedQueue] && (() => {
        const filteredTasks = getFilteredTasks(queueStats[selectedQueue].tasks);
        const paginatedTasks = getPaginatedTasks(filteredTasks);
        const totalPages = Math.ceil(filteredTasks.length / tasksPerPage);
        const allOnPageSelected = paginatedTasks.every(t => isSelected(t.id));
        const isAssignable = selectedQueue !== 'Duplicates' && selectedQueue !== 'Completed';
        
        return (
          <Card>
            {/* Header with bulk actions */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {selectedQueue} - Task Details
                {searchQuery && (
                  <span className="text-sm font-normal text-white/60 ml-2">
                    ({filteredTasks.length} of {queueStats[selectedQueue].tasks.length} matching)
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-4">
                {selectedCount > 0 && isAssignable && (
                  <div className="text-sm text-white/70">
                    {selectedCount} task(s) selected
                  </div>
                )}
                {/* Pagination info */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-white/60">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-1">
                      <SmallButton
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        ←
                      </SmallButton>
                      <SmallButton
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        →
                      </SmallButton>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Selection counter and help text - only for assignable queues */}
            {selectedCount > 0 && isAssignable && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm">
                    {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-xs text-white/60">
                    💡 Tip: Click a task, hold Shift, and click another to select a range
                  </span>
                </div>
              </div>
            )}

            {/* Bulk assignment controls - only for assignable queues */}
            {filteredTasks.length > 0 && isAssignable && (
              <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected && paginatedTasks.length > 0}
                      onChange={() => toggleSelectAll(filteredTasks)}
                      className="w-4 h-4 rounded"
                    />
                    Select All on Page
                  </label>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60">Assign selected to:</span>
                    <select
                      className="px-3 py-1.5 bg-white/10 rounded text-sm text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onChange={(e) => {
                        if (e.target.value) {
                          bulkAssign(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      disabled={bulkAssigning || selectedCount === 0}
                    >
                      <option value="">Select agent...</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    
                    <SmallButton
                      onClick={bulkUnassign}
                      disabled={bulkAssigning || selectedCount === 0}
                      className="text-red-400 hover:text-red-300"
                    >
                      Unassign Selected
                    </SmallButton>
                    
                    <SmallButton
                      onClick={handleBulkDelete}
                      disabled={selectedCount === 0 || deleteLoading}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {deleteLoading ? 'Deleting...' : 'Delete Selected'}
                    </SmallButton>
                  </div>
                  
                  {(bulkAssigning || deleteLoading) && (
                    <span className="text-sm text-white/60">Processing...</span>
                  )}
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            <DeleteConfirmationModal
              isOpen={showDeleteModal}
              taskCount={pendingDeleteIds.length}
              onConfirm={() => handleDeleteTasks(pendingDeleteIds)}
              onCancel={() => {
                setShowDeleteModal(false);
                setPendingDeleteIds([]);
              }}
            />
            
            <div className="space-y-3">
              {paginatedTasks.map((task) => {
                // Find the index in the full filtered tasks array for range selection
                const taskIndex = filteredTasks.findIndex(t => t.id === task.id);
                return (
              <div
                key={task.id}
                className="p-3 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="flex justify-between items-start gap-4">
                  {/* Checkbox for selection - only for assignable queues */}
                  <div className="flex items-start gap-3 flex-1">
                    {isAssignable ? (
                      <input
                        type="checkbox"
                        checked={isSelected(task.id)}
                        onChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelection(task.id, taskIndex, e);
                        }}
                        className="w-4 h-4 mt-1 rounded"
                      />
                    ) : (
                      <div className="w-4 h-4 mt-1" /> // Spacer for non-assignable queues
                    )}
                    <div className="flex-1">
                    <p className="font-medium text-white">
                      {task.text?.replace('Holds - ', '') || 'Unknown Customer'}
                    </p>
                    <p className="text-sm text-white/60">
                      Order: {task.holdsOrderNumber || 'N/A'}
                    </p>
                    <p className="text-sm text-white/60">
                      Email: {task.holdsCustomerEmail || 'N/A'}
                    </p>
                    
                    {/* Time in Queue */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-white/50">⏱️ Time in queue:</span>
                      <span className={`text-xs font-medium ${
                        task.hoursInQueue >= 48 
                          ? 'text-red-400' 
                          : task.hoursInQueue >= 36 
                          ? 'text-yellow-400'
                          : 'text-green-400'
                      }`}>
                        {task.hoursInQueue || 0}h
                      </span>
                      {task.hoursInQueue >= 48 && (
                        <span className="text-xs bg-red-900/50 text-red-200 px-2 py-0.5 rounded">
                          Needs Assignment!
                        </span>
                      )}
                    </div>
                    
                    {/* Order Amount - Show for Completed queue */}
                    {task.holdsOrderAmount && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-white/50">💰 Order Amount:</span>
                        <span className="text-xs font-medium text-green-400">
                          ${typeof task.holdsOrderAmount === 'number' 
                            ? task.holdsOrderAmount.toFixed(2) 
                            : parseFloat(task.holdsOrderAmount).toFixed(2)}
                        </span>
                      </div>
                    )}
                    
                    {/* Queue Journey/History */}
                    {task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory) && task.holdsQueueHistory.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-white/50">📍 Queue Journey:</div>
                          <button
                            onClick={() => toggleJourney(task.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {expandedJourneys.has(task.id) ? '🔽 Hide Journey' : '▶️ Show Journey'}
                          </button>
                        </div>
                        {expandedJourneys.has(task.id) && (
                        <div className="space-y-2">
                          {task.holdsQueueHistory.map((entry: any, idx: number) => {
                            const enteredDate = entry.enteredAt ? new Date(entry.enteredAt) : null;
                            const exitedDate = entry.exitedAt ? new Date(entry.exitedAt) : null;
                            const durationMs = enteredDate && exitedDate 
                              ? exitedDate.getTime() - enteredDate.getTime()
                              : enteredDate 
                              ? new Date().getTime() - enteredDate.getTime()
                              : 0;
                            const hours = Math.floor(durationMs / (1000 * 60 * 60));
                            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                            const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                            
                            return (
                              <div key={idx} className="text-xs bg-white/5 rounded p-2 border-l-2 border-blue-500/50">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">{idx + 1}. {entry.queue}</span>
                                    {entry.source && (
                                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                                        entry.source === 'Auto-Import' 
                                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      }`}>
                                        {entry.source === 'Auto-Import' ? '📥 Auto' : '👤 Agent'}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-xs ${exitedDate ? 'text-white/50' : 'text-green-400 font-medium'}`}>
                                    {exitedDate ? durationText : `${durationText} (current)`}
                                  </span>
                                </div>
                                {entry.movedBy && (
                                  <div className="text-white/60">
                                    👤 {entry.movedBy}
                                  </div>
                                )}
                                {entry.disposition && (
                                  <div className="text-white/60">
                                    📋 Disposition: {entry.disposition}
                                  </div>
                                )}
                                {enteredDate && (
                                  <div className="text-white/50">
                                    ⏰ {enteredDate.toLocaleString()}
                                  </div>
                                )}
                                {entry.note && (
                                  <div className="text-white/50 italic">
                                    💬 {entry.note}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right space-y-2">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      task.aging?.daysSinceOrder >= 4
                        ? 'bg-red-900/50 text-red-200' 
                        : task.aging?.daysSinceOrder === 3
                        ? 'bg-yellow-900/50 text-yellow-200'
                        : 'bg-green-900/50 text-green-200'
                    }`}>
                      {task.aging?.daysSinceOrder || 0} days
                    </div>
                    <p className="text-xs text-white/50">
                      Priority: {task.holdsPriority === 1 || task.holdsPriority === 2 ? '👑 White Glove' : '📦 Normal'}
                    </p>
                  </div>
                </div>
                
                {/* Assignment Section */}
                <div className="mt-3 pt-3 border-t border-white/10">
                  {task.assignedTo ? (
                    <div className="text-xs text-blue-300">
                      ✅ Assigned to: <span className="font-medium">{task.assignedTo.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/60">Assign to:</span>
                      <select
                        className="flex-1 px-2 py-1 bg-white/10 rounded text-xs text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => {
                          if (e.target.value) {
                            assignTask(task.id, e.target.value);
                            e.target.value = ''; // Reset
                          }
                        }}
                        disabled={assigningTaskId === task.id}
                      >
                        <option value="">Select agent...</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                      {assigningTaskId === task.id && (
                        <span className="text-xs text-white/60">Assigning...</span>
                      )}
                    </div>
                  )}
                  
                  {/* Delete button for assignable queues */}
                  {isAssignable && (
                    <div className="mt-2">
                      <SmallButton
                        onClick={() => handleSingleDelete(task.id)}
                        disabled={deleteLoading}
                        className="bg-red-600 hover:bg-red-700 text-xs px-2 py-1 w-full"
                      >
                        Delete
                      </SmallButton>
                    </div>
                  )}
                </div>
              </div>
              </div>
              );
              })}
              {filteredTasks.length === 0 && (
                <p className="text-center text-white/60 py-4">
                  No tasks match your search
                </p>
              )}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                <div className="text-sm text-white/60">
                  Page {currentPage} of {totalPages} ({filteredTasks.length} total tasks)
                </div>
                <div className="flex gap-2">
                  <SmallButton
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Previous
                  </SmallButton>
                  <SmallButton
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </SmallButton>
                </div>
              </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
}
