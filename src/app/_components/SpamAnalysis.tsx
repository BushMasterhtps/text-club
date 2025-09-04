"use client";

import { useState, useEffect } from 'react';

interface SpamAnalysisProps {
  text: string;
  brand?: string;
  onAnalysis?: (analysis: SpamAnalysisResult) => void;
  showDetails?: boolean;
}

interface SpamAnalysisResult {
  score: number;
  reasons: string[];
  patterns: Array<{
    type: string;
    pattern: string;
    confidence: number;
    examples: string[];
  }>;
  historicalConfidence: number;
  recommendation: 'likely_spam' | 'suspicious' | 'likely_legitimate';
}

export default function SpamAnalysis({ 
  text, 
  brand, 
  onAnalysis, 
  showDetails = false 
}: SpamAnalysisProps) {
  const [analysis, setAnalysis] = useState<SpamAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (text && text.length > 0) {
      analyzeText();
    }
  }, [text, brand]);

  const analyzeText = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/spam/analyze?text=${encodeURIComponent(text)}&brand=${encodeURIComponent(brand || '')}`);
      const data = await response.json();
      
      if (data.success) {
        setAnalysis(data.analysis);
        onAnalysis?.(data.analysis);
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (err) {
      setError('Failed to analyze text');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-red-500/20 border-red-500/30';
    if (score >= 40) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-green-500/20 border-green-500/30';
  };

  const getRecommendationText = (recommendation: string) => {
    switch (recommendation) {
      case 'likely_spam': return 'Likely Spam';
      case 'suspicious': return 'Suspicious';
      case 'likely_legitimate': return 'Likely Legitimate';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/60">
        <div className="w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full animate-spin"></div>
        Analyzing...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400">
        Analysis Error: {error}
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Score Display */}
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${getScoreBg(analysis.score)}`}>
        <span className={`font-bold ${getScoreColor(analysis.score)}`}>
          {analysis.score}%
        </span>
        <span className="text-white/80">
          {getRecommendationText(analysis.recommendation)}
        </span>
        {analysis.historicalConfidence > 0 && (
          <span className="text-xs text-white/60">
            (Historical: {analysis.historicalConfidence.toFixed(0)}%)
          </span>
        )}
      </div>

      {/* Detailed Analysis */}
      {showDetails && (
        <div className="space-y-3 text-sm">
          {/* Reasons */}
          {analysis.reasons.length > 0 && (
            <div>
              <div className="text-white/70 font-medium mb-1">Detection Reasons:</div>
              <ul className="space-y-1">
                {analysis.reasons.map((reason, index) => (
                  <li key={index} className="text-white/60 flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Patterns */}
          {analysis.patterns.length > 0 && (
            <div>
              <div className="text-white/70 font-medium mb-1">Detected Patterns:</div>
              <div className="space-y-2">
                {analysis.patterns.map((pattern, index) => (
                  <div key={index} className="bg-white/5 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-white/10 px-2 py-1 rounded">
                        {pattern.type.replace('_', ' ')}
                      </span>
                      <span className="text-white/60 text-xs">
                        {pattern.confidence.toFixed(0)}% confidence
                      </span>
                    </div>
                    <div className="text-white/80 text-xs">
                      Pattern: {pattern.pattern}
                    </div>
                    {pattern.examples.length > 0 && (
                      <div className="text-white/60 text-xs mt-1">
                        Examples: {pattern.examples.slice(0, 2).join(', ')}
                        {pattern.examples.length > 2 && '...'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
