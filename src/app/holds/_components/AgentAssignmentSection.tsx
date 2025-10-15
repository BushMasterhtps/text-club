"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface Agent {
  id: string;
  name: string;
  email: string;
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
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch agents
      const agentsResponse = await fetch('/api/manager/agents');
      const agentsData = await agentsResponse.json();
      
      if (agentsData.success) {
        // Filter agents with proper role names
        const availableAgents = agentsData.data.filter((agent: any) => 
          agent.role === 'AGENT' || agent.role === 'MANAGER_AGENT' || agent.role === 'Manager + Agent'
        );
        setAgents(availableAgents);
        console.log('Available agents for holds assignment:', availableAgents);
      }

      // Fetch unassigned holds tasks
      const tasksResponse = await fetch('/api/holds/assign');
      const tasksData = await tasksResponse.json();
      
      if (tasksData.success) {
        setTasks(tasksData.data.tasks.filter((task: Task) => !task.assignedTo));
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

  const handleAssign = async () => {
    if (!selectedAgent || selectedTasks.length === 0) {
      alert('Please select an agent and at least one task');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch('/api/holds/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: selectedTasks,
          agentId: selectedAgent,
          maxTasks: 200,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully assigned ${data.data.assigned} tasks to ${agents.find(a => a.id === selectedAgent)?.name}`);
        setSelectedTasks([]);
        setSelectedAgent('');
        fetchData(); // Refresh data
      } else {
        alert(`Assignment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Assignment error:', error);
      alert('Assignment failed. Please try again.');
    } finally {
      setAssigning(false);
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
        Assign holds tasks to agents. Select tasks and choose an agent to assign them to.
      </p>
      
      <div className="space-y-4">
        {/* Agent Selection */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Select Agent:
          </label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-white"
          >
            <option value="">Choose an agent...</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.email})
              </option>
            ))}
          </select>
        </div>

        {/* Task Selection */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-white/70">
              Select Tasks ({selectedTasks.length} selected):
            </label>
            <SmallButton onClick={handleSelectAll}>
              {selectedTasks.length === tasks.length ? 'Deselect All' : 'Select All'}
            </SmallButton>
          </div>
          
          <div className="max-h-96 overflow-y-auto space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedTasks.includes(task.id)
                    ? 'bg-blue-900/30 border-blue-500'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                onClick={() => handleTaskSelect(task.id)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-white">
                      {task.text?.replace('Holds - ', '') || 'Unknown Customer'}
                    </p>
                    <p className="text-sm text-white/60">
                      Order: {task.holdsOrderNumber || 'N/A'} | 
                      Email: {task.holdsCustomerEmail || 'N/A'}
                    </p>
                    <p className="text-sm text-white/60">
                      Status: {task.holdsStatus} | Priority: {task.holdsPriority || 4}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      task.aging?.isAging 
                        ? 'bg-red-900/50 text-red-200' 
                        : task.aging?.isApproaching 
                        ? 'bg-yellow-900/50 text-yellow-200'
                        : 'bg-green-900/50 text-green-200'
                    }`}>
                      {task.aging?.daysSinceOrder || 0} days
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Assignment Button */}
        <SmallButton 
          onClick={handleAssign}
          disabled={!selectedAgent || selectedTasks.length === 0 || assigning}
          className="w-full"
        >
          {assigning ? 'Assigning...' : `Assign ${selectedTasks.length} Tasks`}
        </SmallButton>
      </div>
    </Card>
  );
}
