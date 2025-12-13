import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { useRangeSelection } from "@/hooks/useRangeSelection";

interface WodIvcsTask {
  id: string;
  brand: string | null;
  customerName: string | null;
  documentNumber: string | null;
  webOrder: string | null;
  amount: number | null;
  webOrderDifference: number | null;
  nsVsWebDiscrepancy: number | null;
  netSuiteTotal: number | null;
  webTotal: number | null;
  webVsNsDifference: number | null;
  shippingCountry: string | null;
  shippingState: string | null;
  wodIvcsSource: string;
  status: string;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  createdAt: string;
  orderAge: string | null;
  orderAgeDays: number | null;
  // Send-back fields
  sentBackBy: string | null;
  sentBackAt: string | null;
  sentBackDisposition: string | null;
  sentBackByUser: { id: string; name: string; email: string } | null;
}

interface WodIvcsTasksSectionProps {
  taskType: string;
  onTaskAssignmentChange?: () => void;
}

export function WodIvcsTasksSection({ taskType, onTaskAssignmentChange }: WodIvcsTasksSectionProps) {
  const [tasks, setTasks] = useState<WodIvcsTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [agents, setAgents] = useState<any[]>([]);
  
  // Range selection with shift+click support
  const {
    selected: selectedTasksSet,
    selectedCount,
    toggleSelection,
    clearSelection,
    selectAll: selectAllItems,
    isSelected,
  } = useRangeSelection(tasks, (task) => task.id);
  
  const selectedTasks = Array.from(selectedTasksSet);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [assignMessage, setAssignMessage] = useState<string>("");
  
  // Text Club-style filtering states
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [assignedFilter, setAssignedFilter] = useState<string>("anyone");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [bulkUnassignLoading, setBulkUnassignLoading] = useState(false);
  
  // Review modal state
  const [selectedTaskForReview, setSelectedTaskForReview] = useState<WodIvcsTask | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("take", "50");
      params.set("skip", String((page - 1) * 50));
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      if (ageFilter !== "all") {
        params.set("ageFilter", ageFilter);
      }
      if (assignedFilter !== "anyone") {
        params.set("assignedFilter", assignedFilter);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      
      const response = await fetch(`/api/manager/tasks/wod-ivcs?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setTasks(data.items || []);
        setTotalCount(data.total || 0);
        clearSelection(); // Clear selection when tasks change
      } else {
        console.error("API returned error:", data.error);
        setTasks([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error("Error loading tasks:", error);
      setTasks([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/manager/agents');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAgents(data.agents || []);
        }
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  useEffect(() => {
    loadTasks();
    loadAgents();
  }, [page, sortBy, sortOrder, ageFilter, statusFilter, assignedFilter, searchQuery]);

  const handleSelectAll = () => {
    if (selectedTasks.length === tasks.length) {
      clearSelection();
    } else {
      selectAllItems();
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return "↕️";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  const getSourceDisplayName = (source: string) => {
    switch (source) {
      case 'INVALID_CASH_SALE':
        return 'Invalid Cash Sale';
      case 'ORDERS_NOT_DOWNLOADING':
        return 'Orders Not Downloading';
      case 'SO_VS_WEB_DIFFERENCE':
        return 'SO vs Web Difference';
      default:
        return source;
    }
  };

  const getTaskDisplayData = (task: WodIvcsTask) => {
    switch (task.wodIvcsSource) {
      case 'INVALID_CASH_SALE':
        return {
          primary: task.documentNumber || 'N/A',
          secondary: task.customerName || 'N/A',
          amount: task.amount,
          difference: task.webOrderDifference
        };
      case 'ORDERS_NOT_DOWNLOADING':
        return {
          primary: task.webOrder || 'N/A',
          secondary: task.customerName || 'N/A',
          amount: task.webOrderTotal,
          difference: task.nsVsWebDiscrepancy
        };
      case 'SO_VS_WEB_DIFFERENCE':
        return {
          primary: task.webOrder || 'N/A',
          secondary: task.customerName || 'N/A',
          amount: task.netSuiteTotal,
          difference: task.webVsNsDifference
        };
      default:
        return {
          primary: 'N/A',
          secondary: 'N/A',
          amount: null,
          difference: null
        };
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Bulk assignment functions
  const handleBulkAssign = async (agentId: string) => {
    if (selectedTasks.length === 0) return;
    
    setBulkAssignLoading(true);
    try {
      const response = await fetch('/api/manager/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ids: selectedTasks, 
          agentId: agentId
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAssignMessage(`✅ ${selectedTasks.length} tasks assigned successfully`);
        clearSelection();
        loadTasks();
        onTaskAssignmentChange?.();
        setTimeout(() => setAssignMessage(""), 3000);
      } else {
        setAssignMessage(`❌ Assignment failed: ${data.error}`);
        setTimeout(() => setAssignMessage(""), 5000);
      }
    } catch (error) {
      setAssignMessage(`❌ Assignment failed: ${error}`);
      setTimeout(() => setAssignMessage(""), 5000);
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const handleBulkUnassign = async () => {
    if (selectedTasks.length === 0) return;
    
    setBulkUnassignLoading(true);
    try {
      const response = await fetch('/api/manager/tasks/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedTasks }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAssignMessage(`✅ ${data.tasksUnassigned || selectedTasks.length} tasks unassigned successfully`);
        clearSelection();
        loadTasks();
        onTaskAssignmentChange?.();
        setTimeout(() => setAssignMessage(""), 3000);
      } else {
        setAssignMessage(`❌ Unassignment failed: ${data.error}`);
        setTimeout(() => setAssignMessage(""), 5000);
      }
    } catch (error) {
      setAssignMessage(`❌ Unassignment failed: ${error}`);
      setTimeout(() => setAssignMessage(""), 5000);
    } finally {
      setBulkUnassignLoading(false);
    }
  };

  // Individual assignment functions
  const handleIndividualAssign = async (taskId: string, agentId: string) => {
    try {
      const response = await fetch('/api/manager/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ids: [taskId], 
          agentId: agentId
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAssignMessage(`✅ Task assigned successfully`);
        loadTasks();
        onTaskAssignmentChange?.();
        setTimeout(() => setAssignMessage(""), 3000);
      } else {
        setAssignMessage(`❌ Assignment failed: ${data.error}`);
        setTimeout(() => setAssignMessage(""), 5000);
      }
    } catch (error) {
      setAssignMessage(`❌ Assignment failed: ${error}`);
      setTimeout(() => setAssignMessage(""), 5000);
    }
  };

  const handleUnassign = async (taskId: string) => {
    try {
      const response = await fetch('/api/manager/tasks/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [taskId] }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAssignMessage(`✅ Task unassigned successfully`);
        loadTasks();
        onTaskAssignmentChange?.();
        setTimeout(() => setAssignMessage(""), 3000);
      } else {
        setAssignMessage(`❌ Unassignment failed: ${data.error}`);
        setTimeout(() => setAssignMessage(""), 5000);
      }
    } catch (error) {
      setAssignMessage(`❌ Unassignment failed: ${error}`);
      setTimeout(() => setAssignMessage(""), 5000);
    }
  };

  const handleReview = (task: WodIvcsTask) => {
    setSelectedTaskForReview(task);
    setShowReviewModal(true);
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          📋 Pending Tasks - WOD/IVCS
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">{totalCount} total</span>
          <SmallButton onClick={loadTasks} className="bg-blue-600 hover:bg-blue-700">
            🔄 Refresh
          </SmallButton>
        </div>
      </div>

      {/* Assignment Message */}
      {assignMessage && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          assignMessage.includes('✅') 
            ? 'bg-green-500/10 border border-green-500/20 text-green-300'
            : assignMessage.includes('⚠️')
            ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'
            : 'bg-red-500/10 border border-red-500/20 text-red-300'
        }`}>
          {assignMessage}
        </div>
      )}

      {/* Text Club-style Filtering */}
      <div className="mb-4 space-y-3">
        {/* Status and Assignment Filters */}
        <div className="flex items-center gap-3">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white"
          >
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ASSISTANCE_REQUIRED">Assistance Required</option>
            <option value="COMPLETED">Completed</option>
            <option value="ALL">All</option>
          </select>

          <select 
            value={assignedFilter} 
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white"
          >
            <option value="anyone">Assigned: Anyone</option>
            <option value="unassigned">Unassigned</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search brand / text / email / phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white placeholder-white/40 flex-1"
          />
          <SmallButton onClick={loadTasks} className="bg-blue-600 hover:bg-blue-700">
            Search
          </SmallButton>
        </div>

        {/* Age Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-white/60">Filter by age:</label>
          <select 
            value={ageFilter} 
            onChange={(e) => setAgeFilter(e.target.value)}
            className="bg-white/10 border border-white/20 rounded px-3 py-1 text-sm text-white"
          >
            <option value="all">All Ages</option>
            <option value="today">Today</option>
            <option value="1-3">1-3 days old</option>
            <option value="4-7">4-7 days old</option>
            <option value="8+">8+ days old</option>
          </select>
        </div>

        {/* Selection counter and help text */}
        {selectedCount > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-2">
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

        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          <SmallButton 
            onClick={handleSelectAll}
            className="bg-white/10 hover:bg-white/20"
          >
            {selectedTasks.length === tasks.length ? 'Deselect all' : 'Select all'}
          </SmallButton>
          
          {selectedTasks.length > 0 && (
            <>
              <select 
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkAssign(e.target.value);
                    e.target.value = "";
                  }
                }}
                disabled={bulkAssignLoading}
                className="bg-white/10 border border-white/20 rounded px-3 py-1 text-sm text-white"
              >
                <option value="">Assign selected to...</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              
              <SmallButton 
                onClick={handleBulkUnassign}
                disabled={bulkUnassignLoading}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {bulkUnassignLoading ? 'Unassigning...' : 'Unassign selected'}
              </SmallButton>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="text-white/60">Loading tasks...</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-white/60">No WOD/IVCS tasks found</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-2">
                  <input
                    type="checkbox"
                    checked={selectedTasks.length === tasks.length && tasks.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-white/20 bg-transparent"
                  />
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("wodIvcsSource")}
                >
                  Source {getSortIcon("wodIvcsSource")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("documentNumber")}
                >
                  Primary ID {getSortIcon("documentNumber")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("customerName")}
                >
                  Customer {getSortIcon("customerName")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("amount")}
                >
                  Amount {getSortIcon("amount")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("webOrderDifference")}
                >
                  Difference {getSortIcon("webOrderDifference")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("brand")}
                >
                  Brand {getSortIcon("brand")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("purchaseDate")}
                >
                  Origin Date {getSortIcon("purchaseDate")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("orderAgeDays")}
                >
                  Order Age {getSortIcon("orderAgeDays")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("assignedTo")}
                >
                  Assigned {getSortIcon("assignedTo")}
                </th>
                <th 
                  className="text-left py-3 px-2 cursor-pointer hover:bg-white/5"
                  onClick={() => handleSort("createdAt")}
                >
                  Created {getSortIcon("createdAt")}
                </th>
                <th className="text-left py-3 px-2">Send-back Info</th>
                <th className="text-left py-3 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, index) => {
                const displayData = getTaskDisplayData(task);
                return (
                  <tr key={task.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 px-2">
                      <input
                        type="checkbox"
                        checked={isSelected(task.id)}
                        onChange={() => {}}
                        onClick={(e) => toggleSelection(task.id, index, e)}
                        className="rounded border-white/20 bg-transparent"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
                        {getSourceDisplayName(task.wodIvcsSource)}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-mono text-xs">
                      {displayData.primary}
                    </td>
                    <td className="py-3 px-2">
                      {displayData.secondary}
                    </td>
                    <td className="py-3 px-2">
                      {formatCurrency(displayData.amount)}
                    </td>
                    <td className="py-3 px-2">
                      <span className={displayData.difference && displayData.difference !== 0 ? 'text-orange-400' : 'text-white/60'}>
                        {formatCurrency(displayData.difference)}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {task.brand || 'N/A'}
                    </td>
                    <td className="py-3 px-2">
                      {task.purchaseDate ? (
                        <span className="text-white/80 text-sm">
                          {new Date(task.purchaseDate).toLocaleDateString('en-US', {
                            month: 'numeric',
                            day: 'numeric',
                            year: '2-digit'
                          })}
                        </span>
                      ) : (
                        <span className="text-white/40">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {task.orderAge ? (
                        <span className={`text-xs px-2 py-1 rounded ${
                          task.orderAgeDays && task.orderAgeDays > 7 
                            ? 'bg-red-500/20 text-red-300' 
                            : task.orderAgeDays && task.orderAgeDays > 3 
                            ? 'bg-orange-500/20 text-orange-300'
                            : 'bg-green-500/20 text-green-300'
                        }`}>
                          {task.orderAge}
                        </span>
                      ) : (
                        <span className="text-white/40">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {task.assignedTo ? (
                        <span className="text-green-400">{task.assignedTo.name}</span>
                      ) : (
                        <span className="text-white/60">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-white/60">
                      {new Date(task.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2">
                      {task.sentBackByUser ? (
                        <div className="text-xs text-orange-300">
                          <div className="font-medium">Sent back by {task.sentBackByUser.name}</div>
                          <div className="text-orange-200/80">{task.sentBackDisposition}</div>
                          <div className="text-orange-200/60">
                            {task.sentBackAt ? new Date(task.sentBackAt).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-white/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex gap-1">
                        <SmallButton 
                          onClick={() => handleReview(task)}
                          className="text-xs px-2 py-1"
                        >
                          Review
                        </SmallButton>
                        {task.assignedTo && (
                          <SmallButton 
                            onClick={() => handleUnassign(task.id)}
                            className="bg-red-600 hover:bg-red-700 text-xs px-2 py-1"
                          >
                            Unassign
                          </SmallButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalCount > 50 && (
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
          <div className="text-sm text-white/60">
            Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, totalCount)} of {totalCount} tasks
          </div>
          <div className="flex items-center gap-2">
            <SmallButton 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50"
            >
              Previous
            </SmallButton>
            
            {/* Page Selection Dropdown */}
            <select 
              value={page} 
              onChange={(e) => setPage(Number(e.target.value))}
              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
            >
              {Array.from({ length: Math.ceil(totalCount / 50) }, (_, i) => i + 1).map(pageNum => (
                <option key={pageNum} value={pageNum}>
                  Page {pageNum}
                </option>
              ))}
            </select>
            
            <SmallButton 
              onClick={() => setPage(p => p + 1)}
              disabled={page * 50 >= totalCount}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50"
            >
              Next
            </SmallButton>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedTaskForReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Task Review - {getSourceDisplayName(selectedTaskForReview.wodIvcsSource)}</h3>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-2">Basic Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Task ID:</span>
                      <span className="text-white font-mono">{selectedTaskForReview.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Source:</span>
                      <span className="text-blue-300">{getSourceDisplayName(selectedTaskForReview.wodIvcsSource)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Status:</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        selectedTaskForReview.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                        selectedTaskForReview.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300' :
                        selectedTaskForReview.status === 'COMPLETED' ? 'bg-green-500/20 text-green-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {selectedTaskForReview.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Assigned To:</span>
                      <span className="text-white">
                        {selectedTaskForReview.assignedTo ? selectedTaskForReview.assignedTo.name : 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Created:</span>
                      <span className="text-white">{new Date(selectedTaskForReview.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-2">Customer Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Customer Name:</span>
                      <span className="text-white">{selectedTaskForReview.customerName || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Brand:</span>
                      <span className="text-white">{selectedTaskForReview.brand || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Order Details */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-2">Order Details</h4>
                  <div className="space-y-2 text-sm">
                    {selectedTaskForReview.documentNumber && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Document Number:</span>
                        <span className="text-white font-mono">{selectedTaskForReview.documentNumber}</span>
                      </div>
                    )}
                    {selectedTaskForReview.webOrder && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Web Order:</span>
                        <span className="text-white font-mono">{selectedTaskForReview.webOrder}</span>
                      </div>
                    )}
                    {selectedTaskForReview.purchaseDate && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Order Date:</span>
                        <span className="text-white">{new Date(selectedTaskForReview.purchaseDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {selectedTaskForReview.orderAge && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Order Age:</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          selectedTaskForReview.orderAgeDays && selectedTaskForReview.orderAgeDays > 7 
                            ? 'bg-red-500/20 text-red-300' 
                            : selectedTaskForReview.orderAgeDays && selectedTaskForReview.orderAgeDays > 3 
                            ? 'bg-orange-500/20 text-orange-300'
                            : 'bg-green-500/20 text-green-300'
                        }`}>
                          {selectedTaskForReview.orderAge}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Details */}
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-2">Financial Information</h4>
                  <div className="space-y-2 text-sm">
                    {selectedTaskForReview.amount && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Amount:</span>
                        <span className="text-white">{formatCurrency(selectedTaskForReview.amount)}</span>
                      </div>
                    )}
                    {selectedTaskForReview.webOrderDifference && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Web Order Difference:</span>
                        <span className="text-orange-400">{formatCurrency(selectedTaskForReview.webOrderDifference)}</span>
                      </div>
                    )}
                    {selectedTaskForReview.nsVsWebDiscrepancy && (
                      <div className="flex justify-between">
                        <span className="text-white/60">NS vs Web Discrepancy:</span>
                        <span className="text-orange-400">{formatCurrency(selectedTaskForReview.nsVsWebDiscrepancy)}</span>
                      </div>
                    )}
                    {selectedTaskForReview.webVsNsDifference && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Web vs NS Difference:</span>
                        <span className="text-orange-400">{formatCurrency(selectedTaskForReview.webVsNsDifference)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
              <SmallButton 
                onClick={() => setShowReviewModal(false)}
                className="bg-white/10 hover:bg-white/20"
              >
                Close
              </SmallButton>
              {!selectedTaskForReview.assignedTo && (
                <select 
                  onChange={(e) => {
                    if (e.target.value) {
                      handleIndividualAssign(selectedTaskForReview.id, e.target.value);
                      setShowReviewModal(false);
                      e.target.value = "";
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                  defaultValue=""
                >
                  <option value="">Assign to...</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

    </Card>
  );
}