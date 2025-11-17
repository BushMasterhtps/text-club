'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type RankingMode = 'sprint' | 'lifetime-points' | 'task-day' | 'hybrid';

interface Props {
  scorecardData: any;
  loading: boolean;
  onRefresh: () => void;
  onLoadAgentDetail: (agentId: string) => Promise<any>;
  dateRange?: { start: string; end: string }; // Custom date range from parent
}

export default function PerformanceScorecard({ scorecardData, loading, onRefresh, onLoadAgentDetail, dateRange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [agentDetailData, setAgentDetailData] = useState<any>(null);
  
  // NEW: Ranking mode tabs (default to hybrid 30/70)
  const [rankingMode, setRankingMode] = useState<RankingMode>('hybrid');
  const [sprintData, setSprintData] = useState<any>(null);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [sprintHistory, setSprintHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSprintNumber, setSelectedSprintNumber] = useState<number | 'current'>('current'); // Track selected sprint
  
  // NEW: Productivity charts toggle
  const [showProductivityCharts, setShowProductivityCharts] = useState<string | null>(null); // agentId whose charts are shown
  
  // NEW: Disposition breakdown toggle
  const [showDispositionBreakdown, setShowDispositionBreakdown] = useState<string | null>(null); // agentId whose breakdown is shown

  // Load sprint data when component mounts, mode changes, or date range changes
  useEffect(() => {
    if (expanded && (rankingMode === 'sprint' || rankingMode === 'lifetime-points' || rankingMode === 'hybrid')) {
      loadSprintData();
    }
    if (expanded) {
      loadSprintHistory();
    }
  }, [expanded, rankingMode, dateRange?.start, dateRange?.end, selectedSprintNumber]);
  
  // Reset to current sprint only when first switching TO sprint mode from another mode
  // But preserve user's manual selection if they've already selected a sprint
  const [hasManuallySelectedSprint, setHasManuallySelectedSprint] = useState(false);
  
  useEffect(() => {
    if (rankingMode === 'sprint' && !hasManuallySelectedSprint) {
      // Only set to 'current' if user hasn't manually selected a sprint yet
      setSelectedSprintNumber('current');
    }
  }, [rankingMode, hasManuallySelectedSprint]);

  const loadSprintData = async () => {
    setSprintLoading(true);
    try {
      let url = '/api/manager/analytics/sprint-rankings';
      
      // Determine mode and add date range if custom
      if (rankingMode === 'lifetime-points') {
        url += '?mode=lifetime';
      } else if (rankingMode === 'sprint') {
        // Use selected sprint number, or 'current' if viewing current sprint
        if (selectedSprintNumber === 'current') {
          url += '?mode=current';
        } else {
          url += `?mode=sprint-${selectedSprintNumber}`;
        }
      } else if (dateRange?.start && dateRange?.end) {
        // Use custom date range for hybrid and task-day modes
        url += `?mode=custom&startDate=${dateRange.start}&endDate=${dateRange.end}`;
      } else {
        // Fallback to current sprint if no date range
        url += '?mode=current';
      }
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success) {
        setSprintData(data);
      }
    } catch (error) {
      console.error('Error loading sprint data:', error);
    } finally {
      setSprintLoading(false);
    }
  };

  const loadSprintHistory = async () => {
    try {
      const res = await fetch('/api/manager/analytics/sprint-history?limit=10');
      const data = await res.json();
      
      if (data.success) {
        setSprintHistory(data.history);
      }
    } catch (error) {
      console.error('Error loading sprint history:', error);
    }
  };

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
          {/* Ranking Mode Tabs */}
          <div className="flex items-center gap-2 mb-6 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setRankingMode('sprint')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                rankingMode === 'sprint'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                  : 'bg-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              🔥 Current Sprint
            </button>
            
            {/* Sprint Selector (only show when in sprint mode) */}
            {rankingMode === 'sprint' && sprintHistory.length > 0 && (
              <select
                value={selectedSprintNumber}
                onChange={(e) => {
                  const newValue = e.target.value === 'current' ? 'current' : parseInt(e.target.value);
                  setSelectedSprintNumber(newValue);
                  setHasManuallySelectedSprint(true); // Mark that user has manually selected
                }}
                className="px-3 py-2 rounded-md text-sm font-medium bg-gray-800/50 text-white border border-white/20 hover:bg-gray-700/50 transition-colors"
              >
                <option value="current">Current Sprint</option>
                {sprintHistory.map((sprint) => (
                  <option key={sprint.sprintNumber} value={sprint.sprintNumber}>
                    Sprint #{sprint.sprintNumber} - {sprint.period}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setRankingMode('lifetime-points')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                rankingMode === 'lifetime-points'
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg'
                  : 'bg-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              ⭐ Lifetime Points
            </button>
            <button
              onClick={() => setRankingMode('task-day')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                rankingMode === 'task-day'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              📊 Task Volume
            </button>
            <button
              onClick={() => setRankingMode('hybrid')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                rankingMode === 'hybrid'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              🎯 Hybrid (30/70)
            </button>
          </div>

          {/* Last Sprint Winner Banner (if available) */}
          {sprintHistory.length > 0 && sprintHistory[0]?.champion && !sprintHistory[0].isCurrent && (
            <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="text-sm font-semibold text-yellow-300">
                      Last Sprint Champion: {sprintHistory[0].champion.name}
                    </div>
                    <div className="text-xs text-white/60">
                      {sprintHistory[0].period} • {sprintHistory[0].champion.ptsPerDay.toFixed(1)} pts/day
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(loading || sprintLoading) ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-white/60">Loading {rankingMode === 'sprint' ? 'sprint rankings' : 'scorecard'}...</div>
            </div>
          ) : (rankingMode === 'sprint' || rankingMode === 'lifetime-points' || rankingMode === 'hybrid') && sprintData?.rankings?.competitive ? (
            /* SPRINT / LIFETIME / HYBRID RANKINGS */
            <div className="space-y-4">
              {/* Date Range Info Banner (for custom ranges or sprint) */}
              {sprintData.dateRange && (
                <div className={`rounded-lg p-4 ${
                  rankingMode === 'sprint' && sprintData.sprint
                    ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30'
                    : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-white">
                        {rankingMode === 'sprint' && sprintData.sprint ? (
                          <>🔥 {sprintData.sprint.period}</>
                        ) : (
                          <>📅 {new Date(sprintData.dateRange.start).toLocaleDateString()} - {new Date(sprintData.dateRange.end).toLocaleDateString()}</>
                        )}
                      </div>
                      <div className="text-sm text-white/70 mt-1">
                        {rankingMode === 'sprint' && sprintData.sprint ? (
                          <>Sprint #{sprintData.sprint.number} • Day {sprintData.sprint.daysElapsed} of 14</>
                        ) : sprintData.dateRange.isLifetime ? (
                          <>Career Rankings (All Time)</>
                        ) : (
                          <>Custom Period Rankings</>
                        )}
                      </div>
                    </div>
                    {rankingMode === 'sprint' && sprintData.sprint && (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-orange-300">
                          {sprintData.sprint.daysRemaining}
                        </div>
                        <div className="text-xs text-white/60">days remaining</div>
                      </div>
                    )}
                  </div>
                  {rankingMode === 'sprint' && sprintData.sprint && (
                    <div className="mt-3 bg-white/10 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-red-400"
                        style={{ width: `${(sprintData.sprint.daysElapsed / 14) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Ranking Description */}
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-sm text-white/80">
                  {rankingMode === 'sprint' && (
                    <>
                      <strong>Sprint Rankings:</strong> Weighted points per day worked in current 14-day sprint • Min 3 days worked to qualify
                    </>
                  )}
                  {rankingMode === 'lifetime-points' && (
                    <>
                      <strong>Lifetime Rankings:</strong> Career weighted points per day worked • Min 20 tasks to qualify
                    </>
                  )}
                  {rankingMode === 'hybrid' && (
                    <div className="flex items-center gap-2">
                      <span>
                        <strong>Hybrid Rankings:</strong> 30% Task Volume + 70% Weighted Complexity • Min 3 days worked to qualify
                      </span>
                      <div className="relative group">
                        <span className="text-blue-400 cursor-help text-xs">ℹ️</span>
                        <div className="absolute left-0 top-6 w-80 bg-gray-900 border border-blue-500/50 rounded-lg p-4 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                          <div className="text-xs text-white space-y-2">
                            <div className="font-semibold text-blue-300 mb-2">📊 How Hybrid Score Works:</div>
                            <div>
                              <strong className="text-white/90">Step 1:</strong> Normalize both metrics to 0-100 scale:
                              <div className="ml-3 mt-1 text-white/70">
                                • Volume: (Agent's tasks/day ÷ Top performer's tasks/day) × 100
                                <br/>
                                • Complexity: (Agent's pts/day ÷ Top performer's pts/day) × 100
                              </div>
                            </div>
                            <div>
                              <strong className="text-white/90">Step 2:</strong> Combine with 30/70 weighting:
                              <div className="ml-3 mt-1 text-white/70">
                                Hybrid Score = (Volume × 0.30) + (Complexity × 0.70)
                              </div>
                            </div>
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 mt-2">
                              <strong className="text-yellow-300">Example:</strong>
                              <div className="text-white/70 mt-1">
                                Agent with 90% volume + 95% complexity:
                                <br/>
                                Score = (90 × 0.30) + (95 × 0.70) = 27 + 66.5 = <strong className="text-yellow-300">93.5</strong>
                              </div>
                            </div>
                            <div className="text-white/60 text-[10px] mt-2">
                              💡 Higher score = better balance of productivity and task difficulty
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-white/50 mt-2">
                  {sprintData.rankings.competitive.length} ranked • {sprintData.rankings.unqualified?.length || 0} unqualified • {sprintData.rankings.seniors.length} seniors (tracked separately)
                </div>
              </div>

              {/* Competitive Rankings */}
              <div className="space-y-3">
                {[...sprintData.rankings.competitive]
                  .sort((a, b) => {
                    // Sort by the appropriate rank based on current mode
                    const rankA = rankingMode === 'sprint' ? a.rankByPtsPerDay :
                                 rankingMode === 'lifetime-points' ? a.lifetimeRank :
                                 rankingMode === 'hybrid' ? a.rankByHybrid :
                                 a.rankByTasksPerDay;
                    const rankB = rankingMode === 'sprint' ? b.rankByPtsPerDay :
                                 rankingMode === 'lifetime-points' ? b.lifetimeRank :
                                 rankingMode === 'hybrid' ? b.rankByHybrid :
                                 b.rankByTasksPerDay;
                    return rankA - rankB; // Ascending (1, 2, 3...)
                  })
                  .map((agent: any) => {
                  // Determine which rank to display based on mode
                  const displayRank = rankingMode === 'sprint' ? agent.rankByPtsPerDay :
                                    rankingMode === 'lifetime-points' ? agent.lifetimeRank :
                                    rankingMode === 'hybrid' ? agent.rankByHybrid :
                                    agent.rankByTasksPerDay;
                  
                  const displayScore = rankingMode === 'sprint' ? agent.weightedDailyAvg :
                                      rankingMode === 'lifetime-points' ? agent.weightedDailyAvg :
                                      rankingMode === 'hybrid' ? agent.hybridScore :
                                      agent.tasksPerDay;

                  const rankColor = displayRank === 1 ? 'text-yellow-300' : 
                                   displayRank === 2 ? 'text-gray-300' :
                                   displayRank === 3 ? 'text-orange-400' :
                                   'text-white/70';

                  return (
                    <div key={agent.id} className="bg-gradient-to-r from-white/[0.03] to-white/[0.01] rounded-xl p-4 border border-white/10 hover:border-white/20 transition-all">
                      <div className="flex items-center gap-4">
                        {/* Rank Badge */}
                        <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg ${
                          displayRank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-900' :
                          displayRank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900' :
                          displayRank === 3 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-orange-900' :
                          'bg-white/10 text-white/70'
                        }`}>
                          #{displayRank}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-white text-lg">{agent.name}</span>
                            {agent.isTopThree && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                displayRank === 1 ? 'bg-green-500/20 text-green-300 border border-green-500/50' :
                                'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                              }`}>
                                {agent.tier} {agent.isChampion ? '🏆' : '⭐'}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-white/50">{agent.email}</div>
                        </div>

                        <div className="text-right relative group">
                          <div className={`text-2xl font-bold ${rankColor} cursor-help`}>
                            {rankingMode === 'hybrid' ? displayScore.toFixed(1) : Math.round(displayScore)}
                          </div>
                          <div className="text-xs text-white/50">
                            {rankingMode === 'hybrid' ? 'Score' : 
                             rankingMode === 'task-day' ? 'Tasks/Day' : 
                             'Pts/Day'}
                          </div>
                          <div className="text-xs text-white/40">
                            Top {agent.percentile}%
                          </div>
                          
                          {/* Tooltip for Hybrid Score */}
                          {rankingMode === 'hybrid' && (
                            <div className="absolute right-0 top-0 w-64 bg-gray-900 border border-purple-500/50 rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                              <div className="text-xs text-white space-y-1">
                                <div className="font-semibold text-purple-300 mb-2">🎯 {agent.name}'s Hybrid Score</div>
                                <div className="text-white/70">
                                  <strong>Volume:</strong> {agent.tasksPerDay.toFixed(1)} tasks/day
                                  <br/>
                                  <strong>Complexity:</strong> {agent.weightedDailyAvg.toFixed(1)} pts/day
                                </div>
                                <div className="border-t border-white/10 pt-2 mt-2">
                                  <div className="text-white/60">
                                    30% × Volume + 70% × Complexity
                                    <br/>
                                    = <strong className="text-purple-300">{displayScore.toFixed(1)} Score</strong>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quick Stats */}
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white/5 rounded-lg p-2">
                          <div className="text-white/50 text-xs">📦 Total</div>
                          <div className="text-white font-semibold">{agent.totalCompleted}</div>
                          <div className="text-xs text-white/40">{agent.tasksCompleted} portal + {agent.trelloCompleted} Trello</div>
                        </div>
                        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg p-2 border border-yellow-500/30">
                          <div className="text-yellow-300/90 text-xs">⭐ Points</div>
                          <div className="text-white font-bold">{agent.weightedPoints.toFixed(1)}</div>
                          <div className="text-xs text-yellow-300/60">{agent.weightedDailyAvg.toFixed(1)} pts/day</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2">
                          <div className="text-white/50 text-xs">⏱️ Avg Time</div>
                          <div className="text-white font-semibold">{Math.floor(agent.avgHandleTimeSec / 60)}m {agent.avgHandleTimeSec % 60}s</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2">
                          <div className="text-white/50 text-xs">📅 Days Worked</div>
                          <div className="text-white font-semibold">{agent.daysWorked}</div>
                        </div>
                      </div>

                      {/* Gap Analysis & Improvement Suggestions */}
                      {sprintData.teamAverages && (() => {
                        const teamAvg = sprintData.teamAverages;
                        const nextRankAgent = sprintData.rankings.competitive[displayRank - 2]; // Agent one rank above
                        
                        // Calculate gaps
                        const complexityGap = agent.weightedDailyAvg - teamAvg.ptsPerDay;
                        const volumeGap = agent.tasksPerDay - teamAvg.tasksPerDay;
                        const complexityPercent = teamAvg.ptsPerDay > 0 ? Math.round((complexityGap / teamAvg.ptsPerDay) * 100) : 0;
                        const volumePercent = teamAvg.tasksPerDay > 0 ? Math.round((volumeGap / teamAvg.tasksPerDay) * 100) : 0;
                        
                        // Determine performance level
                        const isTopPerformer = displayRank <= 3;
                        const isAboveAverage = agent.hybridScore > teamAvg.hybridScore;
                        const needsImprovement = displayRank > (sprintData.rankings.competitive.length * 0.75);

                        const gapToNext = nextRankAgent ? (nextRankAgent.hybridScore - agent.hybridScore) : 0;

                        return (
                          <div className={`mt-4 rounded-lg p-3 border ${
                            isTopPerformer ? 'bg-green-500/10 border-green-500/30' :
                            isAboveAverage ? 'bg-blue-500/10 border-blue-500/30' :
                            needsImprovement ? 'bg-orange-500/10 border-orange-500/30' :
                            'bg-yellow-500/10 border-yellow-500/30'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold text-white">
                                {isTopPerformer ? '✅ EXCELLENT PERFORMANCE' :
                                 isAboveAverage ? '🎯 ABOVE AVERAGE' :
                                 needsImprovement ? '⚠️ IMPROVEMENT NEEDED' :
                                 '📊 ROOM FOR GROWTH'}
                              </span>
                            </div>

                            {/* vs Team Average */}
                            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="text-white/60">Complexity vs Team Avg:</span>
                                  <div className="relative group">
                                    <span className="text-blue-400 cursor-help text-[10px]">ℹ️</span>
                                    <div className="absolute left-0 top-4 w-64 bg-gray-900 border border-blue-500/50 rounded p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[10px]">
                                      <div className="text-white/80">
                                        <strong className="text-blue-300">Task Difficulty (70% of rank):</strong> Weighted points per day. Email/Yotpo (6-7pts) vs Spam (0.8pts). Higher = handling harder tasks.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className={`font-semibold ${complexityGap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {complexityGap >= 0 ? '+' : ''}{complexityGap.toFixed(1)} pts/day ({complexityPercent >= 0 ? '+' : ''}{complexityPercent}%)
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="text-white/60">Volume vs Team Avg:</span>
                                  <div className="relative group">
                                    <span className="text-blue-400 cursor-help text-[10px]">ℹ️</span>
                                    <div className="absolute left-0 top-4 w-64 bg-gray-900 border border-blue-500/50 rounded p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[10px]">
                                      <div className="text-white/80">
                                        <strong className="text-blue-300">Tasks Completed (30% of rank):</strong> How many tasks finished per day vs team average.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className={`font-semibold ${volumeGap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {volumeGap >= 0 ? '+' : ''}{volumeGap.toFixed(1)} tasks/day ({volumePercent >= 0 ? '+' : ''}{volumePercent}%)
                                </div>
                              </div>
                            </div>

                            {/* Improvement Path */}
                            {!isTopPerformer && (
                              <div className="bg-white/5 rounded p-2 text-xs">
                                {nextRankAgent && (
                                  <div className="mb-2">
                                    <span className="text-white/70">Gap to #{displayRank - 1}: </span>
                                    <span className="font-semibold text-orange-300">+{gapToNext.toFixed(1)} points needed</span>
                                  </div>
                                )}
                                
                                <div className="text-white/70">
                                  <strong className="text-white">💡 Improvement Tips:</strong>
                                  {complexityGap < 0 && Math.abs(complexityGap) > Math.abs(volumeGap) && (
                                    <div className="mt-1">
                                      🎯 <strong>Priority:</strong> Increase task complexity (70% of score)
                                      <br/>
                                      ✅ Work faster to clear queue quicker
                                      <br/>
                                      ✅ Request more assignments when done
                                      <br/>
                                      ✅ High volume = better variety (Email, Yotpo, WOD mix)
                                    </div>
                                  )}
                                  {volumeGap < 0 && Math.abs(volumeGap) > Math.abs(complexityGap) && (
                                    <div className="mt-1">
                                      📈 <strong>Priority:</strong> Increase task volume (30% of score)
                                      <br/>
                                      ✅ Reduce avg handle time to under 3 minutes
                                      <br/>
                                      ✅ Minimize time between tasks
                                      <br/>
                                      ✅ Request more task assignments
                                    </div>
                                  )}
                                  {complexityGap < 0 && volumeGap < 0 && (
                                    <div className="mt-1">
                                      ⚡ <strong>Focus on BOTH:</strong>
                                      <br/>
                                      1. Work faster through your queue
                                      <br/>
                                      2. Request more task assignments when done
                                      <br/>
                                      3. High volume = better variety naturally
                                    </div>
                                  )}
                                  {isAboveAverage && !isTopPerformer && (
                                    <div className="mt-1 text-green-400">
                                      ✨ You're above team average! Keep pushing to reach top 3.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {isTopPerformer && (
                              <div className="text-xs text-green-400">
                                Keep up the excellent work! You're setting the standard for the team. 🌟
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Detailed Task Type Breakdown */}
                      {agent.breakdown && Object.keys(agent.breakdown).length > 0 && (
                        <div className="mt-4">
                          <button
                            onClick={() => {
                              if (expandedAgentId === agent.id) {
                                setExpandedAgentId(null);
                              } else {
                                setExpandedAgentId(agent.id);
                              }
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 underline"
                          >
                            {expandedAgentId === agent.id ? '▲ Hide detailed breakdown' : '▼ Click to view detailed breakdown'}
                          </button>

                          {expandedAgentId === agent.id && (
                            <>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                              {Object.entries(agent.breakdown).map(([taskType, data]: [string, any]) => {
                                const percentage = agent.totalCompleted > 0 
                                  ? Math.round((data.count / agent.totalCompleted) * 100) 
                                  : 0;
                                
                                const taskTypeColors: Record<string, string> = {
                                  TEXT_CLUB: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
                                  WOD_IVCS: 'from-red-500/20 to-red-600/20 border-red-500/30',
                                  EMAIL_REQUESTS: 'from-green-500/20 to-green-600/20 border-green-500/30',
                                  YOTPO: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
                                  HOLDS: 'from-orange-500/20 to-orange-600/20 border-orange-500/30',
                                  TRELLO: 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
                                  STANDALONE_REFUNDS: 'from-pink-500/20 to-pink-600/20 border-pink-500/30'
                                };

                                const colorClass = taskTypeColors[taskType] || 'from-white/10 to-white/20 border-white/20';

                                return (
                                  <div key={taskType} className={`bg-gradient-to-br ${colorClass} rounded-lg p-3 border`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="font-semibold text-white text-sm">
                                        {taskType === 'TRELLO' ? '📊 Trello' :
                                         taskType === 'TEXT_CLUB' ? '📱 Text Club' :
                                         taskType === 'WOD_IVCS' ? '📦 WOD/IVCS' :
                                         taskType === 'EMAIL_REQUESTS' ? '📧 Email Requests' :
                                         taskType === 'YOTPO' ? '⭐ Yotpo' :
                                         taskType === 'HOLDS' ? '🚧 Holds' :
                                         taskType.replace('_', ' ')}
                                      </div>
                                      <div className="text-xs text-white/60">{percentage}%</div>
                                    </div>
                                    <div className="space-y-1 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-white/70">Completed:</span>
                                        <span className="font-semibold text-white">{data.count}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-white/70">Weighted:</span>
                                        <span className="font-semibold text-yellow-300">{data.weightedPoints.toFixed(1)} pts</span>
                                      </div>
                                      {data.avgSec > 0 && (
                                        <>
                                          <div className="flex items-center justify-between">
                                            <span className="text-white/70">Avg Time:</span>
                                            <span className="font-semibold text-white">{Math.floor(data.avgSec / 60)}m {data.avgSec % 60}s</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-white/70">Total Time:</span>
                                            <span className="font-semibold text-white">{Math.floor(data.totalSec / 60)} min</span>
                                          </div>
                                        </>
                                      )}
                                      {taskType === 'TRELLO' && (
                                        <div className="text-[10px] text-purple-300/70 mt-1">
                                          From Power BI imports • 5.0 pts each
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* REMOVED: Old duplicate hourly chart - now in toggleable productivity analysis section below */}

                            {/* Idle Time Insight (NEW!) */}
                            {agent.estimatedIdleHours > 0 && (
                              <div className="mt-3 bg-orange-500/10 border border-orange-500/30 rounded p-3">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/70">⏱️ Estimated Idle Time:</span>
                                  <span className="text-orange-300 font-semibold">{agent.estimatedIdleHours.toFixed(1)} hrs</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] mt-2">
                                  <div>
                                    <span className="text-white/50">Active:</span>
                                    <span className="text-white ml-1">{agent.activeHours.toFixed(1)} hrs</span>
                                  </div>
                                  <div>
                                    <span className="text-white/50">Between tasks:</span>
                                    <span className="text-orange-300 ml-1">{agent.estimatedIdleHours.toFixed(1)} hrs</span>
                                  </div>
                                </div>
                                <div className="text-[10px] text-white/60 mt-2">
                                  💡 {agent.estimatedIdleHours > 2 ? 'High idle time - encourage to request more assignments!' : 'Good utilization of shift time!'}
                                </div>
                              </div>
                            )}
                            
                            {/* NEW: Productivity Charts (Hourly or Daily based on date range) */}
                            {(agent.hourlyBreakdown || agent.dailyBreakdown) && (
                              <div className="mt-4">
                                <button
                                  onClick={() => {
                                    if (showProductivityCharts === agent.id) {
                                      setShowProductivityCharts(null);
                                    } else {
                                      setShowProductivityCharts(agent.id);
                                    }
                                  }}
                                  className="text-xs text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                                >
                                  {showProductivityCharts === agent.id ? '📊 Hide productivity analysis' : '📊 Show productivity analysis'}
                                </button>

                                {showProductivityCharts === agent.id && (
                                  <div className="mt-3 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                                    {/* Single Day View: Hourly Breakdown */}
                                    {dateRange && dateRange.start === dateRange.end && agent.hourlyBreakdown && Object.keys(agent.hourlyBreakdown).length > 0 && (
                                      <div>
                                        <div className="text-sm font-semibold text-white mb-3">⏰ Hourly Productivity on {dateRange.start}</div>
                                        <div className="flex items-end gap-1 h-32">
                                          {Array.from({ length: 24 }, (_, hour) => {
                                            const data = agent.hourlyBreakdown[hour];
                                            const count = data?.count || 0;
                                            const maxCount = Math.max(...Object.values(agent.hourlyBreakdown).map((d: any) => d.count), 1);
                                            const heightPercent = count > 0 ? (count / maxCount) * 100 : 0;
                                            
                                            return (
                                              <div key={hour} className="flex-1 flex flex-col items-center group relative cursor-pointer min-w-[8px]">
                                                <div 
                                                  className={`w-full rounded-t transition-all ${
                                                    count > 0 
                                                      ? 'bg-gradient-to-t from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 shadow-lg' 
                                                      : 'bg-white/10'
                                                  }`}
                                                  style={{ 
                                                    height: count > 0 ? `${Math.max(heightPercent, 20)}%` : '4px',
                                                    minHeight: count > 0 ? '24px' : '4px'
                                                  }}
                                                >
                                                  {count > 0 && (
                                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-950 border-2 border-white/40 rounded-lg px-4 py-3 text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-2xl backdrop-blur-sm">
                                                      <div className="font-extrabold text-lg text-white drop-shadow-lg">{hour % 12 || 12}{hour >= 12 ? 'PM' : 'AM'}</div>
                                                      <div className="text-base text-white mt-1 font-bold drop-shadow-md">{count} tasks • {data.points?.toFixed(1) || 0} pts</div>
                                                    </div>
                                                  )}
                                                </div>
                                                {hour % 3 === 0 && (
                                                  <div className="text-[8px] text-white/40 mt-1">{hour % 12 || 12}{hour >= 12 ? 'p' : 'a'}</div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        
                                        {/* Peak Hours Analysis */}
                                        {(() => {
                                          const sortedHours = Object.entries(agent.hourlyBreakdown)
                                            .map(([hour, data]: [string, any]) => ({ hour: parseInt(hour), ...data }))
                                            .sort((a, b) => b.count - a.count)
                                            .slice(0, 3);
                                          
                                          if (sortedHours.length > 0 && sortedHours[0].count > 0) {
                                            return (
                                              <div className="mt-3 text-xs text-white/70">
                                                🏆 Peak Hours: {sortedHours.map(h => `${h.hour % 12 || 12}${h.hour >= 12 ? 'PM' : 'AM'} (${h.count})`).join(', ')}
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                        
                                        <div className="text-[10px] text-white/50 mt-2 text-center">
                                          💡 Hover over bars to see counts & points
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Multi-Day View: Daily Breakdown */}
                                    {dateRange && dateRange.start !== dateRange.end && agent.dailyBreakdown && Object.keys(agent.dailyBreakdown).length > 0 && (
                                      <div>
                                        <div className="text-sm font-semibold text-white mb-3">📅 Daily Productivity Breakdown</div>
                                        <div className="space-y-2">
                                          {Object.entries(agent.dailyBreakdown)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([day, data]: [string, any]) => {
                                              const maxCount = Math.max(...Object.values(agent.dailyBreakdown).map((d: any) => d.count));
                                              const widthPercent = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
                                              const dayOfWeek = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                                              const displayDate = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                              
                                              return (
                                                <div key={day} className="flex items-center gap-3">
                                                  <div className="text-xs text-white/60 w-20">{dayOfWeek} {displayDate}</div>
                                                  <div className="flex-1 relative">
                                                    <div className="bg-white/5 rounded h-8 relative overflow-hidden">
                                                      <div 
                                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-500 rounded flex items-center justify-end pr-2 transition-all"
                                                        style={{ width: `${widthPercent}%` }}
                                                      >
                                                        <span className="text-xs font-semibold text-white">{data.count} tasks</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <div className="text-xs text-white/70 w-24 text-right">
                                                    {data.points.toFixed(1)} pts • {data.activeHours.toFixed(1)}h
                                                  </div>
                                                </div>
                                              );
                                            })}
                                        </div>
                                        
                                        {/* Peak Days Analysis */}
                                        {(() => {
                                          const sortedDays = Object.entries(agent.dailyBreakdown)
                                            .map(([day, data]: [string, any]) => ({ day, ...data }))
                                            .sort((a, b) => b.count - a.count)
                                            .slice(0, 3);
                                          
                                          const avgTasksPerDay = Object.values(agent.dailyBreakdown).reduce((sum: number, d: any) => sum + d.count, 0) / Object.keys(agent.dailyBreakdown).length;
                                          const avgHoursPerDay = Object.values(agent.dailyBreakdown).reduce((sum: number, d: any) => sum + d.activeHours, 0) / Object.keys(agent.dailyBreakdown).length;
                                          
                                          // Find peak hour across all days
                                          const allHourlyData: Record<number, number> = {};
                                          if (agent.hourlyBreakdown) {
                                            for (const [hour, data] of Object.entries(agent.hourlyBreakdown) as any) {
                                              allHourlyData[hour] = (data.count || 0);
                                            }
                                          }
                                          const peakHour = Object.entries(allHourlyData).sort(([, a], [, b]) => (b as number) - (a as number))[0];
                                          
                                          return (
                                            <div className="mt-3 bg-purple-500/10 rounded p-3 space-y-2 text-xs">
                                              <div className="text-white/70">
                                                📊 <strong className="text-white">Averages:</strong> {avgTasksPerDay.toFixed(1)} tasks/day • {avgHoursPerDay.toFixed(1)} hours/day
                                              </div>
                                              {sortedDays.length > 0 && (
                                                <div className="text-white/70">
                                                  🏆 <strong className="text-white">Peak Days:</strong> {sortedDays.map(d => {
                                                    const date = new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                    return `${date} (${d.count})`;
                                                  }).join(', ')}
                                                </div>
                                              )}
                                              {peakHour && peakHour[1] > 0 && (
                                                <div className="text-white/70">
                                                  ⏰ <strong className="text-white">Peak Time Window:</strong> {parseInt(peakHour[0]) % 12 || 12}{parseInt(peakHour[0]) >= 12 ? 'PM' : 'AM'} (most productive hour)
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* NEW: Disposition Breakdown Toggle */}
                            {agent.breakdown && Object.keys(agent.breakdown).length > 0 && (
                              <div className="mt-4">
                                <button
                                  onClick={() => {
                                    if (showDispositionBreakdown === agent.id) {
                                      setShowDispositionBreakdown(null);
                                    } else {
                                      setShowDispositionBreakdown(agent.id);
                                    }
                                  }}
                                  className="text-xs text-cyan-400 hover:text-cyan-300 underline flex items-center gap-1"
                                >
                                  {showDispositionBreakdown === agent.id ? '📋 Hide disposition breakdown' : '📋 Show disposition breakdown'}
                                </button>

                                {showDispositionBreakdown === agent.id && (
                                  <div className="mt-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                                    <div className="text-sm font-semibold text-white mb-3">📋 Task & Disposition Breakdown</div>
                                    
                                    {/* Display breakdown grouped by task type */}
                                    <div className="space-y-4">
                                      {Object.entries(agent.breakdown)
                                        .filter(([taskType]) => taskType !== 'TRELLO') // Show Trello separately
                                        .map(([taskType, data]: [string, any]) => {
                                          const taskTypeName = taskType === 'TEXT_CLUB' ? 'Text Club' : 
                                                             taskType === 'WOD_IVCS' ? 'WOD/IVCS' : 
                                                             taskType === 'EMAIL_REQUESTS' ? 'Email Requests' :
                                                             taskType === 'YOTPO' ? 'Yotpo' :
                                                             taskType === 'HOLDS' ? 'Holds' : taskType;
                                          
                                          const totalPercent = agent.totalTasks > 0 ? ((data.count / agent.totalTasks) * 100).toFixed(0) : '0';
                                          
                                          return (
                                            <div key={taskType} className="bg-white/5 rounded-lg p-3 border border-white/10">
                                              <div className="flex items-center justify-between mb-2">
                                                <div className="font-semibold text-white text-sm">
                                                  {taskTypeName}
                                                </div>
                                                <div className="text-xs text-white/60">
                                                  {data.count} tasks • {data.weightedPoints.toFixed(1)} pts • {totalPercent}%
                                                </div>
                                              </div>
                                              
                                              {/* Disposition rows */}
                                              {data.dispositions && data.dispositions.length > 0 ? (
                                                <div className="space-y-1 ml-4">
                                                  {data.dispositions.map((disp: any) => {
                                                    const dispPercent = agent.totalTasks > 0 ? ((disp.count / agent.totalTasks) * 100).toFixed(1) : '0.0';
                                                    
                                                    return (
                                                      <div key={disp.disposition} className="flex items-center justify-between text-xs py-1 hover:bg-white/5 rounded px-2 -mx-2 group cursor-pointer transition-colors">
                                                        <div className="text-white/70 flex-1">
                                                          └─ {disp.disposition}
                                                        </div>
                                                        <div className="text-white/60 text-right flex items-center gap-2">
                                                          <span>{disp.count} tasks ({dispPercent}%) • {disp.avgTime || 'N/A'} • {disp.points.toFixed(1)} pts</span>
                                                          <button
                                                            onClick={async (e) => {
                                                              e.stopPropagation();
                                                              // Download raw data for this disposition
                                                              const params = new URLSearchParams({
                                                                agentId: agent.id,
                                                                taskType: taskType,
                                                                disposition: disp.disposition,
                                                                startDate: dateRange?.start || '',
                                                                endDate: dateRange?.end || ''
                                                              });
                                                              const url = `/api/manager/analytics/raw-tasks-export?${params}`;
                                                              window.open(url, '_blank');
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400 hover:text-cyan-300"
                                                            title="Download raw task data"
                                                          >
                                                            📥
                                                          </button>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <div className="text-xs text-white/50 ml-4">No disposition data available</div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      
                                      {/* Trello with Warning */}
                                      {agent.breakdown.TRELLO && (
                                        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="font-semibold text-white text-sm flex items-center gap-2">
                                              <span>Trello</span>
                                              <span className="text-amber-400">⚠️</span>
                                            </div>
                                            <div className="text-xs text-white/60">
                                              {agent.breakdown.TRELLO.count} tasks • {agent.breakdown.TRELLO.weightedPoints.toFixed(1)} pts • {agent.totalTasks > 0 ? ((agent.breakdown.TRELLO.count / agent.totalTasks) * 100).toFixed(0) : '0'}%
                                            </div>
                                          </div>
                                          
                                          <div className="ml-4 space-y-1">
                                            <div className="flex items-center justify-between text-xs py-1 hover:bg-white/5 rounded px-2 -mx-2 group cursor-pointer transition-colors">
                                              <div className="text-white/70 flex-1">
                                                └─ Completed
                                              </div>
                                              <div className="text-white/60 text-right flex items-center gap-2">
                                                {(() => {
                                                  const trelloPercent = agent.totalTasks > 0 ? ((agent.breakdown.TRELLO.count / agent.totalTasks) * 100).toFixed(1) : '0.0';
                                                  return (
                                                    <>
                                                      <span>{agent.breakdown.TRELLO.count} tasks ({trelloPercent}%) • N/A • {agent.breakdown.TRELLO.weightedPoints.toFixed(1)} pts</span>
                                                      <button
                                                        onClick={async (e) => {
                                                          e.stopPropagation();
                                                          // Download Trello data (from trelloCompletions table)
                                                          const params = new URLSearchParams({
                                                            agentId: agent.id,
                                                            taskType: 'TRELLO',
                                                            startDate: dateRange?.start || '',
                                                            endDate: dateRange?.end || ''
                                                          });
                                                          const url = `/api/manager/analytics/raw-tasks-export?${params}`;
                                                          window.open(url, '_blank');
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-400 hover:text-amber-300"
                                                        title="Download Trello completion data"
                                                      >
                                                        📥
                                                      </button>
                                                    </>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                            
                                            <div className="mt-2 bg-amber-500/20 rounded p-2 text-[10px] text-amber-200">
                                              📊 <strong>From Power BI imports</strong> • No time/disposition tracking available<br/>
                                              ⚠️ Weighted at 3.0 pts each (estimated complexity)
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Multi-Day Summary */}
                                    {dateRange && dateRange.start !== dateRange.end && agent.daysWorked > 1 && (
                                      <div className="mt-4 bg-cyan-500/10 rounded p-3 space-y-1 text-xs">
                                        <div className="font-semibold text-white mb-2">📊 Period Summary ({dateRange.start} to {dateRange.end})</div>
                                        <div className="text-white/70">
                                          • <strong className="text-white">Total Tasks:</strong> {agent.totalTasks} tasks over {agent.daysWorked} days
                                        </div>
                                        <div className="text-white/70">
                                          • <strong className="text-white">Avg per Day:</strong> {(agent.totalTasks / agent.daysWorked).toFixed(1)} tasks/day • {(agent.totalWeightedPoints / agent.daysWorked).toFixed(1)} pts/day
                                        </div>
                                        <div className="text-white/70">
                                          • <strong className="text-white">Avg Handle Time:</strong> {agent.avgHandleTime || 'N/A'}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Single Day View */}
                                    {dateRange && dateRange.start === dateRange.end && (
                                      <div className="mt-4 text-xs text-white/50 text-center">
                                        Showing breakdown for {dateRange.start}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Senior Agents (Non-Competitive) */}
              {sprintData.rankings.seniors?.length > 0 && (
                <div className="mt-6">
                  <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                    <h3 className="text-sm font-semibold text-blue-300 mb-3">👔 Senior Agent Contributions (Non-Competitive)</h3>
                    <div className="text-xs text-white/60 mb-3">
                      These agents support the team during high-volume periods. Stats tracked for visibility, not ranked competitively.
                    </div>
                    <div className="space-y-2">
                      {sprintData.rankings.seniors.map((agent: any) => (
                        <div key={agent.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                          <div>
                            <div className="font-medium text-white">{agent.name}</div>
                            <div className="text-xs text-white/50">{agent.email}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-white/80">{agent.weightedPoints.toFixed(1)} pts • {agent.totalCompleted} tasks</div>
                            <div className="text-xs text-white/50">{agent.daysWorked} days • {agent.weightedDailyAvg.toFixed(1)} pts/day</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Sprint History (for sprint mode) */}
              {rankingMode === 'sprint' && sprintHistory.length > 0 && (
                <div className="mt-6">
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">📜 Sprint History</h3>
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {showHistory ? 'Hide' : 'Show'} Past Sprints
                      </button>
                    </div>
                    
                    {showHistory && (
                      <div className="space-y-2 mt-3">
                        {sprintHistory.slice(0, 6).map((sprint: any) => (
                          <div key={sprint.sprintNumber} className="flex items-center justify-between bg-white/5 rounded-lg p-3 border border-white/10">
                            <div>
                              <div className="text-sm font-medium text-white">
                                {sprint.isCurrent ? '🔥 Current Sprint' : `Sprint #${sprint.sprintNumber}`}
                              </div>
                              <div className="text-xs text-white/50">{sprint.period}</div>
                            </div>
                            {sprint.champion ? (
                              <div className="text-right">
                                <div className="text-sm text-yellow-300 font-semibold flex items-center gap-1">
                                  🏆 {sprint.champion.name}
                                </div>
                                <div className="text-xs text-white/50">{sprint.champion.ptsPerDay.toFixed(1)} pts/day</div>
                              </div>
                            ) : (
                              <div className="text-xs text-white/40">In Progress...</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (rankingMode === 'task-day' && scorecardData?.agents?.length > 0) ? (
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

