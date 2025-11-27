import React from 'react';

interface SessionTimerProps {
  timeLeft: number;
  onExtend: () => void;
}

export default function SessionTimer({ timeLeft, onExtend }: SessionTimerProps) {
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  // Color coding based on time remaining
  const getTimeColor = (seconds: number): string => {
    if (seconds > 3600) return 'text-green-400'; // > 1 hour
    if (seconds > 1800) return 'text-yellow-400'; // > 30 minutes
    if (seconds > 600) return 'text-orange-400';  // > 10 minutes
    return 'text-red-400'; // < 10 minutes
  };

  const timeColor = getTimeColor(timeLeft);

  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-white/60">Session:</div>
      <div className={`text-sm font-mono font-medium ${timeColor}`}>
        {formatTime(timeLeft)}
      </div>
      <button
        onClick={onExtend}
        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        title="Extend session by 50 minutes"
      >
        Extend
      </button>
    </div>
  );
}
