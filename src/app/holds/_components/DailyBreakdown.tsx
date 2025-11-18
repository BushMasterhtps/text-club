"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface DailyBreakdown {
  date: string;
  dayStart: string;
  dayEnd: string;
  queueCountsAtEndOfDay: Record<string, number>;
  totalPendingAtEndOfDay: number;
  newTasksCount: number;
  completedTasksCount: number;
  rolloverTasksCount: number;
  newTasks?: any[];
  completedTasks?: any[];
  rolloverTasks?: any[];
  tasksInQueueAtEndOfDay?: Record<string, any[]>;
}

export default function DailyBreakdown() {
  const [breakdowns, setBreakdowns] = useState<DailyBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDayDetails, setSelectedDayDetails] = useState<DailyBreakdown | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  
  // Date range filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Default: last 30 days
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    loadBreakdown();
  }, [startDate, endDate]);

  const loadBreakdown = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      params.append('includeTasks', 'true');
      
      const response = await fetch(`/api/holds/daily-breakdown?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setBreakdowns(data.data.breakdowns);
      }
    } catch (error) {
      console.error('Error loading daily breakdown:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSpecificDate = async (date: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('date', date);
      params.append('includeTasks', 'true');
      
      const response = await fetch(`/api/holds/daily-breakdown?${params.toString()}`);
      const data = await response.json();
      
      if (data.success && data.data.breakdowns.length > 0) {
        setSelectedDayDetails(data.data.breakdowns[0]);
        setShowTaskDetails(true);
      }
    } catch (error) {
      console.error('Error loading specific date:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    loadSpecificDate(date);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Get all unique queue names from all breakdowns
  const allQueues = Array.from(
    new Set(
      breakdowns.flatMap(b => Object.keys(b.queueCountsAtEndOfDay))
    )
  ).sort();

  return (
    <Card>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">📅 Daily Breakdown</h2>
        <p className="text-white/60 text-sm">
          View end of day (5 PM PST) snapshots showing queue counts, completed tasks, and rollovers
        </p>
      </div>

      {/* Date Range Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
      </div>

      {/* Summary Stats */}
      {!loading && breakdowns.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-blue-200 mb-1">Total Days</h3>
            <p className="text-2xl font-bold text-white">{breakdowns.length}</p>
          </div>
          <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-green-200 mb-1">Total Completed</h3>
            <p className="text-2xl font-bold text-white">
              {breakdowns.reduce((sum, b) => sum + b.completedTasksCount, 0)}
            </p>
          </div>
          <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-yellow-200 mb-1">Total New Tasks</h3>
            <p className="text-2xl font-bold text-white">
              {breakdowns.reduce((sum, b) => sum + b.newTasksCount, 0)}
            </p>
          </div>
          <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-orange-200 mb-1">Total Rollovers</h3>
            <p className="text-2xl font-bold text-white">
              {breakdowns.reduce((sum, b) => sum + b.rolloverTasksCount, 0)}
            </p>
          </div>
        </div>
      )}

      {/* Daily Breakdown Table */}
      {loading ? (
        <div className="text-center py-8 text-white/60">Loading daily breakdown...</div>
      ) : breakdowns.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          No data found for the selected date range
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-white/60">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">New Tasks</th>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Rollovers</th>
                <th className="px-3 py-2">Pending at EOD</th>
                {allQueues.map(queue => (
                  <th key={queue} className="px-3 py-2">{queue}</th>
                ))}
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {breakdowns.map((breakdown) => (
                <tr key={breakdown.date} className="hover:bg-white/5">
                  <td className="px-3 py-2 text-white font-medium">
                    {formatDate(breakdown.date)}
                  </td>
                  <td className="px-3 py-2 text-blue-300 font-semibold">
                    {breakdown.newTasksCount}
                  </td>
                  <td className="px-3 py-2 text-green-300 font-semibold">
                    {breakdown.completedTasksCount}
                  </td>
                  <td className="px-3 py-2 text-orange-300 font-semibold">
                    {breakdown.rolloverTasksCount}
                  </td>
                  <td className="px-3 py-2 text-white font-semibold">
                    {breakdown.totalPendingAtEndOfDay}
                  </td>
                  {allQueues.map(queue => (
                    <td key={queue} className="px-3 py-2 text-white/80">
                      {breakdown.queueCountsAtEndOfDay[queue] || 0}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDateClick(breakdown.date)}
                      className="text-blue-400 hover:text-blue-300 text-xs underline"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Day Details Modal */}
      {showTaskDetails && selectedDayDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Daily Breakdown - {formatDate(selectedDayDetails.date)}
                </h3>
                <p className="text-sm text-white/60 mt-1">
                  End of Day: 5 PM PST
                </p>
              </div>
              <button
                onClick={() => {
                  setShowTaskDetails(false);
                  setSelectedDayDetails(null);
                }}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <div className="text-xs text-blue-200 mb-1">New Tasks</div>
                <div className="text-xl font-bold text-white">{selectedDayDetails.newTasksCount}</div>
              </div>
              <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                <div className="text-xs text-green-200 mb-1">Completed</div>
                <div className="text-xl font-bold text-white">{selectedDayDetails.completedTasksCount}</div>
              </div>
              <div className="p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                <div className="text-xs text-orange-200 mb-1">Rollovers</div>
                <div className="text-xl font-bold text-white">{selectedDayDetails.rolloverTasksCount}</div>
              </div>
              <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <div className="text-xs text-purple-200 mb-1">Pending at EOD</div>
                <div className="text-xl font-bold text-white">{selectedDayDetails.totalPendingAtEndOfDay}</div>
              </div>
            </div>

            {/* Queue Counts at End of Day */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-white mb-3">Queue Counts at End of Day (5 PM PST)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(selectedDayDetails.queueCountsAtEndOfDay).map(([queue, count]) => (
                  <div key={queue} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-xs text-white/60 mb-1">{queue}</div>
                    <div className="text-xl font-bold text-white">{count as number}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* New Tasks */}
            {selectedDayDetails.newTasks && selectedDayDetails.newTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-white mb-3">New Tasks Added ({selectedDayDetails.newTasks.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-1 text-left text-white/60">Order #</th>
                        <th className="px-2 py-1 text-left text-white/60">Email</th>
                        <th className="px-2 py-1 text-left text-white/60">Agent</th>
                        <th className="px-2 py-1 text-left text-white/60">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.newTasks.map((task: any) => (
                        <tr key={task.id}>
                          <td className="px-2 py-1 text-white font-mono">{task.orderNumber || 'N/A'}</td>
                          <td className="px-2 py-1 text-white/80">{task.customerEmail || 'N/A'}</td>
                          <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                          <td className="px-2 py-1 text-white/60">
                            {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Completed Tasks */}
            {selectedDayDetails.completedTasks && selectedDayDetails.completedTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-white mb-3">Completed Tasks ({selectedDayDetails.completedTasks.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-1 text-left text-white/60">Order #</th>
                        <th className="px-2 py-1 text-left text-white/60">Email</th>
                        <th className="px-2 py-1 text-left text-white/60">Disposition</th>
                        <th className="px-2 py-1 text-left text-white/60">Agent</th>
                        <th className="px-2 py-1 text-left text-white/60">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.completedTasks.map((task: any) => (
                        <tr key={task.id}>
                          <td className="px-2 py-1 text-white font-mono">{task.orderNumber || 'N/A'}</td>
                          <td className="px-2 py-1 text-white/80">{task.customerEmail || 'N/A'}</td>
                          <td className="px-2 py-1 text-green-300">{task.disposition || 'N/A'}</td>
                          <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                          <td className="px-2 py-1 text-white/60">
                            {task.endTime ? new Date(task.endTime).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rollover Tasks */}
            {selectedDayDetails.rolloverTasks && selectedDayDetails.rolloverTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-white mb-3">Rollover Tasks - Moved Between Queues ({selectedDayDetails.rolloverTasks.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-1 text-left text-white/60">Order #</th>
                        <th className="px-2 py-1 text-left text-white/60">Email</th>
                        <th className="px-2 py-1 text-left text-white/60">Agent</th>
                        <th className="px-2 py-1 text-left text-white/60">Queue Movements</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.rolloverTasks.map((task: any) => {
                        const movements = Array.isArray(task.queueHistory) 
                          ? task.queueHistory.filter((entry: any) => {
                              if (!entry.enteredAt) return false;
                              const entered = new Date(entry.enteredAt);
                              const dayStart = new Date(selectedDayDetails.dayStart);
                              const dayEnd = new Date(selectedDayDetails.dayEnd);
                              return entered >= dayStart && entered < dayEnd;
                            })
                          : [];
                        
                        return (
                          <tr key={task.id}>
                            <td className="px-2 py-1 text-white font-mono">{task.orderNumber || 'N/A'}</td>
                            <td className="px-2 py-1 text-white/80">{task.customerEmail || 'N/A'}</td>
                            <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                            <td className="px-2 py-1 text-orange-300">
                              {movements.map((m: any, idx: number) => (
                                <div key={idx} className="text-xs">
                                  → {m.queue} ({new Date(m.enteredAt).toLocaleTimeString()})
                                </div>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tasks in Each Queue at End of Day */}
            {selectedDayDetails.tasksInQueueAtEndOfDay && Object.keys(selectedDayDetails.tasksInQueueAtEndOfDay).length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-white mb-3">Tasks in Each Queue at End of Day</h4>
                {Object.entries(selectedDayDetails.tasksInQueueAtEndOfDay).map(([queue, tasks]) => (
                  <div key={queue} className="mb-4">
                    <h5 className="text-md font-semibold text-white mb-2">{queue} ({tasks.length})</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-2 py-1 text-left text-white/60">Order #</th>
                            <th className="px-2 py-1 text-left text-white/60">Email</th>
                            <th className="px-2 py-1 text-left text-white/60">Agent</th>
                            <th className="px-2 py-1 text-left text-white/60">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {tasks.map((task: any) => (
                            <tr key={task.id}>
                              <td className="px-2 py-1 text-white font-mono">{task.orderNumber || 'N/A'}</td>
                              <td className="px-2 py-1 text-white/80">{task.customerEmail || 'N/A'}</td>
                              <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                              <td className="px-2 py-1 text-white/80">{task.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowTaskDetails(false);
                  setSelectedDayDetails(null);
                }}
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

