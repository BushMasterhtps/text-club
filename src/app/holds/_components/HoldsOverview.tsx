"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface Agent {
  id: string;
  email: string;
  name: string | null;
  isLive: boolean;
  lastSeen: string | null;
  holdsCount: number;
}

interface QueueMetrics {
  agentResearch: number;
  customerContact: number;
  escalatedCall: number;
  duplicates: number;
  completed: number;
  aging: number;
  approaching: number;
  totalTasks: number;
  completedAllTime: number;
}

// Progress bar component
function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 to-sky-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function HoldsOverview() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics>({
    agentResearch: 0,
    customerContact: 0,
    escalatedCall: 0,
    duplicates: 0,
    completed: 0,
    aging: 0,
    approaching: 0,
    totalTasks: 0,
    completedAllTime: 0
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load Holds-specific agents
      const agentsRes = await fetch('/api/holds/agents');
      const agentsData = await agentsRes.json();
      if (agentsData.success) {
        setAgents(agentsData.agents || []);
      }

      // Load queue metrics
      const metricsRes = await fetch('/api/holds/queues');
      const metricsData = await metricsRes.json();
      if (metricsData.success && metricsData.data) {
        const queues = metricsData.data.queues;
        const agentResearch = queues['Agent Research']?.total || 0;
        const customerContact = queues['Customer Contact']?.total || 0;
        const escalatedCall = queues['Escalated Call 5+ Day']?.total || 0;
        const duplicates = queues['Duplicates']?.total || 0;
        const completed = queues['Completed']?.total || 0;
        
        // Calculate total and completion percentage
        const totalActive = agentResearch + customerContact + escalatedCall + duplicates;
        const totalAll = totalActive + completed;
        
        setMetrics({
          agentResearch,
          customerContact,
          escalatedCall,
          duplicates,
          completed,
          aging: metricsData.data.summary?.totalAging || 0,
          approaching: metricsData.data.summary?.totalApproaching || 0,
          totalTasks: totalActive,
          completedAllTime: completed
        });
      }
    } catch (error) {
      console.error('Error loading Holds overview:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getAgentStatus = (agent: Agent) => {
    if (!agent.isLive) {
      return { status: "🔴 Inactive", color: "text-red-400" };
    }
    
    if (!agent.lastSeen) {
      return { status: "🟡 Away", color: "text-yellow-400" };
    }
    
    const now = new Date();
    const lastSeen = new Date(agent.lastSeen);
    const timeDiff = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
    
    if (timeDiff <= 15) {
      return { status: "🟢 Live", color: "text-green-400" };
    } else if (timeDiff <= 30) {
      return { status: "🟡 Away", color: "text-yellow-400" };
    } else {
      return { status: "🔴 Inactive", color: "text-red-400" };
    }
  };

  const formatTimeSince = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    
    const lastSeen = new Date(dateStr);
    const now = new Date();
    const timeDiff = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
    
    if (timeDiff <= 1) return "Just now";
    if (timeDiff < 60) return `${timeDiff} min ago`;
    const hours = Math.floor(timeDiff / 60);
    const mins = timeDiff % 60;
    return `${hours}h ${mins}m ago`;
  };

  const totalAllTasks = metrics.totalTasks + metrics.completedAllTime;
  const completionPercent = totalAllTasks > 0 
    ? Math.round((metrics.completedAllTime / totalAllTasks) * 100) 
    : 0;

  return (
    <div className="space-y-8">
      {/* Progress Bar */}
      <section>
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">Overall Progress</div>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/10 text-white">
              {completionPercent}% done
            </span>
          </div>
          <ProgressBar value={completionPercent} />
          <div className="text-xs text-white/50">
            Active Queue: {metrics.totalTasks} • Completed: {metrics.completedAllTime}
          </div>
        </Card>
      </section>

      {/* Queue Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-white/60">Agent Research</div>
          <div className="text-3xl font-bold mt-1 text-blue-400">{metrics.agentResearch}</div>
          <div className="text-xs text-white/50 mt-1">Initial queue</div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Customer Contact</div>
          <div className="text-3xl font-bold mt-1 text-yellow-400">{metrics.customerContact}</div>
          <div className="text-xs text-white/50 mt-1">48hr window</div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Escalated Calls</div>
          <div className="text-3xl font-bold mt-1 text-red-400">{metrics.escalatedCall}</div>
          <div className="text-xs text-white/50 mt-1">5+ days old</div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Aging Tasks</div>
          <div className="text-3xl font-bold mt-1 text-orange-400">{metrics.aging}</div>
          <div className="text-xs text-white/50 mt-1">
            {metrics.approaching} approaching
          </div>
        </Card>
      </section>

      {/* Additional Queue Stats */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm text-white/60">Duplicates</div>
          <div className="text-3xl font-bold mt-1 text-purple-400">{metrics.duplicates}</div>
          <div className="text-xs text-white/50 mt-1">Manager review needed</div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Completed</div>
          <div className="text-3xl font-bold mt-1 text-green-400">{metrics.completed}</div>
          <div className="text-xs text-white/50 mt-1">Resolved orders</div>
        </Card>
      </section>

      {/* Live Agent Status */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white/90 tracking-tight">Live Holds Agent Status</h2>
          <SmallButton onClick={loadData} disabled={loading}>
            {loading ? "Loading..." : "🔄 Refresh"}
          </SmallButton>
        </div>
        
        {agents.length === 0 ? (
          <Card className="p-6">
            <div className="text-center text-white/60">
              <div className="text-4xl mb-3">📄</div>
              <p className="text-lg mb-2">No Holds Agents Yet</p>
              <p className="text-sm">
                Holds agents will appear here once their accounts are created.
              </p>
              <div className="mt-4 text-xs text-white/50">
                Expected agents: 12
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const agentStatus = getAgentStatus(agent);
              
              return (
                <Card key={agent.id} className="p-4 border border-neutral-700">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-white">{agent.name || agent.email}</h3>
                    <span className={`text-sm font-medium ${agentStatus.color}`}>
                      {agentStatus.status}
                    </span>
                  </div>
                  <div className="text-sm text-white/60 space-y-1">
                    <p>Email: {agent.email}</p>
                    <p>Holds Tasks: <span className="text-orange-400 font-medium">{agent.holdsCount || 0}</span></p>
                    {agent.lastSeen && (
                      <p className="text-xs">
                        Last seen: {formatTimeSince(agent.lastSeen)}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

