"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { WorkMetadataBadge } from "@/app/_components/WorkMetadataBadge";
import { getTaskCardColorClass } from "@/lib/holds-work-metadata";

interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Task {
  id: string;
  text: string;
  holdsOrderNumber: string;
  holdsCustomerEmail: string;
  holdsOrderDate: string;
  holdsPriority: number;
  holdsStatus: string;
  assignedTo?: Agent;
  aging?: {
    daysSinceOrder: number;
    isAging: boolean;
    isApproaching: boolean;
  };
}

export default function AgentAssignmentSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'neverWorkedFirst' | 'oldestFirst' | 'recentlyWorkedLast'>('neverWorkedFirst');

  useEffect(() => {
    fetchData();
  }, [sortBy]);

  const fetchData = async () => {
    try {
      // Fetch agents - use the same API as the existing system
      console.log('Fetching agents...');
      const agentsResponse = await fetch('/api/manager/agents');
      const agentsData = await agentsResponse.json();
      
      console.log('Agents API response:', agentsData);
      
      if (agentsData.success && agentsData.agents && Array.isArray(agentsData.agents)) {
        // Show ALL agents from settings - no filtering by role
        const availableAgents = agentsData.agents;
        setAgents(availableAgents);
        console.log('Available agents for holds assignment (all agents):', availableAgents);
      } else {
        console.error('Invalid agents response:', agentsData);
        setAgents([]);
      }

      // Fetch ALL holds tasks (not just unassigned) to match existing system
      console.log('Fetching holds tasks...');
      const params = new URLSearchParams();
      params.set('sortBy', sortBy);
      const tasksResponse = await fetch(`/api/holds/assign?${params.toString()}`);
      const tasksData = await tasksResponse.json();
      
      console.log('Tasks API response:', tasksData);
      
      if (tasksData.success && tasksData.data && tasksData.data.tasks && Array.isArray(tasksData.data.tasks)) {
        setTasks(tasksData.data.tasks); // Show all tasks, not just unassigned
        console.log('All holds tasks:', tasksData.data.tasks);
      } else {
        console.error('Invalid tasks response:', tasksData);
        setTasks([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskSelect = (taskId: string) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleSelectAll = () => {
    if (selectedTasks.length === tasks.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(tasks.map(task => task.id));
    }
  };

  const handleBulkAssign = async (agentId: string) => {
    if (selectedTasks.length === 0) {
      alert('Please select at least one task');
      return;
    }

    try {
      const response = await fetch('/api/holds/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: selectedTasks,
          agentId: agentId,
          maxTasks: 200,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully assigned ${data.data.assigned} tasks to ${agents.find(a => a.id === agentId)?.name}`);
        setSelectedTasks([]);
        fetchData(); // Refresh data
      } else {
        alert(`Assignment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Assignment error:', error);
      alert('Assignment failed. Please try again.');
    }
  };

  const handleIndividualAssign = async (taskId: string, agentId: string) => {
    try {
      const response = await fetch('/api/holds/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: [taskId],
          agentId: agentId,
          maxTasks: 200,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        fetchData(); // Refresh data
      } else {
        alert(`Assignment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Assignment error:', error);
      alert('Assignment failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">👥 Agent Assignment</h2>
        <div className="text-white/60">Loading assignment data...</div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-4">👥 Agent Assignment</h2>
      <p className="text-white/70 mb-4">
        Assign holds tasks to agents. Use individual assignment for single tasks or bulk assignment for multiple tasks.
      </p>
      
      {/* Sorting Controls */}
      <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2">
          <label className="text-sm text-white/70">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 bg-white/10 rounded text-sm text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="neverWorkedFirst">Never Worked First</option>
            <option value="oldestFirst">Oldest First</option>
            <option value="recentlyWorkedLast">Recently Worked Last</option>
          </select>
        </div>
      </div>
      
      {/* Bulk Assignment Controls */}
      <div className="mb-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-blue-200">Bulk Assignment</h3>
            <p className="text-sm text-blue-300">
              Selected: {selectedTasks.length} tasks
            </p>
          </div>
          <SmallButton onClick={handleSelectAll}>
            {selectedTasks.length === tasks.length ? 'Deselect All' : 'Select All'}
          </SmallButton>
        </div>
        
        {selectedTasks.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-white/70">Assign selected to:</span>
            <select
              onChange={(e) => e.target.value && handleBulkAssign(e.target.value)}
              className="p-2 bg-white/10 border border-white/20 rounded-lg text-white"
            >
              <option value="">Choose agent...</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.email})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Holds Tasks ({tasks.length} total)</h3>
          <div className="text-sm text-white/60">
            {tasks.filter(t => !t.assignedTo).length} unassigned
          </div>
        </div>
        
        <div className="max-h-96 overflow-y-auto space-y-2">
          {tasks.map(task => {
            const taskWithMetadata = task as any;
            const baseColorClass = taskWithMetadata.workMetadata 
              ? getTaskCardColorClass(taskWithMetadata.workMetadata)
              : 'bg-white/5 border-white/10';
            
            return (
            <div
              key={task.id}
              className={`p-3 rounded-lg border transition-all ${
                selectedTasks.includes(task.id)
                  ? 'bg-blue-900/30 border-blue-500'
                  : baseColorClass
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={() => handleTaskSelect(task.id)}
                      className="w-4 h-4 text-blue-600 bg-white border-white/20 rounded focus:ring-blue-500"
                    />
                    <p className="font-medium text-white">
                      {task.text?.replace('Holds - ', '') || 'Unknown Customer'}
                    </p>
                  </div>
                  <p className="text-sm text-white/60 ml-7">
                    Order: {task.holdsOrderNumber || 'N/A'} | 
                    Email: {task.holdsCustomerEmail || 'N/A'}
                  </p>
                  <p className="text-sm text-white/60 ml-7">
                    Status: {task.holdsStatus} | Priority: {task.holdsPriority || 4}
                  </p>
                  
                  {/* Work Metadata Badges */}
                  {taskWithMetadata.workMetadata && (
                    <div className="ml-7">
                      <WorkMetadataBadge
                        hasBeenWorked={taskWithMetadata.workMetadata.hasBeenWorked}
                        isRework={taskWithMetadata.workMetadata.isRework}
                        recentlyWorked={taskWithMetadata.workMetadata.recentlyWorked}
                        lastWorkedByName={taskWithMetadata.workMetadata.lastWorkedByName}
                        workAttempts={taskWithMetadata.workMetadata.workAttempts}
                        hoursSinceLastWork={taskWithMetadata.workMetadata.hoursSinceLastWork}
                      />
                    </div>
                  )}
                  
                  {task.assignedTo && (
                    <p className="text-sm text-green-300 ml-7">
                      ✓ Assigned to: {task.assignedTo.name}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    task.aging?.isAging 
                      ? 'bg-red-900/50 text-red-200' 
                      : task.aging?.isApproaching 
                      ? 'bg-yellow-900/50 text-yellow-200'
                      : 'bg-green-900/50 text-green-200'
                  }`}>
                    {task.aging?.daysSinceOrder || 0} days
                  </div>
                  
                  {/* Individual Assignment Dropdown */}
                  <select
                    onChange={(e) => e.target.value && handleIndividualAssign(task.id, e.target.value)}
                    className="p-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                    value=""
                  >
                    <option value="">Assign to...</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
