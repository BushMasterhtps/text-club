"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface PendingTasksSectionProps {
  taskType?: "TEXT_CLUB" | "WOD_IVCS" | "EMAIL_REQUESTS" | "STANDALONE_REFUNDS";
}

export function PendingTasksSection({ taskType = "TEXT_CLUB" }: PendingTasksSectionProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", "all");
      
      // Use different API endpoints based on task type
      const apiUrl = taskType === "WOD_IVCS" 
        ? `/api/manager/tasks/wod-ivcs?${params}`
        : `/api/manager/tasks?${params}&taskType=${taskType}`;
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setTasks(data.items || []);
        setTotalCount(data.total || 0);
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

  useEffect(() => {
    loadTasks();
  }, [taskType, page]);

  const getTaskTypeLabel = () => {
    switch (taskType) {
      case "WOD_IVCS": return "WOD/IVCS";
      case "EMAIL_REQUESTS": return "Email Requests";
      case "STANDALONE_REFUNDS": return "Standalone Refunds";
      default: return "Text Club";
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">📋 Pending Tasks - {getTaskTypeLabel()}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">{totalCount} total</span>
          <SmallButton onClick={loadTasks} disabled={loading}>
            {loading ? "Loading..." : "🔄 Refresh"}
          </SmallButton>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-white/60">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          No {getTaskTypeLabel().toLowerCase()} tasks found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04]">
              <tr className="text-left text-white/60">
                <th className="px-3 py-2">Sel</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Assigned</th>
                {taskType === "WOD_IVCS" && (
                  <th className="px-3 py-2">Send-back Info</th>
                )}
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-white/5">
                  <td className="px-3 py-2">
                    <input type="checkbox" className="accent-blue-500" />
                  </td>
                  <td className="px-3 py-2">{task.brand || "N/A"}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-xs truncate">
                      {taskType === "WOD_IVCS" && task.documentNumber && (
                        <div className="text-xs text-white/60">Doc: {task.documentNumber}</div>
                      )}
                      {taskType === "EMAIL_REQUESTS" && task.emailRequestFor && (
                        <div className="text-xs text-white/60">Request: {task.emailRequestFor}</div>
                      )}
                      {taskType === "STANDALONE_REFUNDS" && task.salesOrderId && (
                        <div className="text-xs text-white/60">Order: {task.salesOrderId}</div>
                      )}
                      {task.text && (
                        <div className="truncate">{task.text}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {task.assignedTo ? (
                      <div>
                        <div className="text-sm text-blue-300">Assigned to {task.assignedTo.name}</div>
                        <div className="text-xs text-white/50 mt-1">Waiting for agent to start</div>
                        <select className="text-xs bg-white/10 text-white px-1 py-0.5 rounded mt-1">
                          <option>Reassign to...</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs text-orange-300 mb-1">⚠️ Unassigned</div>
                        <select className="text-xs bg-white/10 text-white px-2 py-1 rounded">
                          <option>Assign to...</option>
                        </select>
                      </div>
                    )}
                  </td>
                  {taskType === "WOD_IVCS" && (
                    <td className="px-3 py-2">
                      {task.sentBackByUser ? (
                        <div className="text-xs">
                          <div className="text-orange-300">🔄 Sent back by {task.sentBackByUser.name || task.sentBackByUser.email}</div>
                          <div className="text-white/60 mt-1">{task.sentBackDisposition}</div>
                          <div className="text-white/40 text-xs">
                            {task.sentBackAt ? new Date(task.sentBackAt).toLocaleString() : 'Unknown time'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-white/40">New task</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs text-white/60">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <SmallButton className="bg-orange-600 hover:bg-orange-700 text-white text-xs">
                        Review
                      </SmallButton>
                      <SmallButton className="bg-red-600 hover:bg-red-700 text-white text-xs">
                        Unassign
                      </SmallButton>
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