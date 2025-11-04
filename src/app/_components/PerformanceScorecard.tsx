'use client';

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  scorecardData: any;
  loading: boolean;
  onRefresh: () => void;
  onLoadAgentDetail: (agentId: string) => Promise<any>;
}

export default function PerformanceScorecard({ scorecardData, loading, onRefresh, onLoadAgentDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [agentDetailData, setAgentDetailData] = useState<any>(null);

  const handleAgentClick = async (agentId: string) => {
    if (expandedAgentId === agentId) {
      setExpandedAgentId(null);
      setAgentDetailData(null);
    } else {
      const details = await onLoadAgentDetail(agentId);
      setAgentDetailData(details);
      setExpandedAgentId(agentId);
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.02] ring-1 ring-white/10 backdrop-blur-md p-6 border-2 border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-orange-500/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏆</span>
          <div>
            <h2 className="text-lg font-semibold text-yellow-400 tracking-tight">Performance Scorecard</h2>
            <p className="text-sm text-white/60 mt-1">
              Ranked by daily average (total tasks ÷ days worked) • Min 20 tasks to qualify
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setExpanded(false);
              setExpandedAgentId(null);
              onRefresh();
            }}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white ring-1 ring-blue-400/40"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 transition-colors text-sm"
          >
            {expanded ? '▲ Collapse' : '▼ Expand Scorecard'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-white/60">Loading scorecard...</div>
            </div>
          ) : scorecardData?.agents?.length > 0 ? (
            <div className="space-y-4">
              {/* Scorecard Header Info */}
              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/80">
                    <strong>Period:</strong> {new Date(scorecardData.period.start).toLocaleDateString()} - {new Date(scorecardData.period.end).toLocaleDateString()} ({scorecardData.period.days} days)
                  </div>
                  <div className="text-sm text-white/60">
                    <strong>Ranking:</strong> Highest daily avg tasks/day at top
                  </div>
                </div>
                {scorecardData.eligibleCount !== undefined && (
                  <div className="text-xs text-white/50">
                    ✓ {scorecardData.eligibleCount} ranked • {scorecardData.ineligibleCount} need 20+ tasks to be eligible
                  </div>
                )}
              </div>

              {/* Dynamic Targets Display */}
              <details className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                <summary className="cursor-pointer text-sm font-medium text-blue-300 hover:text-blue-200">
                  📊 Smart Targets (calculated from workload & team size)
                </summary>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(scorecardData.targets || {}).map(([taskType, target]: [string, any]) => (
                    <div key={taskType} className="text-xs text-white/70 bg-white/5 rounded p-2">
                      <div className="font-medium text-white/90 mb-1">
                        {taskType.replace('_', ' ')}
                      </div>
                      <div>Daily: {target.dailyTasks} tasks</div>
                      <div>Time: {Math.floor(target.handleTimeSec / 60)}m {target.handleTimeSec % 60}s</div>
                    </div>
                  ))}
                </div>
              </details>

              {/* Weight Index */}
              {scorecardData.weightIndex && (
                <details className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/20">
                  <summary className="cursor-pointer text-sm font-medium text-yellow-300 hover:text-yellow-200">
                    ⭐ Task Weight Index ({scorecardData.weightIndex.summary?.totalDispositions || 0} dispositions from {scorecardData.weightIndex.summary?.totalTasksAnalyzed?.toLocaleString() || 0} real tasks)
                  </summary>
                  <div className="mt-4 space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(scorecardData.weightIndex.summary?.taskTypes || {}).map(([taskType, stats]: [string, any]) => (
                        <div key={taskType} className="bg-white/5 rounded-lg p-3 border border-white/10">
                          <div className="text-xs font-medium text-white/90 mb-1">
                            {taskType.replace('_', ' ')}
                          </div>
                          <div className="text-sm text-yellow-300 font-bold">{stats.avgWeight?.toFixed(2)} pts avg</div>
                          <div className="text-xs text-white/50">{stats.dispositions} types • {stats.tasksAnalyzed?.toLocaleString()} analyzed</div>
                        </div>
                      ))}
                    </div>

                    {/* Disposition List by Task Type */}
                    <div className="space-y-3">
                      {['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS'].map(taskType => {
                        const dispositions = scorecardData.weightIndex.dispositions?.filter((d: any) => d.taskType === taskType) || [];
                        if (dispositions.length === 0) return null;

                        return (
                          <div key={taskType}>
                            <div className="text-xs font-semibold text-white/80 mb-2 uppercase tracking-wide">
                              {taskType.replace('_', ' ')}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {dispositions.map((d: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between bg-white/5 rounded px-3 py-2 text-xs border border-white/10">
                                  <div className="flex-1 text-white/70 truncate pr-2" title={d.disposition}>
                                    {d.disposition}
                                  </div>
                                  <div className="text-yellow-300 font-semibold whitespace-nowrap">
                                    {d.weight.toFixed(2)} pts
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Fixed Weights */}
                      <div>
                        <div className="text-xs font-semibold text-white/80 mb-2 uppercase tracking-wide">
                          FIXED WEIGHTS
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/30 rounded px-3 py-2 text-xs">
                            <div className="text-purple-300">Trello (All)</div>
                            <div className="text-yellow-300 font-semibold">5.00 pts</div>
                          </div>
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded px-3 py-2 text-xs">
                            <div className="text-white/70">Holds (All)</div>
                            <div className="text-yellow-300 font-semibold">4.00 pts</div>
                          </div>
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded px-3 py-2 text-xs">
                            <div className="text-white/70">Standalone Refunds (All)</div>
                            <div className="text-yellow-300 font-semibold">3.00 pts</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Explanation */}
                    <div className="text-xs text-white/50 bg-white/5 rounded p-3 border border-white/10">
                      💡 <strong>How it works:</strong> Each task's weight is based on its actual average handle time from production data. 
                      Higher complexity tasks (like "Answered in SF") earn more points than simpler tasks (like "Spam"). 
                      This ensures agents who tackle harder work get proper credit, making rankings fair across different workload mixes.
                    </div>
                  </div>
                </details>
              )}

              {/* Agent Rankings */}
              <div className="space-y-3">
                {scorecardData.agents.map((agent: any) => (
                  <div key={agent.id}>
                    <div 
                      className={`rounded-lg p-4 cursor-pointer transition-all ${
                        expandedAgentId === agent.id 
                          ? 'bg-white/10 border-2 border-white/20' 
                          : 'bg-white/5 border border-white/10 hover:bg-white/8'
                      }`}
                      onClick={() => handleAgentClick(agent.id)}
                    >
                      {/* Agent Rank Card */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          {/* Rank Badge */}
                          <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg ${
                            agent.rank === null ? 'bg-gray-600/20 text-gray-400 border-2 border-gray-600' :
                            agent.rank === 1 ? 'bg-yellow-500/20 text-yellow-300 border-2 border-yellow-500' :
                            agent.rank === 2 ? 'bg-gray-400/20 text-gray-300 border-2 border-gray-400' :
                            agent.rank === 3 ? 'bg-orange-600/20 text-orange-300 border-2 border-orange-600' :
                            'bg-white/10 text-white/60'
                          }`}>
                            {agent.rank === null ? '—' : `#${agent.rank}`}
                          </div>

                          {/* Tier Badge */}
                          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            agent.tier === 'Insufficient Data' ? 'bg-gray-600/20 text-gray-400 border border-gray-600/50' :
                            agent.tier === 'Elite' ? 'bg-green-500/20 text-green-300 border border-green-500/50' :
                            agent.tier === 'High Performer' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50' :
                            agent.tier === 'On Track' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50' :
                            'bg-orange-500/20 text-orange-300 border border-orange-500/50'
                          }`}>
                            {agent.tierBadge} {agent.tier}
                          </div>

                          {/* Agent Info */}
                          <div className="flex-1">
                            <div className="font-semibold text-white text-lg">{agent.name}</div>
                            <div className="text-sm text-white/50">{agent.email}</div>
                          </div>
                        </div>

                        {/* Overall Score */}
                        <div className="text-right">
                          {agent.rank === null ? (
                            <>
                              <div className="text-xl font-bold text-gray-400">Not Ranked</div>
                              <div className="text-xs text-white/50 mt-1">Need {agent.minimumTasks}+ tasks</div>
                              <div className="text-xs text-white/40">({agent.tasksCompleted} completed)</div>
                            </>
                          ) : (
                            <>
                              <div className="text-3xl font-bold text-white">{agent.overallScore}</div>
                              <div className="text-sm text-white/60">Tasks/Day</div>
                              <div className="text-xs text-white/50 mt-1">Top {agent.percentile}%</div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Score Breakdown Bar */}
                      <div className="mt-4">
                        <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              agent.tier === 'Insufficient Data' ? 'bg-gray-500' :
                              agent.tier === 'Elite' ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                              agent.tier === 'High Performer' ? 'bg-gradient-to-r from-blue-500 to-cyan-400' :
                              agent.tier === 'On Track' ? 'bg-gradient-to-r from-yellow-500 to-amber-400' :
                              'bg-gradient-to-r from-orange-500 to-red-400'
                            }`}
                            style={{ 
                              width: agent.rank === null ? '10%' : `${Math.min((agent.dailyAvg / (scorecardData?.agents?.[0]?.dailyAvg || 1)) * 100, 100)}%` 
                            }}
                          />
                        </div>
                      </div>

                      {/* Quick Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 text-sm">
                        <div>
                          <div className="text-white/50">📊 Daily Average</div>
                          <div className="text-white font-semibold">{agent.dailyAvg} tasks/day</div>
                          <div className="text-xs text-white/40">(task count)</div>
                        </div>
                        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg p-2 border border-yellow-500/30">
                          <div className="text-yellow-300/90">⭐ Weighted Points</div>
                          <div className="text-white font-bold text-lg">{agent.weightedPoints?.toFixed(1) || 0} pts</div>
                          <div className="text-xs text-yellow-300/60">
                            {agent.weightedDailyAvg?.toFixed(1) || 0} pts/day
                          </div>
                        </div>
                        <div>
                          <div className="text-white/50">📦 Total Completed</div>
                          <div className="text-white font-semibold">{agent.tasksCompleted} tasks</div>
                          <div className="text-xs text-white/40">
                            {agent.portalTasksCompleted} portal + {agent.trelloCardsCompleted || 0} Trello
                          </div>
                        </div>
                        <div>
                          <div className="text-white/50">⏱️ Avg Handle Time</div>
                          <div className="text-white font-semibold">
                            {Math.floor(agent.avgHandleTimeSec / 60)}m {agent.avgHandleTimeSec % 60}s
                          </div>
                          <div className="text-xs text-white/40">(info only)</div>
                        </div>
                        <div>
                          <div className="text-white/50">⏰ Total Time</div>
                          <div className="text-white font-semibold">
                            {Math.floor(agent.totalTimeSec / 3600)}h {Math.floor((agent.totalTimeSec % 3600) / 60)}m
                          </div>
                          <div className="text-xs text-white/40">(all tasks)</div>
                        </div>
                      </div>

                      {/* Click to expand indicator */}
                      <div className="mt-3 text-center text-xs text-white/40">
                        {expandedAgentId === agent.id ? '▲ Click to collapse details' : '▼ Click to view detailed breakdown'}
                      </div>
                    </div>

                    {/* Expanded Detail View */}
                    {expandedAgentId === agent.id && agentDetailData && (
                      <div className="mt-3 bg-white/5 rounded-lg p-6 border border-white/10 space-y-6">
                        {/* Work Schedule */}
                        <div>
                          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                            📅 Work Schedule
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="bg-white/5 rounded p-3">
                              <div className="text-white/50">Days Worked</div>
                              <div className="text-xl font-bold text-white">{agentDetailData.workSchedule?.daysWorked}</div>
                            </div>
                            <div className="bg-white/5 rounded p-3">
                              <div className="text-white/50">Days Off</div>
                              <div className="text-xl font-bold text-white">{agentDetailData.workSchedule?.daysOff}</div>
                            </div>
                            <div className="bg-white/5 rounded p-3">
                              <div className="text-white/50">Total Days</div>
                              <div className="text-xl font-bold text-white">{agentDetailData.workSchedule?.totalDays}</div>
                            </div>
                            <div className="bg-white/5 rounded p-3">
                              <div className="text-white/50">Attendance</div>
                              <div className="text-xl font-bold text-green-400">{agentDetailData.workSchedule?.attendanceRate}%</div>
                            </div>
                          </div>
                        </div>

                        {/* Peak Hours (single day) or Top Days (multi-day) */}
                        {agentDetailData.isSingleDay && agentDetailData.peakHours && agentDetailData.peakHours.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                              ⏰ Peak Productivity Hours (PST)
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {agentDetailData.peakHours.map((peak: any, idx: number) => (
                                <div key={idx} className="bg-white/5 rounded p-2 text-center">
                                  <div className="text-xs text-white/50">
                                    {peak.hour === 0 ? '12 AM' : 
                                     peak.hour === 12 ? '12 PM' : 
                                     peak.hour > 12 ? `${peak.hour - 12} PM` : 
                                     `${peak.hour} AM`}
                                  </div>
                                  <div className="text-lg font-bold text-white">{peak.count}</div>
                                  <div className="text-xs text-white/40">tasks</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!agentDetailData.isSingleDay && agentDetailData.topDays && agentDetailData.topDays.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                              📅 Top Performing Days
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {agentDetailData.topDays.map((day: any, idx: number) => (
                                <div key={idx} className="bg-white/5 rounded p-2 text-center">
                                  <div className="text-xs text-white/50">
                                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </div>
                                  <div className="text-lg font-bold text-white">{day.count}</div>
                                  <div className="text-xs text-white/40">tasks</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Task Type Breakdown */}
                            <div>
                              <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                                📈 Task Type Breakdown
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(agent.breakdown || {}).map(([taskType, data]: [string, any]) => {
                                  if (data.count === 0) return null;
                                  
                                  // Special styling for Trello
                                  const isTrello = taskType === 'TRELLO';
                                  
                                  return (
                                    <div 
                                      key={taskType} 
                                      className={`rounded-lg p-4 border ${
                                        isTrello 
                                          ? 'bg-purple-500/10 border-purple-500/30' 
                                          : 'bg-white/5 border-white/10'
                                      }`}
                                    >
                                      <div className={`text-sm font-medium mb-2 ${
                                        isTrello ? 'text-purple-300' : 'text-white/90'
                                      }`}>
                                        {isTrello ? '📊 Trello' : taskType.replace('_', ' ')}
                                      </div>
                                      <div className="space-y-1 text-xs text-white/70">
                                        <div>
                                          Completed: <span className="font-semibold text-white">{data.count}</span> 
                                          {' '}({((data.count / agent.tasksCompleted) * 100).toFixed(0)}%)
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-yellow-400">⭐</span>
                                          <span>Weighted: <span className="font-semibold text-yellow-300">{data.weightedPoints?.toFixed(1) || 0} pts</span></span>
                                        </div>
                                        {!isTrello && data.avgSec > 0 && (
                                          <>
                                            <div>Avg Time: <span className="font-semibold text-white">{Math.floor(data.avgSec / 60)}m {Math.round(data.avgSec % 60)}s</span></div>
                                            <div>Total Time: <span className="font-semibold text-white">{Math.floor(data.totalSec / 60)} min</span></div>
                                          </>
                                        )}
                                        {isTrello && (
                                          <div className="text-purple-300/70">From Power BI imports • 5.0 pts each</div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                        {/* Handle Time Distribution */}
                        {agentDetailData.handleTimeDistribution && (
                          <div>
                            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                              📊 Handle Time Distribution
                            </h4>
                            <div className="space-y-2">
                              {[
                                { label: 'Under 2 min', value: agentDetailData.handleTimeDistribution.under2min, color: 'bg-green-500' },
                                { label: '2-3 min', value: agentDetailData.handleTimeDistribution.twoToThree, color: 'bg-blue-500' },
                                { label: '3-5 min', value: agentDetailData.handleTimeDistribution.threeToFive, color: 'bg-yellow-500' },
                                { label: 'Over 5 min', value: agentDetailData.handleTimeDistribution.overFive, color: 'bg-red-500' }
                              ].map((bucket) => (
                                <div key={bucket.label} className="flex items-center gap-3">
                                  <div className="w-32 text-sm text-white/70">{bucket.label}</div>
                                  <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                                    <div 
                                      className={`${bucket.color} h-full flex items-center justify-end px-2 text-white text-xs font-semibold transition-all`}
                                      style={{ width: `${bucket.value}%` }}
                                    >
                                      {bucket.value > 0 && `${bucket.value}%`}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Daily Performance Chart */}
                        {agentDetailData.dailyPerformance && agentDetailData.dailyPerformance.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                              📅 Daily Performance
                            </h4>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={agentDetailData.dailyPerformance}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                  <XAxis 
                                    dataKey="date" 
                                    stroke="rgba(255,255,255,0.6)"
                                    fontSize={10}
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  />
                                  <YAxis stroke="rgba(255,255,255,0.6)" fontSize={12} />
                                  <Tooltip 
                                    contentStyle={{
                                      backgroundColor: 'rgba(0,0,0,0.9)',
                                      border: '1px solid rgba(255,255,255,0.2)',
                                      borderRadius: '8px'
                                    }}
                                  />
                                  <Bar dataKey="count" fill="#3B82F6" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-white/60">No scorecard data available for selected period</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

