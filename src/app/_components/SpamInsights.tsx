"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SpamInsightsProps {
  brand?: string;
  onClose?: () => void;
}

interface SpamInsight {
  totalDecisions: number;
  spamDecisions: number;
  legitimateDecisions: number;
  accuracy: number;
  patternAnalysis: {
    topPatterns: Array<{ pattern: string; count: number }>;
    topReasons: Array<{ reason: string; count: number }>;
    scoreDistribution: Record<string, number>;
  };
  recentActivity: Array<{
    isSpam: boolean;
    score: number;
    createdAt: string;
    text: string;
  }>;
  accuracyOverTime: Array<{
    date: string;
    total: number;
    spam: number;
    avgScore: number;
    spamRate: number;
  }>;
}

export default function SpamInsights({ brand, onClose }: SpamInsightsProps) {
  const [insights, setInsights] = useState<SpamInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'activity' | 'trends'>('overview');
  const [learningFromArchive, setLearningFromArchive] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [brand]);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = brand ? `/api/spam/insights?brand=${encodeURIComponent(brand)}` : '/api/spam/insights';
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setInsights(data.insights);
      } else {
        setError(data.error || 'Failed to load insights');
      }
    } catch (err) {
      setError('Failed to load spam insights');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const learnFromArchive = async () => {
    setLearningFromArchive(true);
    try {
      // Use background processing for large datasets
      const response = await fetch('/api/spam/learn-from-archive-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          brand,
          batchSize: 10,
          maxBatches: 5,
          type: 'both'
        })
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`Learning complete! ${data.results.message}`);
        // Refresh insights
        fetchInsights();
      } else {
        alert(`Learning failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Learn from archive error:', error);
      alert('Failed to learn from archive - this may be due to timeout. Try again or contact support.');
    } finally {
      setLearningFromArchive(false);
    }
  };

  const clearLearningData = async () => {
    if (!confirm('Are you sure you want to clear all learning data? This will remove all duplicate entries and allow you to re-learn from your archive.')) {
      return;
    }
    
    setClearingData(true);
    try {
      const response = await fetch('/api/spam/clear-learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`Cleared ${data.deletedCount} learning records! You can now re-run "Learn from Archive" to get accurate numbers.`);
        // Refresh insights
        fetchInsights();
      } else {
        alert(`Failed to clear data: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to clear learning data');
    } finally {
      setClearingData(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-green-400';
  };

  if (!mounted) return null;

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center" style={{ zIndex: 999999 }}>
        <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700/50">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white/70 rounded-full animate-spin"></div>
            <span className="ml-3 text-white/80">Loading spam insights...</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (error) {
    return createPortal(
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center" style={{ zIndex: 999999 }}>
        <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700/50">
          <div className="text-center">
            <div className="text-red-400 text-lg mb-4">Error Loading Insights</div>
            <div className="text-white/60 mb-4">{error}</div>
            <button
              onClick={fetchInsights}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!insights) {
    return createPortal(
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center" style={{ zIndex: 999999 }}>
        <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700/50">
          <div className="text-center">
            <div className="text-white text-lg mb-4">🧠 Spam Learning Insights</div>
            <div className="text-white/60 mb-4">No learning data available yet.</div>
            <div className="text-white/60 mb-6">
              The system will start learning as you make spam decisions and use the "Learn from Archive" feature.
            </div>
            <button
              onClick={learnFromArchive}
              disabled={learningFromArchive}
              className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-400 transition-colors disabled:opacity-50"
            >
              {learningFromArchive ? 'Learning...' : '🧠 Learn from Archive'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="ml-4 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center" style={{ zIndex: 999999 }}>
      <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">🧠 Spam Learning Insights</h2>
            {brand && (
              <p className="text-white/60 text-sm mt-1">Brand: {brand}</p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'patterns', label: 'Patterns' },
            { id: 'activity', label: 'Recent Activity' },
            { id: 'trends', label: 'Trends' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-700/80 text-white border border-gray-600/50'
                  : 'bg-gray-800/40 text-white/80 hover:bg-gray-700/60 border border-gray-700/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
                <div className="text-2xl font-bold text-white">{insights.totalDecisions}</div>
                <div className="text-white/60 text-sm">Total Decisions</div>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
                <div className="text-2xl font-bold text-red-400">{insights.spamDecisions}</div>
                <div className="text-white/60 text-sm">Spam Detected</div>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
                <div className="text-2xl font-bold text-green-400">{insights.legitimateDecisions}</div>
                <div className="text-white/60 text-sm">Legitimate</div>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
                <div className="text-2xl font-bold text-blue-400">{insights.accuracy.toFixed(1)}%</div>
                <div className="text-white/60 text-sm">Spam Rate</div>
              </div>
            </div>

            {/* Learn from Archive */}
            <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
              <h3 className="text-lg font-semibold text-white mb-4">Learn from Historical Data</h3>
              <p className="text-white/60 text-sm mb-4">
                Train the spam detection system using your existing archived spam and completed legitimate tasks.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={learnFromArchive}
                  disabled={learningFromArchive}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-400 transition-colors disabled:opacity-50"
                >
                  {learningFromArchive ? 'Processing in batches...' : '🧠 Learn from Archive'}
                </button>
                <button
                  onClick={clearLearningData}
                  disabled={clearingData}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-colors disabled:opacity-50"
                >
                  {clearingData ? 'Clearing...' : '🗑️ Clear Learning Data'}
                </button>
              </div>
            </div>

            {/* Score Distribution */}
            <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
              <h3 className="text-lg font-semibold text-white mb-4">Spam Score Distribution</h3>
              <div className="space-y-2">
                {Object.entries(insights.patternAnalysis.scoreDistribution).map(([range, count]) => (
                  <div key={range} className="flex items-center gap-3">
                    <div className="w-20 text-white/60 text-sm">{range}</div>
                    <div className="flex-1 bg-gray-700/50 rounded-full h-2">
                      <div 
                        className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(count / insights.totalDecisions) * 100}%` }}
                      ></div>
                    </div>
                    <div className="w-12 text-white/60 text-sm text-right">{count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'patterns' && (
          <div className="space-y-6">
            {/* Top Patterns */}
            <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
              <h3 className="text-lg font-semibold text-white mb-4">Most Common Spam Patterns</h3>
              <div className="space-y-2">
                {insights.patternAnalysis.topPatterns.map((pattern, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-800/40 rounded-lg p-3 border border-gray-700/20">
                    <div className="text-white/80">{pattern.pattern.replace(/_/g, ' ')}</div>
                    <div className="text-white/60">{pattern.count} occurrences</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Reasons */}
            <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/30">
              <h3 className="text-lg font-semibold text-white mb-4">Most Common Detection Reasons</h3>
              <div className="space-y-2">
                {insights.patternAnalysis.topReasons.map((reason, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-800/40 rounded-lg p-3 border border-gray-700/20">
                    <div className="text-white/80">{reason.reason}</div>
                    <div className="text-white/60">{reason.count} times</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Learning Activity</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {insights.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center gap-3 bg-gray-800/40 rounded-lg p-3 border border-gray-700/20">
                  <div className={`w-3 h-3 rounded-full ${activity.isSpam ? 'bg-red-400' : 'bg-green-400'}`}></div>
                  <div className="flex-1">
                    <div className="text-white/80 text-sm">{activity.text.substring(0, 100)}...</div>
                    <div className="text-white/60 text-xs">{formatDate(activity.createdAt)}</div>
                  </div>
                  <div className={`text-sm font-medium ${getScoreColor(activity.score)}`}>
                    {activity.score}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Spam Detection Trends (Last 30 Days)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {insights.accuracyOverTime.map((trend, index) => (
                <div key={index} className="flex items-center gap-3 bg-gray-800/40 rounded-lg p-3 border border-gray-700/20">
                  <div className="w-20 text-white/60 text-sm">{formatDate(trend.date)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-white/80 text-sm">{trend.total} decisions</div>
                      <div className="text-red-400 text-sm">{trend.spam} spam</div>
                      <div className="text-green-400 text-sm">{trend.total - trend.spam} legitimate</div>
                    </div>
                    <div className="text-white/60 text-xs">Avg Score: {trend.avgScore.toFixed(1)}%</div>
                  </div>
                  <div className="text-blue-400 text-sm font-medium">
                    {trend.spamRate.toFixed(1)}% spam rate
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
