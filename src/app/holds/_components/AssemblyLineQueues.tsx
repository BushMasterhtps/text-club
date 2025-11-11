"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

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

  const queueColors = {
    'Agent Research': 'bg-blue-900/20 border-blue-500/30',
    'Customer Contact': 'bg-yellow-900/20 border-yellow-500/30',
    'Escalated Call 5+ Day': 'bg-red-900/20 border-red-500/30',
    'Duplicates': 'bg-purple-900/20 border-purple-500/30',
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

  const handleQueueClick = (queueName: string) => {
    setSelectedQueue(selectedQueue === queueName ? null : queueName);
  };

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">🏭 Assembly Line Queues</h2>
        <div className="text-white/60">Loading queue data...</div>
      </Card>
    );
  }

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

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-xl font-semibold mb-4">🏭 Assembly Line Queues</h2>
        <p className="text-white/70 mb-4">
          Visualize and manage tasks across different holds queues. Click on a queue to see details.
        </p>
        
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
                  <div className="flex justify-between">
                    <span className="text-white/70">Aging (5+ days):</span>
                    <span className="text-red-300 font-medium">{stats.aging}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Approaching (3-4 days):</span>
                    <span className="text-yellow-300 font-medium">{stats.approaching}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selectedQueue && queueStats[selectedQueue] && (() => {
        const filteredTasks = getFilteredTasks(queueStats[selectedQueue].tasks);
        return (
          <Card>
            <h3 className="text-lg font-semibold mb-4">
              {selectedQueue} - Task Details
              {searchQuery && (
                <span className="text-sm font-normal text-white/60 ml-2">
                  ({filteredTasks.length} of {queueStats[selectedQueue].tasks.length} matching)
                </span>
              )}
            </h3>
            <div className="space-y-3">
              {filteredTasks.slice(0, 20).map((task) => (
              <div
                key={task.id}
                className="p-3 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="flex justify-between items-start gap-4">
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
                  </div>
                  <div className="text-right space-y-2">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      task.aging?.isAging 
                        ? 'bg-red-900/50 text-red-200' 
                        : task.aging?.isApproaching 
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
                </div>
              </div>
              ))}
              {filteredTasks.length === 0 && (
                <p className="text-center text-white/60 py-4">
                  No tasks match your search
                </p>
              )}
              {filteredTasks.length > 20 && (
                <p className="text-center text-white/60 text-sm">
                  ... and {filteredTasks.length - 20} more tasks
                </p>
              )}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}
